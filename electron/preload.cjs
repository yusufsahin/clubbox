const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  forceSandbox: process.env.CLUBBOX_FORCE_SANDBOX === '1',
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
  openOfficialSignIn: (bounds) => ipcRenderer.invoke('clubbox:open-signin', bounds),
  closeOfficialSignIn: () => ipcRenderer.invoke('clubbox:close-signin'),
  showEmbeddedSignIn: (bounds) => ipcRenderer.invoke('clubbox:embedded-signin-show', bounds),
  hideEmbeddedSignIn: () => ipcRenderer.invoke('clubbox:embedded-signin-hide'),
  setEmbeddedSignInBounds: (bounds) => ipcRenderer.invoke('clubbox:embedded-signin-set-bounds', bounds),
  hasWebSession: () => ipcRenderer.invoke('clubbox:has-web-session'),
  onWebSessionMaybe: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('clubbox:web-session-maybe', listener);
    return () => ipcRenderer.removeListener('clubbox:web-session-maybe', listener);
  },
  onSignInProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('clubbox:signin-progress', listener);
    return () => ipcRenderer.removeListener('clubbox:signin-progress', listener);
  },
  onAgoraAppId: (callback) => {
    const listener = (_event, appId) => callback(appId);
    ipcRenderer.on('clubbox:agora-app-id', listener);
    return () => ipcRenderer.removeListener('clubbox:agora-app-id', listener);
  },
  clearWebSession: () => ipcRenderer.invoke('clubbox:clear-web-session'),
  setZoomFactor: (factor) => ipcRenderer.invoke('clubbox:set-zoom', factor),
  setNativeThemeSource: (source) => ipcRenderer.invoke('clubbox:set-native-theme', source),
  showDesktopNotification: (payload) => ipcRenderer.invoke('clubbox:desktop-notification', payload),
  appendApiLog: (record) => ipcRenderer.invoke('clubbox:api-log-append', record),
  runApiTriage: () => ipcRenderer.invoke('clubbox:run-api-triage'),
  pubnubSubscribe: (params) => ipcRenderer.invoke('clubbox:pubnub-subscribe', params),
  pubnubResubscribe: () => ipcRenderer.invoke('clubbox:pubnub-resubscribe'),
  pubnubUnsubscribe: () => ipcRenderer.invoke('clubbox:pubnub-unsubscribe'),
  ensureRealtimeConfig: () => ipcRenderer.invoke('clubbox:ensure-realtime-config'),
  connectionStatus: () => ipcRenderer.invoke('clubbox:connection-status'),
  micAccessStatus: () => ipcRenderer.invoke('clubbox:mic-access-status'),
  openMicrophoneSettings: () => ipcRenderer.invoke('clubbox:open-mic-settings'),
  openAgoraAbRoom: (channel) => ipcRenderer.invoke('clubbox:open-agora-ab-room', { channel }),
  /** Channel id only — main writes last-room.json and owns the quit-time leave. */
  reportRoomPresence: (payload) => {
    const left = !!(payload && payload.left === true);
    const channel = payload && typeof payload.channel === 'string' ? payload.channel : '';
    ipcRenderer.send('clubbox:room-presence', { left, channel });
  },
  /** Phase 24.6: main asks renderer to leave/rejoin Agora (quit/close/suspend/resume). */
  onAgoraLifecycle: (callback) => {
    const listener = (_event, payload) => {
      Promise.resolve(callback(payload || {}))
        .catch(() => {})
        .finally(() => {
          ipcRenderer.send('clubbox:agora-lifecycle-done', { ok: true });
        });
    };
    ipcRenderer.on('clubbox:agora-lifecycle', listener);
    return () => ipcRenderer.removeListener('clubbox:agora-lifecycle', listener);
  },
  onPubNubMessage: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('clubbox:pubnub-message', listener);
    return () => ipcRenderer.removeListener('clubbox:pubnub-message', listener);
  },
  onPubNubStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('clubbox:pubnub-status', listener);
    return () => ipcRenderer.removeListener('clubbox:pubnub-status', listener);
  },
  onRealtimeConfig: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('clubbox:realtime-config', listener);
    return () => ipcRenderer.removeListener('clubbox:realtime-config', listener);
  },
});
