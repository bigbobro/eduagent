// Electron owns native permissions and the lifetime of the loopback-only server.
const { app, BrowserWindow, ipcMain, Menu, screen, session, shell, systemPreferences, utilityProcess } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const HOST = '127.0.0.1';
const PREFERRED_PORT = Number(process.env.EDUAGENT_PORT) || 38417;
const TEST_MODE = process.env.EDUAGENT_TEST === '1';
const DEV_MODE = !app.isPackaged && process.env.EDUAGENT_DEV_URL;
const MIC_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone';
const RESTART_EXIT_CODE = 75;
let port = PREFERRED_PORT;
let origin = DEV_MODE || `http://${HOST}:${port}`;
let serverProc = null;
let logStream = null;
let mainWindow = null;
let quitting = false;
let crashRestarts = 0;

if (process.env.EDUAGENT_USER_DATA) app.setPath('userData', process.env.EDUAGENT_USER_DATA);
if (TEST_MODE) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
}
const logsDir = () => path.join(app.getPath('userData'), 'logs');
const logPath = () => path.join(logsDir(), 'server.log');
function log(msg) {
  const line = `[desktop ${new Date().toISOString()}] ${msg}\n`;
  if (logStream) logStream.write(line);
  else process.stderr.write(line);
}

function availablePort(preferred) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', (err) => {
      if (preferred && err.code === 'EADDRINUSE') {
        log(`preferred port ${preferred} occupied; selecting a free port`);
        availablePort(0).then(resolve, reject);
      } else reject(err);
    });
    probe.listen(preferred, HOST, () => {
      const selected = probe.address().port;
      probe.close((err) => err ? reject(err) : resolve(selected));
    });
  });
}

function micStatus() {
  const override = TEST_MODE && process.env.EDUAGENT_TEST_MIC_STATUS;
  if (['granted', 'denied', 'not-determined'].includes(override)) return override;
  const status = systemPreferences.getMediaAccessStatus('microphone');
  return status === 'granted' || status === 'not-determined' ? status : 'denied';
}
function isLocalOrigin(url) {
  try { return new URL(url).origin === origin; } catch { return false; }
}
function setupBridge() {
  const handle = (channel, action) => ipcMain.handle(channel, (event) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame || !isLocalOrigin(event.senderFrame.url)) {
      throw new Error('Untrusted desktop IPC sender');
    }
    return action();
  });
  handle('mic:status', () => micStatus());
  handle('mic:request', async () => {
    if (micStatus() !== 'not-determined') return micStatus();
    log('askForMediaAccess requested by microphone UI');
    if (TEST_MODE && process.env.EDUAGENT_TEST_MIC_STATUS === 'not-determined') {
      process.env.EDUAGENT_TEST_MIC_STATUS = 'granted';
    } else if (process.platform === 'darwin') {
      await systemPreferences.askForMediaAccess('microphone');
    }
    return micStatus();
  });
  handle('mic:settings', () => shell.openExternal(MIC_SETTINGS_URL));
  handle('app:info', () => ({ version: app.getVersion() }));
  handle('app:logs', async () => {
    const error = await shell.openPath(logsDir());
    if (error) throw new Error(error);
  });
}

