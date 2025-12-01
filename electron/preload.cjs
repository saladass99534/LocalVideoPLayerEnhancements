const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // System Info
  getTailscaleStatus: () => ipcRenderer.invoke('get-tailscale-status'),
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),
  setWindowOpacity: (opacity) => ipcRenderer.send('set-window-opacity', opacity),
  
  // NEW: File Pickers
  openVideoFile: () => ipcRenderer.invoke('open-video-file'),
  openSubtitleFile: () => ipcRenderer.invoke('open-subtitle-file'),
  getVideoDuration: (filePath) => ipcRenderer.invoke('get-video-duration', filePath),

  // Web Server
  toggleWebServer: (enable) => ipcRenderer.send('toggle-web-server', enable),
  
  // Host-side logic
  startHostServer: (port) => ipcRenderer.send('start-host-server', port),
  stopHostServer: () => ipcRenderer.send('stop-host-server'),
  onHostServerStarted: (cb) => ipcRenderer.on('host-server-started', (e, ...args) => cb(...args)),
  onHostClientConnected: (cb) => ipcRenderer.on('host-client-connected', (e, ...args) => cb(...args)),
  onHostClientDisconnected: (cb) => ipcRenderer.on('host-client-disconnected', (e, ...args) => cb(...args)),
  onHostSignalReceived: (cb) => ipcRenderer.on('host-signal-received', (e, ...args) => cb(...args)),
  hostSendSignal: (socketId, data) => ipcRenderer.send('host-send-signal', { socketId, data }),

  // Guest-side logic
  connectToHost: (ip, port) => ipcRenderer.send('connect-to-host', ip, port),
  onGuestConnected: (cb) => ipcRenderer.on('guest-connected', cb),
  onGuestSignalReceived: (cb) => ipcRenderer.on('guest-signal-received', (e, ...args) => cb(...args)),
  onGuestError: (cb) => ipcRenderer.on('guest-error', (e, ...args) => cb(...args)),
  onGuestDisconnected: (cb) => ipcRenderer.on('guest-disconnected', cb),
  guestSendSignal: (data) => ipcRenderer.send('guest-send-signal', data),

  // Cleanup
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
