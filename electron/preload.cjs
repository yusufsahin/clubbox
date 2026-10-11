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
  openOfficialSignIn: () => ipcRenderer.invoke('clubbox:open-signin'),
  closeOfficialSignIn: () => ipcRenderer.invoke('clubbox:close-signin'),
  onWebSessionMaybe: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('clubbox:web-session-maybe', listener);
    return () => ipcRenderer.removeListener('clubbox:web-session-maybe', listener);
  },
  onAgoraAppId: (callback) => {
    const listener = (_event, appId) => callback(appId);
    ipcRenderer.on('clubbox:agora-app-id', listener);
    return () => ipcRenderer.removeListener('clubbox:agora-app-id', listener);
  },
  clearWebSession: () => ipcRenderer.invoke('clubbox:clear-web-session'),
});
