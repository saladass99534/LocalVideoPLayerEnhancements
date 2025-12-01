const { app, BrowserWindow, ipcMain, desktopCapturer, dialog } = require('electron'); 
const path = require('path');
const { exec } = require('child_process');
const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');
const ffprobePath = require('ffprobe-static').path.replace('app.asar', 'app.asar.unpacked');

// Set FFmpeg paths
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// KEEP DISABLED: HW Acceleration causes decoder cache bugs during seeking
app.disableHardwareAcceleration();

let mainWindow;
let wss; 
let guestWs; 
const connectedClients = new Map();

// --- WEB SERVER FOR MOBILE/WEB VIEWERS & LOCAL STREAMING ---
const expressApp = express();
const httpServer = http.createServer(expressApp);
const WEB_PORT = 8080;

function startWebServer() {
  const distPath = path.join(__dirname, '../dist');
  
  expressApp.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
      next();
  });

  expressApp.use(express.static(distPath));

  // --- VIDEO STREAMING ENDPOINT ---
  expressApp.get('/stream', (req, res) => {
      const filePath = req.query.file;
      const startTime = req.query.startTime || 0; 

      if (!filePath || !fs.existsSync(filePath)) {
          return res.status(404).send('File not found');
      }

      ffmpeg.ffprobe(filePath, (err, metadata) => {
          if (err) {
              console.error("FFprobe Error:", err);
              return res.status(500).send('Error analyzing file');
          }

          // SWITCH TO WEBM: The "Silver Bullet" for Chrome Streaming
          res.contentType('video/webm');

          const command = ffmpeg(filePath)
              .inputOptions([
                  `-ss ${startTime}`,       // Input seeking (fast & accurate)
                  '-re'                     // Read at native framerate
              ])
              .format('webm')               // Container: WebM (Much more robust than MP4 for streaming)
              .on('error', (err) => {
                  if (err.message && !err.message.includes('Output stream closed')) {
                      console.error('FFmpeg Error:', err);
                  }
              });

          // VIDEO: VP8 (libvpx)
          // VP8 is Google's native codec. It handles "mid-stream" playback perfectly.
          command.videoCodec('libvpx')
                  .outputOptions([
                      '-deadline realtime', // Critical for live transcoding speed
                      '-cpu-used 4',        // Balance between speed and quality (0-5)
                      '-b:v 4000k',         // 4Mbps Bitrate (High Quality)
                      '-maxrate 6000k',     // Cap peaks
                      '-bufsize 12000k',    // Buffer size
                      '-qmin 10',           // Prevent blocky compression
                      '-qmax 42',
                      '-g 60',              // Keyframe every 2s is fine for WebM
                      '-error-resilient 1'  // Helps browser recover if a frame is malformed
                  ])
                  // Ensure dimensions are even (VP8 requires this)
                  .videoFilters('scale=trunc(iw/2)*2:trunc(ih/2)*2');

          // AUDIO: Vorbis (libvorbis)
          // Vorbis is the native audio pair for WebM. Zero sync issues.
          command.audioCodec('libvorbis')
                 .audioChannels(2)
                 .audioFrequency(44100)
                 .audioBitrate('128k');

          command.pipe(res, { end: true });

          req.on('close', () => {
              try { command.kill(); } catch(e) {}
          });
      });
  });

  expressApp.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  httpServer.listen(WEB_PORT, '0.0.0.0', () => {
    console.log(`Web Server running at http://0.0.0.0:${WEB_PORT}`);
  });
  
  httpServer.on('error', (e) => {
      console.error("Web Server Error:", e);
  });
}

function stopWebServer() {
    if (httpServer.listening) {
        httpServer.close(() => {
            console.log('Web Server stopped');
        });
    }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    fullscreen: true,
    show: false,        
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, 
      webSecurity: false 
    },
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    title: "SheiyuWatch"
  });

  mainWindow.maximize();
  mainWindow.show();

  const isDev = process.env.npm_lifecycle_event === 'electron:dev';
  
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

if (process.platform === 'darwin') {
    app.commandLine.appendSwitch('enable-features', 'MacLoopbackAudioForScreenShare,MacSckSystemAudioLoopbackOverride');
}

app.whenReady().then(() => {
  startWebServer(); 
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers ---

ipcMain.on('toggle-web-server', (event, enable) => { });

ipcMain.on('set-window-opacity', (event, opacity) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setOpacity(opacity);
    }
});