async function showPending() {
  if (mainWindow && !mainWindow.isDestroyed()) await mainWindow.loadFile(path.join(__dirname, 'restarting.html'));
}
function showError(message) {
  const detail = `${message}\n日志:${logPath()}`;
  log(`ERROR ${detail}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    const html = `<meta charset="utf-8"><title>EduAgent 服务错误</title><body style="font:16px system-ui;padding:40px"><h2>EduAgent 启动失败</h2><pre style="white-space:pre-wrap">${detail.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`;
    void mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  }
}
function waitForServer(proc, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (quitting || (proc && serverProc !== proc)) return reject(new Error('Server startup cancelled'));
      const req = http.get(`${origin}/api/settings`, { timeout: 1500, agent: false }, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else retry();
      });
      req.on('error', retry);
      req.on('timeout', () => req.destroy());
    };
    const retry = (error) => {
      if (DEV_MODE) log(`dev readiness retry: ${error?.code || 'HTTP response not ready'}`);
      if (Date.now() > deadline) reject(new Error('服务未能在 30 秒内就绪'));
      else setTimeout(tick, 250);
    };
    tick();
  });
}
async function startServer() {
  await showPending();
  if (quitting) return;
  const dir = app.isPackaged ? path.join(process.resourcesPath, 'server') : path.join(__dirname, 'build', 'server');
  const proc = utilityProcess.fork(path.join(dir, 'eduagent-server.js'), [], {
    cwd: dir,
    env: {
      ...process.env, NODE_ENV: 'production', EDUAGENT_APP: '1', HOST, PORT: String(port),
      DATABASE_PATH: path.join(app.getPath('userData'), 'eduagent.db'),
      EDUAGENT_SETTINGS_PATH: path.join(app.getPath('userData'), 'settings.json'),
    },
    stdio: 'pipe', serviceName: 'eduagent-server',
  });
  serverProc = proc;
  proc.stdout?.on('data', (d) => logStream.write(d));
  proc.stderr?.on('data', (d) => logStream.write(d));
  proc.on('spawn', () => log(`server spawned pid=${proc.pid} port=${port}`));
  proc.on('exit', (code) => {
    log(`server exited code=${code}`);
    if (serverProc !== proc) return;
    serverProc = null;
    if (quitting) { app.quit(); return; }
    if (code === RESTART_EXIT_CODE) {
      log('server requested restart (exit 75), restarting with new settings');
      void startServer().catch((err) => showError(err.message));
    } else if (code !== 0 && crashRestarts++ === 0) {
      log('server crashed; automatic restart 1/1');
      void startServer().catch((err) => showError(err.message));
    } else {
      showError(`服务进程已退出(code=${code}),请退出并重新打开 EduAgent。`);
    }
  });
  try {
    await waitForServer(proc);
    if (serverProc === proc && !quitting && mainWindow && !mainWindow.isDestroyed()) {
      log(`server ready origin=${origin}`);
      await mainWindow.loadURL(origin);
    }
  } catch (err) {
    if (serverProc === proc && !quitting) showError(err.message);
  }
}
function openExternalSafely(url) {
  try {
    const u = new URL(url);
    if ((u.protocol === 'https:' || u.protocol === 'http:') && u.origin !== origin) void shell.openExternal(u.href).catch((err) => log(`external link failed: ${err.message}`));
  } catch {}
}
function setupPermissions() {
  const allowed = (permission, url, mediaTypes) => permission === 'media' && isLocalOrigin(url) && micStatus() === 'granted' && (!mediaTypes || mediaTypes.every((t) => t === 'audio'));
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(allowed(permission, details.requestingUrl || wc.getURL(), details.mediaTypes));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) => {
    return allowed(permission, requestingOrigin, details?.mediaType ? [details.mediaType] : undefined);
  });
}
function createWindow() {
  mainWindow = new BrowserWindow({
    ...restoreWindowState(), show: false,
    minWidth: 1100, minHeight: 720,
    title: 'EduAgent', titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 19 },
    backgroundColor: '#FFF6EE',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  const contents = mainWindow.webContents;
  contents.setZoomFactor(1);
  void contents.setVisualZoomLevelLimits(1, 1).catch((err) => log(`zoom limits failed: ${err.message}`));
  contents.on('did-finish-load', () => contents.setZoomFactor(1));
  contents.on('before-input-event', (event, input) => {
    if ((input.meta || input.control) && (['+', '=', '-', '0'].includes(input.key) || ['Equal', 'Minus', 'Digit0', 'NumpadAdd', 'NumpadSubtract', 'Numpad0'].includes(input.code))) {
      event.preventDefault();
    }
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (restoreWindowState().fullScreen) mainWindow.setFullScreen(true);
  });
  let saveTimer;
  const persist = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveWindowState, 200); };
  for (const event of ['resize', 'move', 'enter-full-screen', 'leave-full-screen']) mainWindow.on(event, persist);
  mainWindow.on('close', () => { clearTimeout(saveTimer); saveWindowState(); });
  // Inputs retain the native edit menu; ordinary content has no browser menu.
  contents.on('context-menu', (_event, params) => {
    if (params.isEditable) Menu.buildFromTemplate([{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }]).popup({ window: mainWindow });
  });
  contents.on('did-finish-load', () => { void refreshLearnerMenu(); });
  contents.on('did-navigate-in-page', () => { void refreshLearnerMenu(); });
  mainWindow.on('focus', () => { void refreshLearnerMenu(); });
  const menuTimer = setInterval(() => { void refreshLearnerMenu(); }, 2000);
  menuTimer.unref();
  mainWindow.on('closed', () => clearInterval(menuTimer));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { openExternalSafely(url); return { action: 'deny' }; });
  const guardNavigation = (e, url) => {
    if (isLocalOrigin(url)) return;
    e.preventDefault();
    openExternalSafely(url);
  };
  mainWindow.webContents.on('will-navigate', guardNavigation);
  mainWindow.webContents.on('will-redirect', guardNavigation);
  mainWindow.on('closed', () => { mainWindow = null; });
}
// Only fixed commands or IDs read from our own learner endpoint reach the renderer.
let menuProfiles = [];
let menuSelection = null;
let refreshingMenu = false;
function sendMenuCommand(command) {
  if (mainWindow && !mainWindow.isDestroyed() && isLocalOrigin(mainWindow.webContents.getURL())) {
    mainWindow.webContents.send('menu:command', command);
  }
}
async function refreshLearnerMenu() {
  if (refreshingMenu || !mainWindow || mainWindow.isDestroyed() || !isLocalOrigin(mainWindow.webContents.getURL())) return;
  refreshingMenu = true;
  try {
    const response = await fetch(`${origin}/api/learners`, { signal: AbortSignal.timeout(1500), redirect: 'error' });
    if (!response.ok) return;
    const profiles = await response.json();
    if (!Array.isArray(profiles) || !profiles.every((p) => typeof p.id === 'string' && /^[a-zA-Z0-9-]+$/.test(p.id) && typeof p.name === 'string')) return;
    // Fixed source, no renderer-provided code, URL, or paths.
    const selection = await mainWindow.webContents.executeJavaScript("localStorage.getItem('eduagent.currentLearnerId')");
    const current = profiles.length === 1 ? profiles[0].id : selection;
    if (JSON.stringify(profiles.map(({ id, name }) => ({ id, name }))) !== JSON.stringify(menuProfiles) || current !== menuSelection) {
      menuProfiles = profiles.map(({ id, name }) => ({ id, name }));
      menuSelection = current;
      buildMenu();
    }
  } catch { /* Startup/restart may temporarily make the endpoint unavailable. */ }
  finally { refreshingMenu = false; }
}
function buildMenu() {
  const navigate = (label, accelerator, command) => ({ label, accelerator, click: () => sendMenuCommand(command) });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'EduAgent', submenu: [
      { label: '关于 EduAgent', role: 'about' },
      navigate('设置…', 'CommandOrControl+,', 'nav:settings'),
      { label: '打开日志文件夹', click: () => { void shell.openPath(logsDir()).then((err) => { if (err) log(`open logs failed: ${err}`); }); } },
      { type: 'separator' }, { label: '隐藏 EduAgent', role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
      { type: 'separator' }, { label: '退出 EduAgent', role: 'quit' },
    ] },
    { label: '编辑', role: 'editMenu' },
    { label: '显示', submenu: [navigate('课程', 'CommandOrControl+1', 'nav:courses'), navigate('学习记录', 'CommandOrControl+2', 'nav:records'), navigate('设置', 'CommandOrControl+3', 'nav:settings'), { type: 'separator' }, { label: '进入全屏', role: 'togglefullscreen' }] },
    { label: '孩子', submenu: [
      ...menuProfiles.map((profile) => ({ label: profile.name.replace(/&/g, '&&'), type: 'checkbox', checked: profile.id === menuSelection, click: () => { menuSelection = profile.id; sendMenuCommand(`learner:${profile.id}`); buildMenu(); } })),
      ...(menuProfiles.length ? [{ type: 'separator' }] : []),
      { label: '新建孩子档案…', click: () => sendMenuCommand('learner:new') },
    ] },
    { label: '窗口', submenu: [{ label: '最小化', role: 'minimize' }, { label: '缩放', role: 'zoom' }, { label: '关闭', role: 'close' }] },
    { label: '帮助', submenu: [{ label: '怎样获取 Key', click: () => sendMenuCommand('nav:settings') }] },
  ]));
}
function restoreWindowState() {
  const fallback = { width: 1280, height: 800 };
  try {
    const state = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'window-state.json'), 'utf8'));
    if (!['x', 'y', 'width', 'height'].every((key) => Number.isSafeInteger(state[key])) || state.width < 1100 || state.height < 720) return fallback;
    const visible = screen.getAllDisplays().some(({ workArea: a }) => state.x >= a.x && state.y >= a.y && state.x + state.width <= a.x + a.width && state.y + 52 <= a.y + a.height);
    if (!visible) return fallback;
    return { x: state.x, y: state.y, width: state.width, height: state.height, fullScreen: state.fullScreen === true };
  } catch { return fallback; }
}
function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const file = path.join(app.getPath('userData'), 'window-state.json');
    fs.writeFileSync(`${file}.tmp`, JSON.stringify({ ...mainWindow.getNormalBounds(), fullScreen: mainWindow.isFullScreen() }));
    fs.renameSync(`${file}.tmp`, file);
  } catch (error) { log(`window state save failed: ${error.message}`); }
}
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });
  app.whenReady().then(async () => {
    fs.mkdirSync(logsDir(), { recursive: true });
    if (fs.existsSync(logPath()) && fs.statSync(logPath()).size > 5 * 1024 * 1024) fs.renameSync(logPath(), `${logPath()}.1`);
    logStream = fs.createWriteStream(logPath(), { flags: 'a' });
    log(`app start packaged=${app.isPackaged} version=${app.getVersion()} electron=${process.versions.electron} node=${process.versions.node}`);
    log(`microphone status=${micStatus()} (no startup request)`);
    if (!DEV_MODE) {
      port = await availablePort(PREFERRED_PORT);
      origin = `http://${HOST}:${port}`;
    }
    log(`local origin=${origin}`);
    app.setAboutPanelOptions({ applicationName: 'EduAgent', applicationVersion: app.getVersion(), credits: '麻吉陪孩子一起练习英语。' });
    buildMenu(); setupBridge(); setupPermissions(); createWindow();
    if (DEV_MODE) { await showPending(); await waitForServer(null); await mainWindow.loadURL(origin); log(`dev window loaded origin=${origin}`); }
    else await startServer();
  }).catch((err) => showError(err.message));
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (quitting || !serverProc) return;
    event.preventDefault();
    quitting = true;
    const proc = serverProc;
    const pid = proc.pid;
    log(`app quitting; stopping server pid=${pid}`);
    proc.kill();
    setTimeout(() => {
      if (serverProc === proc) { try { process.kill(pid, 'SIGKILL'); } catch {} app.quit(); }
    }, 3000).unref();
  });
}
