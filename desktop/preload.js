const { contextBridge, ipcRenderer } = require('electron');

// Fixed, argument-free methods only. No raw IPC, file paths or URL input.
contextBridge.exposeInMainWorld('eduagentDesktop', {
  getMicStatus: () => ipcRenderer.invoke('mic:status'),
  requestMic: () => ipcRenderer.invoke('mic:request'),
  openMicSettings: () => ipcRenderer.invoke('mic:settings'),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  openLogsFolder: () => ipcRenderer.invoke('app:logs'),
});