// --- FILE PICKER HANDLERS ---

ipcMain.handle('open-video-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Movies', extensions: ['mp4', 'mkv', 'webm', 'mov', 'm4v', 'ts', 'mts', 'avi', 'flv', 'wmv'] }]
  });
  if (canceled) {
    return null;
  } else {
    return filePaths[0];
  }
});

ipcMain.handle('get-video-duration', async (event, filePath) => {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                console.error("FFprobe error:", err);
                resolve(0);
            } else {
                resolve(metadata.format.duration || 0);
            }
        });
    });
});

ipcMain.handle('open-subtitle-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Subtitles', extensions: ['vtt', 'srt'] }]
  });
  
  if (canceled || filePaths.length === 0) {
    return null;
  }

  const filePath = filePaths[0];
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { path: filePath, content: content };
  } catch (e) {
    console.error("Failed to read subtitle file", e);
    return null;
  }
});

ipcMain.handle('get-tailscale-status', async () => {
  return new Promise((resolve, reject) => {
    const isMac = process.platform === 'darwin';
    const possiblePaths = isMac ? [
      '/Applications/Tailscale.app/Contents/MacOS/Tailscale', 
      '/usr/local/bin/tailscale', 
      '/opt/homebrew/bin/tailscale', 
      'tailscale' 
    ] : [ 'tailscale', 'C:\\Program Files\\Tailscale\\tailscale.exe' ];

    const tryPath = (index) => {
      if (index >= possiblePaths.length) {
        resolve({}); 
        return;
      }
      const pathStr = possiblePaths[index];
      const cmd = pathStr.includes(' ') ? `"${pathStr}"` : pathStr;
      
      exec(`${cmd} status --json`, (error, stdout, stderr) => {
        if (!error && stdout) {
          try { resolve(JSON.parse(stdout)); return; } catch (e) { }
        }
        tryPath(index + 1);
      });
    };
    tryPath(0);
  });
});

ipcMain.handle('get-desktop-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({ 
      types: ['window', 'screen'],
      thumbnailSize: { width: 1920, height: 1080 },
      fetchWindowIcons: true 
    });
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL()
    }));
  } catch (error) {
    console.error("Error getting desktop sources:", error);
    return [];
  }
});

// --- HOST LOGIC ---

ipcMain.on('start-host-server', (event, port) => {
  try {
    if (wss) { wss.close(); connectedClients.clear(); }
    wss = new WebSocket.Server({ port: port || 65432 });

    wss.on('listening', () => {
      console.log(`Host signaling server started on port ${port || 65432}`);
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('host-server-started', { success: true, port: port || 65432 });
    });

    wss.on('connection', (ws) => {
      const socketId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
      connectedClients.set(socketId, ws);
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('host-client-connected', { socketId });

      ws.on('message', (message) => {
        try {
          const parsed = JSON.parse(message);
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('host-signal-received', { socketId, data: parsed });
        } catch (e) { console.error("Error parsing message", e); }
      });

      ws.on('close', () => {
        connectedClients.delete(socketId);
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('host-client-disconnected', { socketId });
      });
    });
  } catch (error) {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('host-server-started', { success: false, error: error.message });
  }
});

ipcMain.on('stop-host-server', () => {
    if (wss) {
        connectedClients.forEach((ws) => ws.terminate());
        connectedClients.clear();
        wss.close();
        wss = null;
    }
});

ipcMain.on('host-send-signal', (event, { socketId, data }) => {
  const ws = connectedClients.get(socketId);
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
});

// --- GUEST LOGIC ---

ipcMain.on('connect-to-host', (event, ip, port) => {
  if (guestWs) guestWs.terminate();
  const url = `ws://${ip}:${port || 65432}`;
  try {
    guestWs = new WebSocket(url);
    guestWs.on('open', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('guest-connected'); });
    guestWs.on('message', (data) => {
      try {
        const parsed = JSON.parse(data);
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('guest-signal-received', parsed);
      } catch (e) { console.error("Guest parse error", e); }
    });
    guestWs.on('error', (err) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('guest-error', err.message); });
    guestWs.on('close', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('guest-disconnected'); });
  } catch (error) {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('guest-error', error.message);
  }
});

ipcMain.on('guest-send-signal', (event, data) => {
  if (guestWs && guestWs.readyState === WebSocket.OPEN) guestWs.send(JSON.stringify(data));
});
