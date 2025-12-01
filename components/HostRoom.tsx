
import React, { useState, useEffect, useRef } from 'react'; 
import SimplePeer from 'simple-peer'; 
import {  
  Users, Copy, Check, Tv, Maximize, Minimize, Volume2, VolumeX, 
  ScreenShare, ScreenShareOff, Power, Crown, X, Smile, Image as ImageIcon, ArrowLeft, Zap, Send, 
  Monitor, AppWindow, AlertTriangle, AlertCircle, Wifi, HelpCircle, 
  Activity, RefreshCw, Globe, RotateCcw, Clapperboard, PictureInPicture, 
  FileVideo, Trash2, Play, Pause, Captions, Plus, Pin 
} from 'lucide-react'; 
import { Button } from './Button'; 
import { Chat, ChatHandle } from './Chat'; 
import { ChatMessage, generateRandomName, Member, ReplyContext, DesktopSource, StreamStats, FloatingEmoji } from '../types'; 
import { MOVIE_DB, SHOW_DB, GENRES, Genre, MediaType } from '../movieData'; 

interface HostRoomProps { 
  onBack: () => void; 
} 

type SidebarTab = 'chat' | 'members'; 

const srtToVtt = (srtText: string) => { 
    if (!srtText) return ""; 
    return "WEBVTT\n\n" + srtText 
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2') 
      .replace(/\{\\([ibu])\}/g, '</$1>') 
      .replace(/\{\\([ibu])1\}/g, '<$1>')  
      .replace(/\{([ibu])\}/g, '<$1>') 
      .replace(/\{\/([ibu])\}/g, '</$1>'); 
}; 

const THEMES: Record<string, { primary: string, glow: string, border: string, bg: string, accent: string }> = { 
  default: { primary: 'text-blue-400', glow: 'shadow-blue-500/50', border: 'border-blue-500/30', bg: 'bg-blue-500', accent: 'accent-blue-500' }, 
  Action: { primary: 'text-yellow-400', glow: 'shadow-yellow-500/50', border: 'border-yellow-500/30', bg: 'bg-yellow-500', accent: 'accent-yellow-500' }, 
  'Sci-Fi': { primary: 'text-cyan-400', glow: 'shadow-cyan-500/50', border: 'border-cyan-500/30', bg: 'bg-cyan-500', accent: 'accent-cyan-500' }, 
  Horror: { primary: 'text-red-500', glow: 'shadow-red-600/50', border: 'border-red-600/30', bg: 'bg-red-600', accent: 'accent-red-600' }, 
  Comedy: { primary: 'text-orange-400', glow: 'shadow-orange-500/50', border: 'border-orange-500/30', bg: 'bg-orange-500', accent: 'accent-orange-500' }, 
  Romance: { primary: 'text-pink-400', glow: 'shadow-pink-500/50', border: 'border-pink-500/30', bg: 'bg-pink-500', accent: 'accent-pink-500' }, 
  Anime: { primary: 'text-purple-400', glow: 'shadow-purple-500/50', border: 'border-purple-500/30', bg: 'bg-purple-500', accent: 'accent-purple-500' }, 
  Thriller: { primary: 'text-emerald-400', glow: 'shadow-emerald-500/50', border: 'border-emerald-500/30', bg: 'bg-emerald-500', accent: 'accent-emerald-500' }, 
}; 

// --- STRICT VP9 PRIORITIZATION LOGIC ---
const setVideoBitrate = (sdp: string, bitrate: number): string => {
    let sdpLines = sdp.split('\r\n');
    let videoMLineIndex = -1;

    // 1. Find m=video line
    for (let i = 0; i < sdpLines.length; i++) {
        if (sdpLines[i].startsWith('m=video')) {
            videoMLineIndex = i;
            break;
        }
    }

    if (videoMLineIndex === -1) return sdp;

    // 2. Identify VP9 Payload Type
    let vp9PayloadType = -1;
    let h264PayloadType = -1;
     
    for (const line of sdpLines) {
        if (line.startsWith('a=rtpmap:')) {
            if (line.includes('VP9/90000')) {
                const match = line.match(/a=rtpmap:(\d+) VP9/);
                if (match) vp9PayloadType = parseInt(match[1], 10);
            } else if (line.includes('H264/90000')) {
                const match = line.match(/a=rtpmap:(\d+) H264/);
                if (match && h264PayloadType === -1) h264PayloadType = parseInt(match[1], 10);
            }
        }
    }

    // 3. Force VP9 Priority (Reorder m=video line)
    if (vp9PayloadType !== -1) {
        const mLineParts = sdpLines[videoMLineIndex].split(' ');
        const header = mLineParts.slice(0, 3);
        let payloads = mLineParts.slice(3);
         
        // Remove VP9 from current position and put it first
        payloads = payloads.filter(p => parseInt(p) !== vp9PayloadType);
        payloads.unshift(vp9PayloadType.toString());
         
        sdpLines[videoMLineIndex] = [...header, ...payloads].join(' ');
    }

    // 4. Apply Bitrate Limit
    if (bitrate > 0) {
        sdpLines = sdpLines.filter(line => !line.startsWith('b=AS:'));
        sdpLines.splice(videoMLineIndex + 1, 0, `b=AS:${bitrate}`);
         
        // Apply strict google params to preferred codec
        const targetPayload = vp9PayloadType !== -1 ? vp9PayloadType : h264PayloadType;
        if (targetPayload !== -1) {
            let fmtpIndex = sdpLines.findIndex(l => l.startsWith(`a=fmtp:${targetPayload}`));
            const params = `x-google-min-bitrate=${bitrate};x-google-start-bitrate=${bitrate};x-google-max-bitrate=${bitrate}`;
             
            if (fmtpIndex !== -1) {
                if (!sdpLines[fmtpIndex].includes('x-google-min-bitrate')) {
                    sdpLines[fmtpIndex] += `; ${params}`;
                }
            } else {
                const rtpMapIndex = sdpLines.findIndex(l => l.startsWith(`a=rtpmap:${targetPayload}`));
                if (rtpMapIndex !== -1) {
                    sdpLines.splice(rtpMapIndex + 1, 0, `a=fmtp:${targetPayload} ${params}`);
                }
            }
        }
    }
    return sdpLines.join('\r\n');
};

