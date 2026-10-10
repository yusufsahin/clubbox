const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  version: process.versions.electron,
  request: (endpoint, body, headers) => ipcRenderer.invoke('ch:request', { endpoint, body, headers }),
  getGlobalShortcuts: () => ipcRenderer.invoke('clubbox:shortcuts-get'),
  setGlobalShortcuts: (shortcuts) => ipcRenderer.invoke('clubbox:shortcuts-set', shortcuts),
  onGlobalShortcut: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('clubbox:global-shortcut', listener);
    return () => ipcRenderer.removeListener('clubbox:global-shortcut', listener);
  },
});
