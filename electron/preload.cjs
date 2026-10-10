const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  version: process.versions.electron,
  openTokenCapture: () => ipcRenderer.send('open-token-capture'),
  request: (endpoint, body, headers) => ipcRenderer.invoke('ch:request', { endpoint, body, headers }),
  onTokenCaptured: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('clubhouse-token-captured', listener);
    return () => ipcRenderer.removeListener('clubhouse-token-captured', listener);
  },
});