export const HostRoom: React.FC<HostRoomProps> = ({ onBack }) => { 
  const [isRoomStarted, setIsRoomStarted] = useState(false); 
  const [myIp, setMyIp] = useState(''); 
  const [isInitializing, setIsInitializing] = useState(false); 
  const [isWebStreamEnabled, setIsWebStreamEnabled] = useState(true); 

  const [username] = useState(generateRandomName()); 
  const [currentTheme, setCurrentTheme] = useState<keyof typeof THEMES>('default'); 
    
  const [activeTab, setActiveTab] = useState<SidebarTab>('chat'); 
  const [showControls, setShowControls] = useState(true); 
  const [isInputFocused, setIsInputFocused] = useState(false); 
  const [isInputIdle, setIsInputIdle] = useState(false); 
  const [isTheaterMode, setIsTheaterMode] = useState(false); 
  const [isFullscreen, setIsFullscreen] = useState(false); 
  const [showExitConfirm, setShowExitConfirm] = useState(false); 
  const [showNerdStats, setShowNerdStats] = useState(false); 
    
  const [seenTitles, setSeenTitles] = useState<Set<string>>(new Set()); 
  const [activeMediaType, setActiveMediaType] = useState<MediaType>('Movie'); 
  const [pickerStep, setPickerStep] = useState<'idle' | 'type' | 'genre' | 'reveal'>('idle'); 

  const pickerStepRef = useRef(pickerStep); 
  const activeMediaTypeRef = useRef(activeMediaType); 
  const seenTitlesRef = useRef(seenTitles); 
  const inputIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); 

  useEffect(() => { pickerStepRef.current = pickerStep; }, [pickerStep]); 
  useEffect(() => { activeMediaTypeRef.current = activeMediaType; }, [activeMediaType]); 
  useEffect(() => { seenTitlesRef.current = seenTitles; }, [seenTitles]); 

  const [videoFilters, setVideoFilters] = useState({ brightness: 100, contrast: 100, saturate: 100 }); 
    
  const [showSourceSelector, setShowSourceSelector] = useState(false); 
  const [availableSources, setAvailableSources] = useState<DesktopSource[]>([]); 
  const [sourceTab, setSourceTab] = useState<'screen' | 'window' | 'file'>('screen'); 
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null); 
  const [isRefreshingSources, setIsRefreshingSources] = useState(false); 
    
  const [fileStreamUrl, setFileStreamUrl] = useState<string | null>(null); 
  const [fileRawPath, setFileRawPath] = useState<string | null>(null);
  const fileVideoRef = useRef<HTMLVideoElement>(null);    
  const audioContextRef = useRef<AudioContext | null>(null); 
  const audioSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null); 

  const [movieTitle, setMovieTitle] = useState<string>(""); 

  const [duration, setDuration] = useState(0); 
  const [currentTime, setCurrentTime] = useState(0); 
  // Virtual Time Offset: The time at which the current FFmpeg stream starts
  const [streamOffset, setStreamOffset] = useState(0);

  const [isPlayingFile, setIsPlayingFile] = useState(false); 
  const [showCCMenu, setShowCCMenu] = useState(false); 
  const [ccSize, setCcSize] = useState<'small' | 'medium' | 'large'>('medium'); 
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null); 

  const [currentSubtitleText, setCurrentSubtitleText] = useState(''); 

  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]); 
  const [audioSource, setAudioSource] = useState<string>('system');    
  const [streamQuality, setStreamQuality] = useState<'1080p' | '1440p' | '4k'>('1080p'); 
  const [streamFps, setStreamFps] = useState<30 | 60>(60); 
  const [streamBitrate, setStreamBitrate] = useState<number>(0); 
  const [browserFix, setBrowserFix] = useState(false); 
  const streamBitrateRef = useRef(streamBitrate); 
  useEffect(() => { streamBitrateRef.current = streamBitrate; }, [streamBitrate]); 
  const [showAudioHelp, setShowAudioHelp] = useState(false); 

  const [isSharing, setIsSharing] = useState(false); 
  const [localVolume, setLocalVolume] = useState(0.5); 

  const [stats, setStats] = useState<StreamStats>({ resolution: 'N/A', bitrate: '0', fps: 0, packetLoss: '0', latency: '0' }); 
    
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]); 
  const [messages, setMessages] = useState<ChatMessage[]>([]); 
  const [members, setMembers] = useState<Member[]>([]); 

  const peersRef = useRef<Map<string, SimplePeer.Instance>>(new Map()); 
  const videoRef = useRef<HTMLVideoElement>(null); 
  const ambilightRef = useRef<HTMLVideoElement>(null); 
  const streamRef = useRef<MediaStream | null>(null); 
  const containerRef = useRef<HTMLDivElement>(null); 
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); 
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null); 
  const chatRef = useRef<ChatHandle>(null); 
  const lastStatsRef = useRef<{ timestamp: number; bytesSent: number } | null>(null); 

  const electronAvailable = typeof window !== 'undefined' && window.electron !== undefined; 
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0; 
  const activeTheme = THEMES[currentTheme] || THEMES['default']; 

  useEffect(() => {  
      broadcast({ type: 'cc_size', payload: ccSize });  
  }, [ccSize]);  

  useEffect(() => { 
    const video = fileVideoRef.current; 
    if (!video || !subtitleUrl) return; 

    const timer = setTimeout(() => { 
        if (video.textTracks && video.textTracks.length > 0) { 
            for (let i = 0; i < video.textTracks.length; i++) { 
                const track = video.textTracks[i]; 
                if (track.mode === 'showing' || track.kind === 'subtitles') { 
                    track.mode = 'hidden';  
                    track.oncuechange = () => { 
                        const activeCues = track.activeCues; 
                        if (activeCues && activeCues.length > 0) { 
                            // @ts-ignore 
                            const rawText = activeCues[0].text; 
                            const cleanText = rawText.replace(/<[^>]*>/g, '');  
                            setCurrentSubtitleText(cleanText); 
                            broadcast({ type: 'subtitle_update', payload: cleanText }); 
                        } else { 
                            setCurrentSubtitleText(''); 
                            broadcast({ type: 'subtitle_update', payload: '' }); 
                        } 
                    }; 
                } 
            } 
        } 
    }, 500); 
    return () => clearTimeout(timer); 
  }, [subtitleUrl]); 

  useEffect(() => {  
    if (electronAvailable) window.electron.setWindowOpacity(browserFix ? 0.999 : 1.0);  
    return () => { if (electronAvailable) window.electron.setWindowOpacity(1.0); };  
  }, [browserFix, electronAvailable]);  

  useEffect(() => {  
      if (electronAvailable && isRoomStarted) window.electron.toggleWebServer(isWebStreamEnabled);  
  }, [isWebStreamEnabled, isRoomStarted, electronAvailable]);  

  const startRoom = () => {  
    if (!electronAvailable) return;  
    setIsInitializing(true);  
    window.electron.getTailscaleStatus().then(status => {  
        const ips = status?.Self?.TailscaleIPs;  
        setMyIp((ips && ips.length > 0) ? ips[0] : "127.0.0.1");  
    }).catch(e => {  
        console.error("Failed to get Tailscale status", e);  
        setMyIp("127.0.0.1");  
    });  
    window.electron.startHostServer(65432);  
  };  

  const performCleanup = () => {  
      peersRef.current.forEach(p => { try { p.destroy(); } catch (e) { console.error(e); } });  
      peersRef.current.clear();  
      stopSharing();  
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);  
      if (electronAvailable) {  
          window.electron.toggleWebServer(false);  
          window.electron.stopHostServer();   
          window.electron.setWindowOpacity(1.0);  
      }  
      if (audioContextRef.current) {  
          audioContextRef.current.close();  
          audioContextRef.current = null;  
          audioSourceNodeRef.current = null;  
      }  
  };  

  const handleEndSession = () => { performCleanup(); onBack(); };  

  useEffect(() => {  
    const handleFsChange = () => {  
        const isFs = !!document.fullscreenElement;  
        setIsFullscreen(isFs);  
        if (!isFs) setIsTheaterMode(false);  
    };  
    document.addEventListener('fullscreenchange', handleFsChange);  
    return () => { document.removeEventListener('fullscreenchange', handleFsChange); performCleanup(); };  
  }, []);  

  // --- IDENTICAL LOGIC FROM VIEWER ROOM ---
  // Anti-flicker logic for fullscreen controls
  const clearControlsTimeout = () => {
      if (controlsTimeoutRef.current) {
          clearTimeout(controlsTimeoutRef.current);
      }
  };
  const resetControlsTimeout = () => {
      clearControlsTimeout();
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 2500);
  };

  const resetInputIdleTimer = () => {  
      setIsInputIdle(false);  
      if (inputIdleTimeoutRef.current) clearTimeout(inputIdleTimeoutRef.current);  
      if (isInputFocused) {
        inputIdleTimeoutRef.current = setTimeout(() => {
            setIsInputIdle(true);
        }, 4000);
      }
  };  
  useEffect(() => { resetInputIdleTimer(); }, [isInputFocused]);  

  const handleMouseMove = () => {
      setShowControls(true);
      resetInputIdleTimer();
      resetControlsTimeout();
  };

  useEffect(() => {  
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape' && isTheaterMode) setIsTheaterMode(false); };  
    window.addEventListener('keydown', handleKeyDown);  
    return () => window.removeEventListener('keydown', handleKeyDown);  
  }, [isTheaterMode]);  

  // Auto-wake chat (Identical to ViewerRoom)
  useEffect(() => {  
      const handleGlobalKeyDown = (e: KeyboardEvent) => {  
          resetInputIdleTimer();  
          
          if ((isTheaterMode || isFullscreen) && !isInputFocused) {
              if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                  setShowControls(true);
                  chatRef.current?.focusInput();
              }
          }
      };  
      
      window.addEventListener('keydown', handleGlobalKeyDown);  
      return () => window.removeEventListener('keydown', handleGlobalKeyDown);  
  }, [isTheaterMode, isFullscreen, isInputFocused]);  

  const handleHypeAction = (emoji: string) => {  
      const newEmojis = Array.from({ length: 20 }).map((_, i) => ({ id: Math.random().toString(36) + i, emoji, x: Math.random() * 90 + 5, animationDuration: 3 + Math.random() * 4 }));  
      setFloatingEmojis(prev => [...prev, ...newEmojis]);  
      setTimeout(() => setFloatingEmojis(prev => prev.filter(e => !newEmojis.some(ne => ne.id === e.id))), 8000);  
      broadcast({ type: 'hype', payload: { emoji } });  
  };  

  const handleFileTimeUpdate = () => {  
      if (fileVideoRef.current) { 
          // If we are in HTTP streaming mode, we must add the stream offset
          if (fileStreamUrl && fileStreamUrl.startsWith('http')) {
              setCurrentTime(streamOffset + fileVideoRef.current.currentTime); 
          } else {
              // Native file:// playback
              setCurrentTime(fileVideoRef.current.currentTime);
              // Only rely on metadata for duration in native mode
              if (!duration && isFinite(fileVideoRef.current.duration)) {
                  setDuration(fileVideoRef.current.duration);
              }
          }
          broadcast({ type: 'duration_sync', payload: duration });
      } 
  };  

  const handleFileSeek = (e: React.ChangeEvent<HTMLInputElement>) => {  
      const time = parseFloat(e.target.value);  
      setCurrentTime(time);  
      
      // Smart Seeking for Streaming
      if (fileStreamUrl && fileStreamUrl.startsWith('http')) {
          if (fileVideoRef.current && fileRawPath) {
              // Update the offset to match where we dragged
              setStreamOffset(time);
              
              // Hard Reset: Force browser to clear buffer to prevent "stuck frame"
              fileVideoRef.current.pause();
              
              // Aggressive clear: remove src attribute first
              fileVideoRef.current.removeAttribute('src');
              fileVideoRef.current.load();

              const newUrl = `http://127.0.0.1:8080/stream?file=${encodeURIComponent(fileRawPath)}&startTime=${time}&_t=${Date.now()}`;
              
              // Longer timeout to allow browser to flush decoding pipeline
              setTimeout(() => {
                  if (fileVideoRef.current) {
                      fileVideoRef.current.src = newUrl;
                      fileVideoRef.current.load(); // Load explicitly
                      fileVideoRef.current.play().catch(console.error);
                      setIsPlayingFile(true);
                  }
              }, 200); // 200ms delay for robustness
          }
      } else {
          // Local native file playback (file://)
          if (fileVideoRef.current) fileVideoRef.current.currentTime = time;  
      }
  };  

  const toggleFilePlay = () => {  
      if (fileVideoRef.current) {  
          if (fileVideoRef.current.paused) {  
              fileVideoRef.current.play();  
              setIsPlayingFile(true);  
          } else {  
              fileVideoRef.current.pause();  
              setIsPlayingFile(false);  
          }  
      }  
  };  

  const loadSubtitle = async () => {  
      if (!electronAvailable) return;  
        
      const result = await window.electron.openSubtitleFile();  
        
      if (result && result.content) {  
          try {  
              let text = result.content;  
              if (result.path.endsWith('.srt')) {  
                  text = srtToVtt(text);  
              }  
              const blob = new Blob([text], { type: 'text/vtt' });  
              const url = URL.createObjectURL(blob);  
              setSubtitleUrl(url);  
          } catch (e) {  
              console.error("Failed to process subtitles", e);  
              alert("Failed to load subtitle file.");  
          }  
      }  
      setShowCCMenu(false);  
  };  

  const removeSubtitle = () => { 
      setSubtitleUrl(null); 
      setCurrentSubtitleText(''); 
      broadcast({ type: 'subtitle_update', payload: '' }); 
      setShowCCMenu(false); 
  }; 

  const formatTime = (time: number) => {  
      if (!isFinite(time) || isNaN(time)) return "0:00";  
      const hours = Math.floor(time / 3600); 
      const minutes = Math.floor((time % 3600) / 60); 
      const seconds = Math.floor(time % 60); 
        
      if (hours > 0) { 
          return `${hours}:${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`; 
      } 
      return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`; 
  };  

  useEffect(() => {  
      const fetchAudioDevices = async () => {  
          try {  
              const devices = await navigator.mediaDevices.enumerateDevices();  
              setAudioInputDevices(devices.filter(d => d.kind === 'audioinput'));  
          } catch (e) { console.error(e); }  
      };  
      fetchAudioDevices();  
  }, [showSourceSelector]);  

  useEffect(() => {  
      if (sourceTab === 'file') setAudioSource('file');  
      else if (sourceTab === 'screen') setAudioSource('system');  
      else setAudioSource('none');   
  }, [sourceTab]);  

  useEffect(() => {  
    if (!electronAvailable) return;  

    window.electron.onHostServerStarted((res: any) => { if (res.success || res.port) { setIsRoomStarted(true); setIsInitializing(false); setMembers([{ id: 'HOST', name: username, isHost: true }]); } else { alert("Failed to start server: " + res.error); setIsInitializing(false); } });  
    window.electron.onHostClientConnected(({ socketId }: any) => {  
        const p = new SimplePeer({ initiator: true, trickle: false, stream: streamRef.current || undefined });  

        p.on('signal', (data) => { const signalPayload = { type: 'signal', data, bitrate: 0 }; if (data.type === 'offer') { if (streamBitrateRef.current > 0) data.sdp = setVideoBitrate(data.sdp!, streamBitrateRef.current); signalPayload.bitrate = streamBitrateRef.current; } window.electron.hostSendSignal(socketId, signalPayload); });  
        p.on('connect', () => {   
            sendDataToPeer(p, { type: 'members', payload: members });   
            sendDataToPeer(p, { type: 'theme_change', payload: currentTheme });   
            if (streamRef.current) sendDataToPeer(p, { type: 'bitrate_sync', payload: streamBitrateRef.current });  
            sendDataToPeer(p, { type: 'cc_size', payload: ccSize }); 
        });  
        p.on('data', (data) => handleData(socketId, data));  
        p.on('close', () => handlePeerDisconnect(socketId));  
        peersRef.current.set(socketId, p);  
    });  

    window.electron.onHostSignalReceived(({ socketId, data }: any) => { if (data.type === 'signal') { const p = peersRef.current.get(socketId); if (p) p.signal(data.data); } });  
    window.electron.onHostClientDisconnected(({ socketId }: any) => handlePeerDisconnect(socketId));  

    return () => {  
      window.electron.removeAllListeners('host-server-started');  
      window.electron.removeAllListeners('host-client-connected');  
      window.electron.removeAllListeners('host-signal-received');  
      window.electron.removeAllListeners('host-client-disconnected');  
    };  
  }, [members, username, electronAvailable, currentTheme, ccSize]);  

  useEffect(() => {  
      if (isSharing && showNerdStats) {  
          statsIntervalRef.current = setInterval(() => {  
              const firstPeer = peersRef.current.values().next().value;  
              const peerAny = firstPeer as any;  
              if (peerAny && peerAny._pc) {  
                  peerAny._pc.getStats().then((reports: any) => {  
                      reports.forEach((report: any) => {  
                          if (report.type === 'outbound-rtp' && report.kind === 'video') {  
                              if (videoRef.current) {  
                                  if (lastStatsRef.current) {  
                                      if (report.bytesSent < lastStatsRef.current.bytesSent) {  
                                          lastStatsRef.current = { timestamp: report.timestamp, bytesSent: report.bytesSent };  
                                          return;  
                                      }  
                                      const bytesSinceLast = report.bytesSent - lastStatsRef.current.bytesSent;  
                                      const timeSinceLast = report.timestamp - lastStatsRef.current.timestamp;  
                                      if (timeSinceLast > 0) {  
                                          const bitrate = Math.round((bytesSinceLast * 8) / timeSinceLast);  
                                          setStats(prev => ({ ...prev, bitrate: `${(bitrate / 1000).toFixed(1)} Mbps` }));  
                                      }  
                                  }  
                                  lastStatsRef.current = { timestamp: report.timestamp, bytesSent: report.bytesSent };  
                                  setStats(prev => ({ ...prev, resolution: `${videoRef.current?.videoWidth}x${videoRef.current?.videoHeight}`, fps: report.framesPerSecond || 0 }));  
                              }  
                          }  
                          if (report.type === 'candidate-pair' && report.state === 'succeeded') {  
                              setStats(prev => ({ ...prev, latency: `${Math.round(report.currentRoundTripTime * 1000)} ms` }));  
                          }  
                      });  
                  });  
              }  
          }, 1000);  
      } else {  
          if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);  
          lastStatsRef.current = null;  
      }  
      return () => { if (statsIntervalRef.current) clearInterval(statsIntervalRef.current); };  
  }, [isSharing, showNerdStats]);  

  // --- AUDIO MONITORING FIX: PREVIEW VOLUME ---
  useEffect(() => {  
      if (fileVideoRef.current) fileVideoRef.current.volume = 1.0;  
       
      // Control preview volume for ALL modes (Screen, File, or VB-Cable)
      if (videoRef.current) {  
          videoRef.current.volume = localVolume;  
          videoRef.current.muted = (localVolume === 0);  
      }  
  }, [localVolume, sourceTab]);  
  // ------------------------------------------

  const handlePeerDisconnect = (socketId: string) => { if (peersRef.current.has(socketId)) { peersRef.current.get(socketId)?.destroy(); peersRef.current.delete(socketId); } setMembers(prev => prev.filter(m => m.id !== socketId)); broadcast({ type: 'members', payload: members.filter(m => m.id !== socketId) }); };  
  const handleData = (socketId: string, data: any) => {   
      try { const parsed = JSON.parse(data.toString());   
        if (parsed.type === 'join') {  
            const newMember = { id: socketId, name: parsed.name, isHost: false };  
            setMembers(prev => { if (prev.find(m => m.id === socketId)) return prev; const up = [...prev, newMember]; setTimeout(() => broadcast({ type: 'members', payload: up }), 100); return up; });  
            const p = peersRef.current.get(socketId);  
            if(p) {  
                sendDataToPeer(p, { type: 'theme_change', payload: currentTheme });  
                if(streamRef.current) sendDataToPeer(p, { type: 'bitrate_sync', payload: streamBitrateRef.current });  
                sendDataToPeer(p, { type: 'cc_size', payload: ccSize });  
                 
                if (isSharing && movieTitle) { 
                    sendDataToPeer(p, { type: 'metadata', payload: { title: movieTitle } }); 
                } 
            }  
        }  
        if (parsed.type === 'chat') { const msg = parsed.payload; setMessages(prev => { if (prev.some(m => m.id === msg.id)) return prev; return [...prev, msg]; }); broadcast({ type: 'chat', payload: msg }); }  
        if (parsed.type === 'hype') { handleHypeAction(parsed.payload.emoji); }  
        if (parsed.type === 'picker_action') handlePickerInteraction(parsed.payload.action, parsed.payload.value);  
      } catch (e) { console.error(e); }   
  };  

  const broadcast = (data: any) => { const str = JSON.stringify(data); peersRef.current.forEach(p => { if (p.connected) p.send(str); }); };  
  const sendDataToPeer = (peer: SimplePeer.Instance, data: any) => { if (peer.connected) peer.send(JSON.stringify(data)); };  

  const prepareScreenShare = async () => {  
      if (!electronAvailable) return;  
      setIsRefreshingSources(true);  
      try {  
          const sources = await window.electron.getDesktopSources();  
          setAvailableSources(sources);  
          setShowSourceSelector(true);  
          if (!selectedSourceId || !sources.find(s => s.id === selectedSourceId)) setSelectedSourceId(null);  
      } catch (e) { console.error(e); } finally { setIsRefreshingSources(false); }  
  };  

  const startStream = async (sourceId: string) => {  
      setShowSourceSelector(false);  
      try {  
          let finalStream: MediaStream;  
          let maxWidth = streamQuality === '4k' ? 3840 : (streamQuality === '1440p' ? 2560 : 1920);  
          let maxHeight = streamQuality === '4k' ? 2160 : (streamQuality === '1440p' ? 1440 : 1080);  

          const videoConstraints = {  
              mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, maxWidth, maxHeight, minFrameRate: streamFps, maxFrameRate: streamFps, googPowerSaving: false, googCpuOveruseDetection: false }  
          };  

          if (sourceId === 'file') {  
              if (!fileVideoRef.current || !fileStreamUrl) { alert("No file selected!"); return; }  
              fileVideoRef.current.volume = 1.0;   
              fileVideoRef.current.muted = false;  

              if (!audioContextRef.current) {  
                  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;  
                  audioContextRef.current = new AudioContext();  
              }  
              const ctx = audioContextRef.current;  
              if (!audioSourceNodeRef.current) audioSourceNodeRef.current = ctx.createMediaElementSource(fileVideoRef.current);  
              const sourceNode = audioSourceNodeRef.current;  
              const destination = ctx.createMediaStreamDestination();  
              sourceNode.connect(destination);   

              try { await fileVideoRef.current.play(); setIsPlayingFile(true); } catch (playErr) { console.warn(playErr); }  

              // @ts-ignore  
              const videoStream = fileVideoRef.current.captureStream(60);   
              if (videoStream.getTracks().length === 0) throw new Error("Failed to capture stream.");  

              finalStream = new MediaStream([...videoStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);  
              setAudioSource('file');   
              setLocalVolume(0.5); 
              
              // Force detail content hint for file sharing (Fixes desktop muddiness)
              const vidTrack = videoStream.getVideoTracks()[0];
              if (vidTrack && 'contentHint' in vidTrack) {
                  vidTrack.contentHint = 'detail';
              }
          }  
          else if (audioSource === 'none') {  
              finalStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints } as any);  
          } else if (audioSource === 'system') {  
              finalStream = await navigator.mediaDevices.getUserMedia({  
                  audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } },  
                  video: videoConstraints  
              } as any);  
              // Removed setLocalVolume(0) here to allow monitoring 
          } else {  
              // --- AUDIO SYNC FIX FOR VB-CABLE / EXTERNAL MIC --- 
              const videoStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints } as any);  
              try {  
                  // 1. Get raw audio with relaxed latency (removed latency: 0) 
                  const audioStream = await navigator.mediaDevices.getUserMedia({  
                      audio: { deviceId: { exact: audioSource }, autoGainControl: false, echoCancellation: false, noiseSuppression: false, channelCount: 2 } as any,  
                      video: false  
                  });  

                  // 2. Route through AudioContext to align clocks with the system 
                  if (!audioContextRef.current) {  
                      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;  
                      audioContextRef.current = new AudioContext();  
                  } 
                  const ctx = audioContextRef.current;  
                  const source = ctx.createMediaStreamSource(audioStream);  
                  const destination = ctx.createMediaStreamDestination();  
                  source.connect(destination);  

                  // 3. Combine processed audio with video 
                  finalStream = new MediaStream([...videoStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);  
              } catch (audioErr) { console.error(audioErr); finalStream = videoStream; }  
              // -------------------------------------------------- 
          }  

          streamRef.current = finalStream;  
            
          if (videoRef.current) {  
              videoRef.current.srcObject = finalStream;  
              videoRef.current.play().catch(e => console.error("Preview Play Error", e));  
          }  
          if (ambilightRef.current) {  
              ambilightRef.current.srcObject = finalStream;  
              ambilightRef.current.play().catch(() => {});  
          }  
          broadcast({ type: 'bitrate_sync', payload: streamBitrate });  
          setIsSharing(true);  
          peersRef.current.forEach(p => p.addStream(finalStream));  
            
          broadcast({ type: 'metadata', payload: { title: movieTitle } }); 

      } catch (e) { console.error(e); alert("Failed to start stream: " + e); }  
  };  

  const stopSharing = () => {  
      broadcast({ type: 'stream_stopped' });  
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); peersRef.current.forEach(p => p.removeStream(streamRef.current!)); streamRef.current = null; }  
      if (videoRef.current) videoRef.current.srcObject = null;  
      if (ambilightRef.current) ambilightRef.current.srcObject = null;  
        
      if (fileVideoRef.current) {  
          fileVideoRef.current.pause();  
          fileVideoRef.current.src = "";   
          fileVideoRef.current.load();      
          setIsPlayingFile(false);  
      }  
      setFileStreamUrl(null); 
      setFileRawPath(null);
      setSelectedSourceId(null);  
      setSourceTab('screen');   
      setSubtitleUrl(null);  
      setCurrentSubtitleText('');  
      broadcast({ type: 'subtitle_update', payload: '' });  
      setMovieTitle("");   
      setIsSharing(false);  
      lastStatsRef.current = null;  
      setStreamOffset(0);
  };  

  const toggleMute = () => { if (localVolume > 0) setLocalVolume(0); else setLocalVolume(0.5); };  
  const toggleFullscreen = () => { const elem = containerRef.current; if (!document.fullscreenElement) elem?.requestFullscreen().catch(console.error); else document.exitFullscreen(); };  
  const toggleTheaterMode = () => { if (isFullscreen) document.exitFullscreen(); else setIsTheaterMode(!isTheaterMode); };  
  const togglePiP = async () => { try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else if (videoRef.current && videoRef.current !== document.pictureInPictureElement) await videoRef.current.requestPictureInPicture(); } catch (err) { console.error(err); } };  
  const startSharedPicker = () => { if (pickerStepRef.current !== 'idle' && pickerStepRef.current !== 'reveal') return; setPickerStep('type'); pickerStepRef.current = 'type'; const msg: ChatMessage = { id: Date.now().toString(), senderId: 'HOST', senderName: 'SYSTEM', text: '', timestamp: Date.now(), isSystemEvent: true, eventPayload: { state: 'type_selection' } }; setMessages(p => [...p, msg]); broadcast({ type: 'chat', payload: msg }); };  
  const handlePickerInteraction = (action: string, value?: string) => { if (action === 'start_picker') { startSharedPicker(); return; } const msgId = Date.now().toString(); let payload: any = {}; const currentStep = pickerStepRef.current; const currentMediaType = activeMediaTypeRef.current; const seen = seenTitlesRef.current; if (action === 'select_type') { if (currentStep !== 'type') return; const type = value as MediaType; setActiveMediaType(type); activeMediaTypeRef.current = type; setPickerStep('genre'); pickerStepRef.current = 'genre'; payload = { state: 'genre_selection', mediaType: type }; } else if (action === 'select_genre' || action === 'reroll') { if (currentStep !== 'genre' && action !== 'reroll') return; const genre = value as Genre; if(action !== 'reroll') { setCurrentTheme(genre); broadcast({ type: 'theme_change', payload: genre }); } setPickerStep('reveal'); pickerStepRef.current = 'reveal'; const database = currentMediaType === 'Movie' ? MOVIE_DB : SHOW_DB; const allOptions = database[genre] || []; let available = allOptions.filter(m => !seen.has(m.title)); if (available.length < 3) available = allOptions; const picks = [...available].sort(() => 0.5 - Math.random()).slice(0, 3); setSeenTitles(prev => { const next = new Set(prev); picks.forEach(p => next.add(p.title)); return next; }); payload = { state: 'reveal', mediaType: currentMediaType, genre, movies: picks }; } const msg: ChatMessage = { id: msgId, senderId: 'HOST', senderName: 'SYSTEM', text: '', timestamp: Date.now(), isSystemEvent: true, eventPayload: payload }; setMessages(p => [...p, msg]); broadcast({ type: 'chat', payload: msg }); };  
  const handleSendMessage = (text: string, type: 'text' | 'gif' = 'text', replyTo?: ReplyContext) => { const msg: ChatMessage = { id: Date.now().toString() + Math.floor(Math.random() * 1000), senderId: 'HOST', senderName: username, text, timestamp: Date.now(), type, replyTo, reactions: {} }; setMessages(p => { if (p.some(m => m.id === msg.id)) return p; return [...p, msg]; }); broadcast({ type: 'chat', payload: msg }); };  

  if (!isRoomStarted) {  
      return (  
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 relative overflow-hidden">  
             <div className="absolute inset-0 z-0 pointer-events-none">  
                <div className="absolute top-[-10%] left-[20%] w-[40vw] h-[40vw] bg-blue-900/20 rounded-full blur-[128px] animate-blob" />  
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>  
             </div>  
             <button onClick={onBack} className="absolute top-8 left-8 text-gray-400 hover:text-white flex items-center gap-2 z-20"><ArrowLeft size={16} /> Back</button>  
             <div className="relative z-10 max-w-md w-full bg-white/5 backdrop-blur-xl rounded-3xl p-8 border border-white/10 shadow-2xl text-center">  
                <Zap className="w-12 h-12 text-blue-400 mx-auto mb-4" />  
                <h2 className="text-3xl font-bold text-white mb-2">Initialize Host</h2>  
                <p className="text-gray-400 mb-6 text-sm">Start a secure P2P server on your local network.</p>  
                <div className="flex items-center justify-between bg-black/30 p-3 rounded-xl mb-4 border border-white/5">  
                    <div className="flex items-center gap-3 text-left"><Globe size={18} className={isWebStreamEnabled ? "text-green-400" : "text-gray-500"} /><div><p className="text-sm font-bold text-white">Web Browser Streaming</p><p className="text-xs text-gray-500">Allow viewers to join via browser (mobile/tablet).</p></div></div>  
                    <button onClick={() => setIsWebStreamEnabled(!isWebStreamEnabled)} className={`w-10 h-5 rounded-full relative transition-colors ${isWebStreamEnabled ? 'bg-green-500' : 'bg-gray-600'}`}><div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${isWebStreamEnabled ? 'left-6' : 'left-1'}`} /></button>  
                </div>  
                <Button className="w-full py-4" size="lg" onClick={startRoom} isLoading={isInitializing}>{isInitializing ? 'INITIALIZING...' : 'INITIALIZE SERVER'}</Button>  
             </div>  
        </div>  
      );  
  }  

  const controlsVisible = showControls || (isInputFocused && !isInputIdle);

  return (  
    <div className="flex h-screen bg-[#111] text-gray-100 overflow-hidden font-sans">  
      <div className="flex-1 flex flex-col relative min-w-0">  
        <div ref={containerRef} className="flex-1 relative bg-black flex items-center justify-center overflow-hidden group select-none"  
            onMouseMove={handleMouseMove} onClick={() => setShowControls(!showControls)} onMouseEnter={clearControlsTimeout} onMouseLeave={resetControlsTimeout}>  
              
            <video ref={fileVideoRef} src={fileStreamUrl || ''} className="absolute top-0 left-0 w-full h-full -z-50 opacity-100 pointer-events-none" style={{ visibility: 'visible' }} playsInline crossOrigin="anonymous" onTimeUpdate={handleFileTimeUpdate}>  
                {subtitleUrl && <track key={subtitleUrl} label="English" kind="subtitles" src={subtitleUrl} default />}  
            </video>  

            <div className={`absolute top-0 left-0 right-0 z-20 p-4 flex justify-between pointer-events-none transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`} onClick={(e) => e.stopPropagation()}>  
                <div className="pointer-events-auto flex items-center gap-2">  
                    {isSharing && movieTitle && (  
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-black/40 backdrop-blur-xl rounded-full border border-white/10 shadow-lg animate-in slide-in-from-top-2">  
                            <FileVideo size={14} className="text-purple-400" />  
                            <span className="text-xs font-bold text-gray-200 truncate max-w-[200px]">{movieTitle}</span>  
                        </div>  
                    )}  
                </div>  
                <div className="pointer-events-auto flex items-center gap-4">  
                   <div className="flex items-center gap-2 px-3 py-1.5 bg-black/40 backdrop-blur-xl rounded-full border border-white/10 shadow-lg">  
                       <Wifi size={14} className={myIp ? "text-green-400" : "text-gray-500"} />  
                       <span className="font-mono text-xs text-gray-200 select-all cursor-pointer hover:text-white" onClick={() => navigator.clipboard.writeText(myIp ? `${myIp}:8080` : '')} title="Click to Copy IP">{myIp ? `${myIp}:8080` : "Detecting IP..."}</span>  
                   </div>  
                   <Button size="sm" variant="danger" onClick={() => setShowExitConfirm(true)} className="gap-2 rounded-full px-4 shadow-lg backdrop-blur-md bg-red-600/80 hover:bg-red-600"><Power size={14} /> End</Button>  
                </div>  
            </div>  

            {showExitConfirm && (  
                <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>  
                    <div className="bg-[#1e1f22] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl scale-100 animate-in zoom-in-95 duration-200">  
                        <div className="flex items-center gap-3 mb-4 text-gray-200"><AlertCircle size={24} /><h3 className="text-lg font-bold">End Session?</h3></div>  
                        <p className="text-gray-400 text-sm mb-6">This will disconnect all viewers and stop the stream.</p>  
                        <div className="flex gap-3 justify-end"><Button variant="ghost" onClick={() => setShowExitConfirm(false)}>Cancel</Button><Button variant="danger" onClick={handleEndSession}>End Session</Button></div>  
                    </div>  
                </div>  
            )}  
              
            {showSourceSelector && (  
                <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>  
                    <div className="bg-[#1e1f22] border border-white/10 rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl">  
                        <div className="p-6 border-b border-white/10 flex justify-between items-center">  
                            <h3 className="text-xl font-bold text-white flex items-center gap-2"><ScreenShare size={20} className="text-blue-400"/> Select Source</h3>  
                            <button onClick={() => setShowSourceSelector(false)} className="text-gray-400 hover:text-white"><X size={24}/></button>  
                        </div>  
                        <div className="flex gap-4 px-6 py-4 border-b border-white/5">  
                            <button onClick={() => setSourceTab('screen')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${sourceTab === 'screen' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>Screens</button>  
                            <button onClick={() => setSourceTab('window')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${sourceTab === 'window' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>Windows</button>  
                            <button onClick={async () => { 
                                if (!fileStreamUrl) { 
                                    const filePath = await window.electron.openVideoFile(); 
                                    if (filePath) { 
                                        const dur = await window.electron.getVideoDuration(filePath);
                                        setDuration(dur);
                                        setStreamOffset(0);
                                        setFileRawPath(filePath); 
                                        setFileStreamUrl(`http://127.0.0.1:8080/stream?file=${encodeURIComponent(filePath)}&_t=${Date.now()}`); 
                                        setMovieTitle(filePath.split(/[\\/]/).pop() || "Video File"); 
                                        setSourceTab('file'); 
                                        setSelectedSourceId('file'); 
                                    } 
                                } else { 
                                    setSourceTab('file'); 
                                } 
                            }} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${sourceTab === 'file' ? 'bg-purple-600 text-white shadow-lg' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}><div className="flex items-center gap-2"><FileVideo size={16} /> Video File</div></button>  
                            <div className="ml-auto flex items-center gap-2"><button onClick={prepareScreenShare} className={`p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all ${isRefreshingSources ? 'animate-spin' : ''}`}><RefreshCw size={18}/></button></div>  
                        </div>  
                        {isMac && sourceTab === 'window' && audioSource === 'system' && (<div className="mx-6 mt-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg flex items-center gap-3 animate-in slide-in-from-top-2"><AlertTriangle className="text-orange-500 shrink-0" size={20} /><p className="text-xs text-orange-200"><span className="font-bold block text-orange-400 mb-0.5">Audio Limitation Detected</span>macOS cannot record audio from individual windows. Please use <b>Screens</b> or <b>Video File</b> mode.</p></div>)}  
                        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">  
                            {sourceTab === 'file' ? (  
                                <div className="flex flex-col items-center justify-center h-full text-center">  
                                    {fileStreamUrl ? (  
                                        <div className="w-full max-w-lg relative group">  
                                            <div className="aspect-video bg-black rounded-xl overflow-hidden border-2 border-purple-500 shadow-[0_0_30px_rgba(168,85,247,0.3)] mb-4">  
                                                <video src={fileStreamUrl} className="w-full h-full object-contain" controls />  
                                            </div>  
                                            <button onClick={(e) => { e.stopPropagation(); setFileStreamUrl(null); setFileRawPath(null); setSelectedSourceId(null); setMovieTitle(""); setStreamOffset(0); }} className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 shadow-lg" title="Remove File"><Trash2 size={16} /></button>  
                                            <p className="text-green-400 font-bold flex items-center justify-center gap-2"><Check size={16}/> File Ready</p>  
                                            <p className="text-gray-500 text-xs mt-1">Audio will be captured directly from file.</p>  
                                        </div>  
                                    ) : (  
                                        <div className="text-center"><p className="text-gray-500 mb-4">Select a local video file for perfect quality.</p><Button onClick={async () => { const filePath = await window.electron.openVideoFile(); if (filePath) { const dur = await window.electron.getVideoDuration(filePath); setDuration(dur); setStreamOffset(0); setFileRawPath(filePath); setFileStreamUrl(`http://127.0.0.1:8080/stream?file=${encodeURIComponent(filePath)}&_t=${Date.now()}`); setMovieTitle(filePath.split(/[\\/]/).pop() || "Video File"); setSourceTab('file'); setSelectedSourceId('file'); } }}>Choose File</Button></div>  
                                    )}  
                                </div>  
                            ) : sourceTab === 'screen' ? (  
                                <div className="grid grid-cols-2 gap-4">{availableSources.filter(s => s.id.startsWith('screen')).map(source => (<div key={source.id} onClick={() => setSelectedSourceId(source.id)} className={`group relative aspect-video bg-black rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${selectedSourceId === source.id ? 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)]' : 'border-white/10 hover:border-white/30'}`}><img src={source.thumbnail} className="w-full h-full object-contain" /><div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-3"><span className="font-bold text-sm text-white truncate">{source.name}</span></div>{selectedSourceId === source.id && (<div className="absolute top-2 right-2 bg-blue-500 text-white p-1 rounded-full shadow-lg"><Check size={14} strokeWidth={4} /></div>)}</div>))}</div>
                            ) : (  
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">{availableSources.filter(s => s.id.startsWith('window')).map(source => (<div key={source.id} onClick={() => setSelectedSourceId(source.id)} className={`group relative w-full h-48 bg-black rounded-xl overflow-hidden border-2 cursor-pointer transition-all flex flex-col ${selectedSourceId === source.id ? 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)]' : 'border-white/10 hover:border-white/30'}`}><div className="flex-1 bg-black/50 flex items-center justify-center p-2 overflow-hidden"><img src={source.thumbnail} className="max-w-full max-h-full object-contain shadow-lg" /></div><div className="h-10 bg-[#111] flex items-center px-3 border-t border-white/5"><img src={source.thumbnail} className="w-4 h-4 rounded-sm mr-2 opacity-70" /><span className="font-medium text-xs text-gray-300 truncate">{source.name}</span></div>{selectedSourceId === source.id && (<div className="absolute top-2 right-2 bg-blue-500 text-white p-1 rounded-full shadow-lg"><Check size={14} strokeWidth={4} /></div>)}</div>))}</div>
                            )}  
                        </div>  
                        <div className="p-6 border-t border-white/10 bg-[#151618] rounded-b-2xl">  
                            {sourceTab !== 'file' && (  
                                <div className="grid grid-cols-2 gap-6 mb-6">  
                                    <div className="space-y-4"><div><label className="text-xs font-bold text-gray-500 uppercase mb-2 block flex items-center gap-2">Audio Source <button onClick={() => setShowAudioHelp(!showAudioHelp)} className="text-gray-600 hover:text-white"><HelpCircle size={12}/></button></label><select value={audioSource} onChange={(e) => setAudioSource(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"><option value="system">System Audio (Loopback)</option><option value="none">No Audio (Video Only)</option><optgroup label="Input Devices">{audioInputDevices.map(d => (<option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0,5)}...`}</option>))}</optgroup></select>{showAudioHelp && (<div className="mt-2 text-[10px] text-gray-400 bg-white/5 p-2 rounded border border-white/5">For best results, install <b>VB-CABLE</b>. Set your browser/player output to 'CABLE Input' and select 'CABLE Output' here.</div>)}</div></div>  
                                    <div className="space-y-4"><div><label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Resolution</label><div className="flex bg-black/50 rounded-lg p-1 border border-white/10">{(['1080p', '1440p', '4k'] as const).map(q => (<button key={q} onClick={() => setStreamQuality(q)} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${streamQuality === q ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}>{q.toUpperCase()}</button>))}</div></div><div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Frame Rate</label><select value={streamFps} onChange={(e) => setStreamFps(Number(e.target.value) as 30 | 60)} className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"><option value={30}>30 FPS</option><option value={60}>60 FPS (Silky Smooth)</option></select></div><div><label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Bitrate</label><select value={streamBitrate} onChange={(e) => setStreamBitrate(Number(e.target.value))} className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"><option value={0}>Automatic (Default)</option><option value={15000}>High (15 Mbps)</option><option value={30000}>Extreme (30 Mbps)</option><option value={50000}>Insane (50 Mbps)</option></select></div></div></div>  
                                </div>  
                            )}  
                            <div className="flex justify-end items-center gap-3">
                                {sourceTab === 'file' && fileStreamUrl && (
                                    <div className="flex items-center gap-2 mr-4">
                                        <label className="text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Bitrate</label>
                                        <select value={streamBitrate} onChange={(e) => setStreamBitrate(Number(e.target.value))} className="bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none w-48">
                                            <option value={0}>Automatic (Default)</option>
                                            <option value={15000}>High (15 Mbps)</option>
                                            <option value={30000}>Extreme (30 Mbps)</option>
                                            <option value={50000}>Insane (50 Mbps)</option>
                                        </select>
                                    </div>
                                )}
                                <Button variant="ghost" onClick={() => setShowSourceSelector(false)}>Cancel</Button>
                                <Button disabled={!selectedSourceId} onClick={() => selectedSourceId && startStream(selectedSourceId)} className="px-8">{isSharing ? 'Switch Source' : 'Go Live'}</Button>
                            </div>
                        </div>  
                    </div>  
                </div>  
            )}  

            <div className="absolute inset-0 overflow-hidden pointer-events-none z-40">  
                  {floatingEmojis.map(emoji => (  
                      <div key={emoji.id} className="absolute bottom-0 text-6xl animate-float" style={{ left: `${emoji.x}%`, animationDuration: `${emoji.animationDuration}s`, filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))', transform: 'perspective(500px) rotateX(10deg)' }}>{emoji.emoji}</div>  
                  ))}  
                  <style>{`@keyframes float { 0% { transform: translateY(100%) perspective(500px) rotateX(10deg) scale(0.8); opacity: 0; } 10% { opacity: 1; transform: translateY(80%) perspective(500px) rotateX(10deg) scale(1.2); } 100% { transform: translateY(-150%) perspective(500px) rotateX(10deg) scale(1); opacity: 0; } } .animate-float { animation-name: float; animation-timing-function: ease-out; }`}</style>  
            </div>  

            {!isSharing && (  
                <div className="text-center">  
                    <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-white/10 animate-blob"><ScreenShare size={32} className="text-gray-500" /></div>  
                    <h3 className="text-xl font-bold text-gray-300 mb-2">Ready to Stream?</h3>  
                    <p className="text-gray-500 text-sm mb-8">Select a screen or application to start the party.</p>  
                    <Button size="lg" onClick={prepareScreenShare} className="mx-auto">Start Screen Share</Button>  
                </div>  
            )}  

            <video ref={ambilightRef} className="absolute inset-0 w-full h-full object-cover blur-[80px] opacity-50 pointer-events-none transition-opacity duration-1000" muted />  
              
            <video   
                ref={videoRef}   
                className={`relative z-10 w-full h-full object-contain shadow-2xl ${!isSharing ? 'hidden' : ''}`}  
                style={{ filter: `brightness(${videoFilters.brightness}%) contrast(${videoFilters.contrast}%) saturate(${videoFilters.saturate}%)` }}   
                autoPlay   
                playsInline   
            />  
            
            {currentSubtitleText && isSharing && (
                <div className="absolute bottom-24 left-0 right-0 flex justify-center pointer-events-none z-30 px-8">
                    <span 
                        className="bg-black/60 text-white rounded-md px-3 py-1 text-center backdrop-blur-sm"
                        style={{
                            fontSize: ccSize === 'small' ? '1rem' : ccSize === 'medium' ? '1.5rem' : '2.25rem',
                            textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                            fontFamily: 'sans-serif',
                            maxWidth: '80%'
                        }}
                    >
                        {currentSubtitleText}
                    </span>
                </div>
            )}

            {showNerdStats && (  
                <div className="absolute top-16 left-4 bg-black/60 backdrop-blur-md border border-white/10 p-3 rounded-lg z-30 text-[10px] font-mono text-gray-300 pointer-events-none select-none animate-in slide-in-from-left-2">  
                    <h4 className={`${activeTheme.primary} font-bold mb-1 flex items-center gap-1`}><Activity size={10}/> STREAM STATS (OUT)</h4>  
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1"><span>Resolution:</span> <span className="text-white">{stats.resolution}</span><span>FPS:</span> <span className="text-white">{stats.fps}</span><span>Bitrate:</span> <span className="text-green-400">{stats.bitrate}</span><span>Latency:</span> <span className="text-yellow-400">{stats.latency}</span></div>  
                </div>  
            )}  

            {(isTheaterMode || isFullscreen) && (  
               <div className={`absolute bottom-32 left-4 w-[400px] max-w-[80vw] z-[60] flex flex-col justify-end transition-opacity duration-300`} onClick={(e) => e.stopPropagation()}>  
                  <Chat 
                    ref={chatRef} 
                    messages={messages} 
                    onSendMessage={handleSendMessage} 
                    onAddReaction={() => {}} 
                    onHypeEmoji={handleHypeAction} 
                    onPickerAction={handlePickerInteraction} 
                    myId={'HOST'} 
                    theme={activeTheme} 
                    onInputFocus={() => setIsInputFocused(true)} 
                    onInputBlur={() => setIsInputFocused(false)} 
                    onInputChange={resetInputIdleTimer} 
                    isOverlay={true} 
                    inputVisible={controlsVisible}
                  />  
              </div>  
            )}  

            {/* Controls Bar */}
            <div className={`absolute bottom-8 z-50 transition-all duration-500 ${controlsVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 pointer-events-none'}`} onMouseEnter={clearControlsTimeout} onMouseLeave={resetControlsTimeout} onClick={(e) => e.stopPropagation()}>  
                <div className="flex flex-col items-center gap-2">  
                    <div className="flex items-center gap-4 px-6 py-3 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl hover:bg-black/50 hover:scale-[1.02] transition-all">  
                        <div className="flex items-center gap-2 group/vol"><button onClick={toggleMute} className="p-2 hover:bg-white/10 rounded-full text-gray-300 hover:text-white transition-colors">{localVolume === 0 ? <VolumeX size={20} className="text-red-400"/> : <Volume2 size={20} />}</button><div className="w-0 overflow-hidden group-hover/vol:w-20 transition-all duration-300 flex items-center"><input type="range" min="0" max="1" step="0.05" value={localVolume} onChange={(e) => setLocalVolume(parseFloat(e.target.value))} className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer transition-colors bg-white/20 hover:bg-white/30 ${activeTheme.accent}`} /></div></div>  
                        <div className="w-px h-6 bg-white/10"></div>  
                        {audioSource === 'file' && (<button onClick={toggleFilePlay} className="p-2 hover:bg-white/10 rounded-full text-white transition-colors">{isPlayingFile ? <Pause size={20} fill="currentColor"/> : <Play size={20} fill="currentColor"/>}</button>)}  
                        {audioSource === 'file' && (
                          <div className="relative">
                            <button onClick={() => setShowCCMenu(!showCCMenu)} className={`p-2 rounded-full transition-colors ${subtitleUrl || showCCMenu ? 'text-white bg-white/10' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}><Captions size={20} /></button>
                            {showCCMenu && (
                                <div className="absolute bottom-full left-1/2 -ml-24 mb-4 w-48 bg-[#151618] border border-white/10 rounded-xl p-3 shadow-2xl">
                                    <div className="flex flex-col gap-2">
                                        <button onClick={loadSubtitle} className="flex items-center gap-2 w-full p-2 rounded hover:bg-white/10 text-xs text-left"><Plus size={14} className="text-blue-400"/> Add Subs (.vtt/.srt)</button>
                                        {subtitleUrl && (
                                            <>
                                                <button onClick={removeSubtitle} className="flex items-center gap-2 w-full p-2 rounded hover:bg-white/10 text-xs text-left text-red-400"><Trash2 size={14} /> Remove Subtitles</button>
                                                <div className="h-px bg-white/10 my-1"></div>
                                                <div className="flex justify-between bg-black/30 rounded p-1">
                                                    <button onClick={() => setCcSize('small')} className={`flex-1 py-1 text-[10px] rounded ${ccSize === 'small' ? 'bg-white/20 text-white' : 'text-gray-400'}`}>S</button>
                                                    <button onClick={() => setCcSize('medium')} className={`flex-1 py-1 text-[10px] rounded ${ccSize === 'medium' ? 'bg-white/20 text-white' : 'text-gray-400'}`}>M</button>
                                                    <button onClick={() => setCcSize('large')} className={`flex-1 py-1 text-[10px] rounded ${ccSize === 'large' ? 'bg-white/20 text-white' : 'text-gray-400'}`}>L</button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                          </div>
                        )}  
                        
                        {isSharing && audioSource === 'file' && (
                            <>
                                <div className="w-px h-6 bg-white/10 mx-2"></div>
                                <div className="flex items-center gap-2 min-w-[200px]">
                                    <span className="text-[10px] font-mono text-gray-300 w-10 text-right">{formatTime(currentTime)}</span>
                                    <input type="range" min={0} max={duration || 100} value={currentTime} onChange={handleFileSeek} className={`w-40 h-1 rounded-lg appearance-none cursor-pointer bg-white/20 ${activeTheme.accent}`} />
                                    <span className="text-[10px] font-mono text-gray-300 w-10">{formatTime(duration)}</span>
                                </div>
                            </>
                        )}

                        <div className="w-px h-6 bg-white/10 mx-2"></div>  
                        <div className="flex items-center gap-2">  
                            <button onClick={startSharedPicker} disabled={(pickerStep !== 'idle' && pickerStep !== 'reveal')} className={`p-2 hover:bg-white/10 rounded-full transition-colors ${(pickerStep !== 'idle' && pickerStep !== 'reveal') ? 'text-gray-600 cursor-not-allowed' : `${activeTheme.primary}`}`} title="Suggest Movie"><Clapperboard size={20} /></button>  
                            <button onClick={() => setShowNerdStats(!showNerdStats)} className={`p-2 hover:bg-white/10 rounded-full transition-colors ${showNerdStats ? `${activeTheme.primary}` : 'text-gray-400 hover:text-white'}`} title="Nerd Stats"><Activity size={20} /></button>  
                            <button onClick={togglePiP} disabled={!isSharing} className={`p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white active:scale-95 ${!isSharing ? 'opacity-50 cursor-not-allowed' : ''}`} title="Picture-in-Picture"><PictureInPicture size={20} /></button>  
                            <button onClick={toggleTheaterMode} className={`p-2 hover:bg-white/10 rounded-full transition-colors ${isTheaterMode ? `${activeTheme.primary}` : 'text-gray-400 hover:text-white'}`} title="Toggle Theater Mode"><Tv size={20} /></button>  
                            <button onClick={toggleFullscreen} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors" title="Fullscreen">{isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}</button>  
                            <div className="w-px h-6 bg-white/10 mx-2"></div>  
                            <button onClick={() => setBrowserFix(!browserFix)} className={`p-2 hover:bg-white/10 rounded-full transition-colors ${browserFix ? 'text-blue-400' : 'text-gray-500 hover:text-gray-400'}`} title={browserFix ? "Browser Fix ON (Anti-Freeze)" : "Browser Fix OFF"}><Globe size={20} /></button>  
                        </div>  
                        {isSharing ? (<><div className="w-px h-6 bg-white/10"></div><button onClick={stopSharing} className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2"><ScreenShareOff size={14} /> STOP</button></>) : null}  
                    </div>  
                </div>  
            </div>  
        </div>  
      </div>  
      <div className={`bg-black/40 backdrop-blur-xl flex flex-col md:flex-none min-h-0 min-w-0 transition-all duration-500 ease-in-out rounded-l-3xl border-l shadow-2xl overflow-hidden ${isTheaterMode || isFullscreen ? 'w-0 max-w-0 opacity-0 border-0 pointer-events-none' : 'w-80 opacity-100'} ${activeTheme.border} ${activeTheme.glow}`}>  
          <div className={`min-w-[320px] h-full flex flex-col transition-transform duration-500 ease-in-out ${isTheaterMode || isFullscreen ? 'translate-x-full' : 'translate-x-0'}`}>  
            <div className="flex p-2 gap-2"><button onClick={() => setActiveTab('chat')} className={`flex-1 py-2 text-xs font-bold rounded-full transition-all ${activeTab === 'chat' ? `bg-white/10 text-white` : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>CHAT</button><button onClick={() => setActiveTab('members')} className={`flex-1 py-2 text-xs font-bold rounded-full transition-all ${activeTab === 'members' ? `bg-white/10 text-white` : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>MEMBERS</button></div>  
            <div className="flex-1 relative overflow-hidden flex flex-col">{activeTab === 'chat' && <div className="absolute inset-0 flex flex-col"><Chat messages={messages} onSendMessage={handleSendMessage} onAddReaction={() => {}} onHypeEmoji={handleHypeAction} onPickerAction={handlePickerInteraction} myId={'HOST'} theme={activeTheme} onInputFocus={() => setIsInputFocused(true)} onInputBlur={() => setIsInputFocused(false)} onInputChange={resetInputIdleTimer} /></div>}{activeTab === 'members' && (<div className="p-4 space-y-2 overflow-y-auto">{members.map(m => (<div key={m.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors"><div className="flex items-center gap-3"><div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${m.isHost ? `bg-gradient-to-br from-yellow-400 to-orange-500 text-black` : 'bg-white/10 text-white'}`}>{m.name[0]}</div><span className="text-sm font-medium text-gray-200">{m.name}</span></div>{m.isHost && <Crown size={14} className="text-yellow-500 drop-shadow-md" />}</div>))}</div>)}</div>  
          </div>  
      </div>  
    </div>  
  );  
};
