const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  version: process.versions.electron,
  openTokenCapture: () => ipcRenderer.send('open-token-capture'),
  request: (endpoint, body, headers) => ipcRenderer.invoke('ch:request', { endpoint, body, headers }),
  tokenStatus: () => ipcRenderer.invoke('clubbox:token-get'),
  setAuthToken: (token) => ipcRenderer.invoke('clubbox:token-set', token),
  getGlobalShortcuts: () => ipcRenderer.invoke('clubbox:shortcuts-get'),
  setGlobalShortcuts: (shortcuts) => ipcRenderer.invoke('clubbox:shortcuts-set', shortcuts),
  onGlobalShortcut: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('clubbox:global-shortcut', listener);
    return () => ipcRenderer.removeListener('clubbox:global-shortcut', listener);
  },
  onTokenCaptured: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('clubhouse-token-captured', listener);
    return () => ipcRenderer.removeListener('clubhouse-token-captured', listener);
  },
});
