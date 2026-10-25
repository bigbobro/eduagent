const { contextBridge, ipcRenderer } = require('electron');

// Fixed native methods and one read-only, validated menu subscription.
contextBridge.exposeInMainWorld('eduagentDesktop', {
  onMenuCommand: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('Expected menu callback');
    const listener = (_event, command) => {
      if (typeof command === 'string' && (/^nav:(courses|records|settings)$/.test(command) || command === 'learner:new' || /^learner:[a-zA-Z0-9-]+$/.test(command))) callback(command);
    };
    ipcRenderer.on('menu:command', listener);
    return () => ipcRenderer.removeListener('menu:command', listener);
  },
  getMicStatus: () => ipcRenderer.invoke('mic:status'),
  requestMic: () => ipcRenderer.invoke('mic:request'),
  openMicSettings: () => ipcRenderer.invoke('mic:settings'),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  openLogsFolder: () => ipcRenderer.invoke('app:logs'),
});
