// EduAgent 桌面壳(Phase 0 spike 最小版)。
// 职责:启动本地 server 子进程 -> 等端口就绪 -> 打开窗口;麦克风权限;退出时清理子进程。
const { app, BrowserWindow, Menu, session, shell, systemPreferences, utilityProcess } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const HOST = '127.0.0.1';
const PORT = Number(process.env.EDUAGENT_PORT) || 38417;
const ORIGIN = `http://${HOST}:${PORT}`;
const TEST_MODE = process.env.EDUAGENT_TEST === '1';

// 测试专用:覆盖 userData,并用 Chromium 假麦克风(不弹系统授权框)。
if (process.env.EDUAGENT_USER_DATA) app.setPath('userData', process.env.EDUAGENT_USER_DATA);
if (TEST_MODE) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
}

let serverProc = null;
let logStream = null;
let mainWindow = null;
let quitting = false;

function log(msg) {
  const line = `[desktop ${new Date().toISOString()}] ${msg}\n`;
  if (logStream) logStream.write(line);
  else process.stderr.write(line);
}

function serverDir() {
  return app.isPackaged ? path.join(process.resourcesPath, 'server') : path.join(__dirname, 'build', 'server');
}

function startServer() {
  const dir = serverDir();
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    EDUAGENT_APP: '1',
    HOST,
    PORT: String(PORT),
    DATABASE_PATH: path.join(app.getPath('userData'), 'eduagent.db'),
    // spike 固定 mock;config 校验仍要求这些变量非空,值是占位符,不是凭据。Phase 1 会让配置可缺省。
    VOICE_MOCK: 'true',
    LLM_API_KEY: 'mock-placeholder',
    DOUBAO_APP_ID: 'mock-placeholder',
    DOUBAO_ACCESS_KEY: 'mock-placeholder',
    DOUBAO_ASR_RESOURCE_ID: 'mock-placeholder',
    DOUBAO_TTS_RESOURCE_ID: 'mock-placeholder',
    DOUBAO_TTS_DEFAULT_SPEAKER: 'mock-placeholder',
  };
  serverProc = utilityProcess.fork(path.join(dir, 'eduagent-server.js'), [], {
    cwd: dir,
    env,
    stdio: 'pipe',
    serviceName: 'eduagent-server',
  });
  serverProc.stdout?.on('data', (d) => logStream.write(d));
  serverProc.stderr?.on('data', (d) => logStream.write(d));
  serverProc.on('spawn', () => log(`server spawned pid=${serverProc.pid}`));
  serverProc.on('exit', (code) => {
    log(`server exited code=${code}`);
    serverProc = null;
    if (!quitting) showError(`服务进程已退出(code=${code})。日志:${path.join(app.getPath('userData'), 'logs', 'server.log')}`);
  });
}

function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get({ host: HOST, port: PORT, path: '/', timeout: 1500 }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', retry);
      req.on('timeout', () => req.destroy());
    };
    const retry = () => {
      if (Date.now() > deadline) reject(new Error('server did not become ready in time'));
      else setTimeout(tick, 250);
    };
    tick();
  });
}

function showError(message) {
  log(`ERROR ${message}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    const html = `<meta charset="utf-8"><body style="font:16px system-ui;padding:40px"><h2>EduAgent 启动失败</h2><pre style="white-space:pre-wrap">${message.replace(/</g, '&lt;')}</pre>`;
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  }
}

function isLocalOrigin(url) {
  try {
    return new URL(url).origin === ORIGIN;
  } catch {
    return false;
  }
}

function setupPermissions() {
  const ses = session.defaultSession;
  // 只对本地 origin 放行麦克风(media),其余一律拒绝。
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(permission === 'media' && isLocalOrigin(details.requestingUrl || wc.getURL()));
  });
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin) => {
    return permission === 'media' && isLocalOrigin(requestingOrigin);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isLocalOrigin(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('data:') && !isLocalOrigin(url)) e.preventDefault();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'close' }] },
    ]),
  );
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    const logDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    logStream = fs.createWriteStream(path.join(logDir, 'server.log'), { flags: 'a' });
    log(`app start packaged=${app.isPackaged} version=${app.getVersion()} electron=${process.versions.electron} node=${process.versions.node}`);

    buildMenu();
    setupPermissions();
    createWindow();
    startServer();

    // 进课前申请系统级麦克风权限;测试模式用 Chromium 假设备,不触发系统弹窗。
    if (process.platform === 'darwin' && !TEST_MODE) {
      const status = systemPreferences.getMediaAccessStatus('microphone');
      log(`microphone status=${status}`);
      if (status === 'not-determined') {
        const granted = await systemPreferences.askForMediaAccess('microphone');
        log(`askForMediaAccess granted=${granted}`);
      }
    }

    try {
      await waitForServer();
      log('server ready');
      await mainWindow.loadURL(ORIGIN);
    } catch (err) {
      showError(String(err && err.message ? err.message : err));
    }
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    quitting = true;
    if (serverProc) serverProc.kill();
  });
}
