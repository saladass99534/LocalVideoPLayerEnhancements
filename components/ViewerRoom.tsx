import React, { useState, useEffect, useRef } from 'react';
import SimplePeer from 'simple-peer';
import { Button } from './Button';
import { Chat, ChatHandle } from './Chat';
import { ChatMessage, generateRandomName, Member, ReplyContext, StreamStats, FloatingEmoji } from '../types';
import { Wifi, Tv, Users, Crown, X, Play, Pause, Volume2, VolumeX, Maximize, ArrowLeft, AlertCircle, Activity, Minimize, PictureInPicture, Clapperboard, FileVideo, Eye, EyeOff } from 'lucide-react';

interface ViewerRoomProps {
  onBack: () => void;
}

// --- THEME CONFIG (Same as Host) ---
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

// Helper function to modify SDP for strict bitrate control (copied from HostRoom)
const setVideoBitrate = (sdp: string, bitrate: number): string => {
    if (bitrate <= 0) return sdp;

    let sdpLines = sdp.split('\r\n');
    let videoMLineIndex = -1;

    for (let i = 0; i < sdpLines.length; i++) {
        if (sdpLines[i].startsWith('m=video')) {
            videoMLineIndex = i;
            break;
        }
    }

    if (videoMLineIndex === -1) {
        return sdp;
    }

    let newSdpLines = sdpLines.filter(line => !line.startsWith('b=AS:'));
    newSdpLines.splice(videoMLineIndex + 1, 0, `b=AS:${bitrate}`);
    
    let codecPayloadType = -1;
    const codecRegex = /a=rtpmap:(\d+) (VP9|H264)\/90000/;
    for (const line of newSdpLines) {
        const match = line.match(codecRegex);
        if (match) {
            codecPayloadType = parseInt(match[1], 10);
            if (line.includes('VP9')) break;
        }
    }
    
    if (codecPayloadType !== -1) {
        let fmtpLineIndex = -1;
        for (let i = 0; i < newSdpLines.length; i++) {
            if (newSdpLines[i].startsWith(`a=fmtp:${codecPayloadType}`)) {
                fmtpLineIndex = i;
                break;
            }
        }
        
        const bitrateParams = `x-google-min-bitrate=${bitrate};x-google-start-bitrate=${bitrate};x-google-max-bitrate=${bitrate}`;

        if (fmtpLineIndex !== -1) {
            const existingLine = newSdpLines[fmtpLineIndex];
            if (!existingLine.includes('x-google-min-bitrate')) {
                 newSdpLines[fmtpLineIndex] = `${existingLine}; ${bitrateParams}`;
            }
        } else {
            let rtpmapLineIndex = newSdpLines.findIndex(line => line.startsWith(`a=rtpmap:${codecPayloadType}`));
            if(rtpmapLineIndex !== -1) {
                newSdpLines.splice(rtpmapLineIndex + 1, 0, `a=fmtp:${codecPayloadType} ${bitrateParams}`);
            }
        }
    }
    
    return newSdpLines.join('\r\n');
};

export const ViewerRoom: React.FC<ViewerRoomProps> = ({ onBack }) => {
  const [username] = useState(generateRandomName());
  const [myUserId] = useState(() => 'user-' + Date.now() + Math.random().toString(36).substr(2, 5));
  const [currentTheme, setCurrentTheme] = useState<keyof typeof THEMES>('default');
  
  const [hostIpInput, setHostIpInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  
  const [activeTab, setActiveTab] = useState<'chat' | 'members'>('chat');
  const [hasStream, setHasStream] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isInputFocused, setIsInputFocused] = useState(false); 
  const [isInputIdle, setIsInputIdle] = useState(false); 
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showNerdStats, setShowNerdStats] = useState(false); 
  const [pickerStep, setPickerStep] = useState<'idle' | 'type' | 'genre' | 'reveal'>('idle');

  // --- NEW STATES FOR METADATA & SUBS ---
  const [movieTitle, setMovieTitle] = useState<string>("");
  const [currentSubtitleText, setCurrentSubtitleText] = useState('');
  const [ccSize, setCcSize] = useState<'small' | 'medium' | 'large'>('medium');
  // --------------------------------------
  
  // Mobile Detection & Viewport
  const [isMobile, setIsMobile] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(typeof window !== 'undefined' ? window.innerHeight : 0);
  const [areControlsHidden, setAreControlsHidden] = useState(false);

  // Audio State
  const [volume, setVolume] = useState(1); // Default to 100%
  const prevVolumeRef = useRef(1);
  
  const [stats, setStats] = useState<StreamStats>({ resolution: 'N/A', bitrate: '0', fps: 0, packetLoss: '0', latency: '0' });
  
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);

  const peerRef = useRef<SimplePeer.Instance | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ambilightRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatRef = useRef<ChatHandle>(null);
  const inputIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enforcedBitrateRef = useRef<number>(0);
  const lastStatsRef = useRef<{ timestamp: number; bytesReceived: number } | null>(null);

  const electronAvailable = typeof window !== 'undefined' && window.electron !== undefined;
  const activeTheme = THEMES[currentTheme] || THEMES['default'];

  // Handle Mobile Viewport Resize (Keyboard detection)
  useEffect(() => {
      const handleResize = () => {
          const isMob = window.innerWidth < 768;
          setIsMobile(isMob);
          // Use visualViewport if available to account for virtual keyboard
          if (window.visualViewport) {
              setViewportHeight(window.visualViewport.height);
          } else {
              setViewportHeight(window.innerHeight);
          }
      };

      handleResize();
      
      window.addEventListener('resize', handleResize);
      window.visualViewport?.addEventListener('resize', handleResize);
      
      return () => {
          window.removeEventListener('resize', handleResize);
          window.visualViewport?.removeEventListener('resize', handleResize);
      };
  }, []);

  useEffect(() => {
      if (!electronAvailable) {
          const hostname = window.location.hostname;
          if (hostname && hostname !== 'localhost' && hostname !== '12-7.0.0.1') {
              setHostIpInput(hostname);
          }
      }
  }, [electronAvailable]);

  // Audio Volume Logic
  const toggleMute = () => {
      if (volume > 0) {
          prevVolumeRef.current = volume;
          setVolume(0);
      } else {
          setVolume(prevVolumeRef.current > 0 ? prevVolumeRef.current : 0.5);
      }
  };

  // Sync volume with video element
  useEffect(() => {
      if (videoRef.current) {
          videoRef.current.volume = volume;
          videoRef.current.muted = (volume === 0);
      }
  }, [volume]);

  const connectToHost = () => {
      if (!hostIpInput) return;
      setIsConnecting(true);

      if (electronAvailable) {
          window.electron.connectToHost(hostIpInput, 65432);
      } else {
          connectWebMode(hostIpInput, 65432);
      }
  };

  const connectWebMode = (ip: string, port: number) => {
      try {
          const ws = new WebSocket(`ws://${ip}:${port}`);
          socketRef.current = ws;

          ws.onopen = () => {
              setIsConnected(true);
          };

          ws.onmessage = (event) => {
              try {
                  const parsed = JSON.parse(event.data);
                  handleSignal(parsed);
              } catch (e) {
                  console.error("Web socket parse error", e);
              }
          };

          ws.onerror = (err) => {
              console.error("WebSocket error", err);
              alert("Connection failed. Ensure Host is online and Tailscale is active.");
              setIsConnecting(false);
              setIsConnected(false);
          };

          ws.onclose = () => {
              alert("Disconnected from Host");
              setIsConnected(false);
              setHasStream(false);
              if (peerRef.current) peerRef.current.destroy();
              peerRef.current = null;
          };

      } catch (e) {
          alert("Failed to create WebSocket: " + e);
          setIsConnecting(false);
      }
  };

  const handleSignal = (payload: any) => {
        if (payload.type === 'signal') {
            if (!peerRef.current) {
                const p = new SimplePeer({
                    initiator: false,
                    trickle: false
                });

                p.on('signal', (data) => {
                    if (data.type === 'answer' && enforcedBitrateRef.current > 0) {
                        data.sdp = setVideoBitrate(data.sdp!, enforcedBitrateRef.current);
                    }
                    const signalPayload = { type: 'signal', data };
                    if (electronAvailable) {
                        window.electron.guestSendSignal(signalPayload);
                    } else if (socketRef.current?.readyState === WebSocket.OPEN) {
                        socketRef.current.send(JSON.stringify(signalPayload));
                    }
                });

                p.on('connect', () => {
                    setIsConnecting(false);
                    const joinMsg = JSON.stringify({ type: 'join', name: username });
                    p.send(joinMsg);
                });

                p.on('stream', (stream) => {
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                        videoRef.current.volume = volume; // Ensure initial volume is set
                        videoRef.current.play().then(() => setIsPlaying(true)).catch(e => console.log("Autoplay blocked", e));
                        setHasStream(true);
                    }
                    if (ambilightRef.current) {
                        ambilightRef.current.srcObject = stream;
                        ambilightRef.current.play().catch(() => {});
                    }
                });

                p.on('data', (data) => {
                    try {
                        const msg = JSON.parse(data.toString());
                        if (msg.type === 'chat') {
                            const newMsg = msg.payload;
                            if (newMsg.isSystemEvent && newMsg.eventPayload) {
                                setPickerStep(newMsg.eventPayload.state);
                            }
                            setMessages(prev => {
                                if (prev.some(m => m.id === newMsg.id)) return prev;
                                return [...prev, newMsg];
                            });
                        }
                        if (msg.type === 'members') setMembers(msg.payload);
                        
                        if (msg.type === 'hype') {
                            spawnHypeEmojis(msg.payload.emoji); // Spawn locally only
                        }

                        if (msg.type === 'theme_change') {
                            setCurrentTheme(msg.payload);
                        }

                        if (msg.type === 'bitrate_sync') {
                            enforcedBitrateRef.current = msg.payload;
                        }

                        if (msg.type === 'stream_stopped') {
                            setHasStream(false);
                            setIsPlaying(false);
                            if (videoRef.current) videoRef.current.srcObject = null;
                            if (ambilightRef.current) ambilightRef.current.srcObject = null;
                            lastStatsRef.current = null;
                            setMovieTitle("");
                            setCurrentSubtitleText("");
                        }

                        // --- NEW LISTENERS FOR METADATA & SUBS ---
                        if (msg.type === 'metadata') {
                            setMovieTitle(msg.payload.title);
                        }
                        if (msg.type === 'subtitle_update') {
                            setCurrentSubtitleText(msg.payload);
                        }
                        if (msg.type === 'cc_size') {
                            setCcSize(msg.payload);
                        }
                        // -----------------------------------------
                        
                    } catch (e) { console.error("Parse error", e); }
                });
                
                peerRef.current = p;
            }
            
            // Extract piggybacked bitrate from offer before signaling
            if (payload.bitrate) {
                enforcedBitrateRef.current = payload.bitrate;
            }
            peerRef.current.signal(payload.data);
        }
  };

  const spawnHypeEmojis = (emoji: string) => {
      const newEmojis = Array.from({ length: 20 }).map((_, i) => ({
          id: Math.random().toString(36) + i,
          emoji,
          x: Math.random() * 90 + 5,
          animationDuration: 3 + Math.random() * 4
      }));

      setFloatingEmojis(prev => [...prev, ...newEmojis]);
      
      setTimeout(() => {
          setFloatingEmojis(prev => prev.filter(e => !newEmojis.some(ne => ne.id === e.id)));
      }, 8000);
  };

  useEffect(() => {
      if (hasStream && showNerdStats && peerRef.current) {
          statsIntervalRef.current = setInterval(() => {
              const peer = peerRef.current as any;
              if (peer && peer._pc) {
                  peer._pc.getStats().then((reports: any) => {
                      reports.forEach((report: any) => {
                          if (report.type === 'inbound-rtp' && report.kind === 'video') {
                              if (videoRef.current) {
                                  if (lastStatsRef.current) {
                                      // Reset detection: if the new byte count is less than the old one,
                                      // it means the counter has reset. We should skip this calculation round.
                                      if (report.bytesReceived < lastStatsRef.current.bytesReceived) {
                                          // Just update the reference for the next calculation and continue
                                          lastStatsRef.current = {
                                              timestamp: report.timestamp,
                                              bytesReceived: report.bytesReceived,
                                          };
                                          return;
                                      }

                                      const bytesSinceLast = report.bytesReceived - lastStatsRef.current.bytesReceived;
                                      const timeSinceLast = report.timestamp - lastStatsRef.current.timestamp;
                                      
                                      if (timeSinceLast > 0) {
                                          const bitrate = Math.round((bytesSinceLast * 8) / timeSinceLast); // kbps
                                          setStats(prev => ({ ...prev, bitrate: `${(bitrate / 1000).toFixed(1)} Mbps` }));
                                      }
                                  }
                                  // Update the reference for the next interval
                                  lastStatsRef.current = {
                                      timestamp: report.timestamp,
                                      bytesReceived: report.bytesReceived,
                                  };

                                  setStats(prev => ({
                                      ...prev,
                                      resolution: `${videoRef.current?.videoWidth}x${videoRef.current?.videoHeight}`,
                                      fps: report.framesPerSecond || 0,
                                      packetLoss: report.packetsLost ? `${report.packetsLost}` : '0'
                                  }));
                              }
                          }
                          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                              setStats(prev => ({
                                  ...prev,
                                  latency: `${Math.round(report.currentRoundTripTime * 1000)} ms`,
                              }));
                          }
                      });
                  });
              }
          }, 1000);
      } else {
          if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
          lastStatsRef.current = null;
      }
      return () => {
          if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
      };
  }, [hasStream, showNerdStats]);

  const toggleFullscreen = () => {
    const elem = containerRef.current;
    const videoElem = videoRef.current as any;

    if (!document.fullscreenElement && !((document as any).webkitFullscreenElement)) {
        if (elem?.requestFullscreen) {
            elem.requestFullscreen().catch(err => {
               if (videoElem && videoElem.webkitEnterFullscreen) {
                   videoElem.webkitEnterFullscreen();
               }
            });
        } 
        else if (videoElem && videoElem.webkitEnterFullscreen) {
            videoElem.webkitEnterFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
            (document as any).webkitExitFullscreen();
        }
    }
  };

  const toggleTheaterMode = () => {
    if (isFullscreen) {
      document.exitFullscreen();
    } else {
      setIsTheaterMode(!isTheaterMode);
    }
  };

  const togglePiP = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (videoRef.current && videoRef.current !== document.pictureInPictureElement) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.error("PiP failed", err);
    }
  };

  const togglePlay = () => {
      if (videoRef.current) {
          if (videoRef.current.paused) {
              videoRef.current.play().catch(console.error);
          } else {
              videoRef.current.pause();
          }
      }
  };

  useEffect(() => {
    const handleFsChange = () => {
        const isFs = !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
        setIsFullscreen(isFs);
        if (!isFs) {
            setIsTheaterMode(false);
        }
    };
    
    const handleWebkitEnd = () => {
        setIsFullscreen(false);
        setIsTheaterMode(false);
        if (videoRef.current && !videoRef.current.ended) {
            videoRef.current.play().catch(e => console.log("Resume failed:", e));
        }
    };
    const handleWebkitBegin = () => setIsFullscreen(true);

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    
    const videoEl = videoRef.current;
    if (videoEl) {
        videoEl.addEventListener('webkitendfullscreen', handleWebkitEnd);
        videoEl.addEventListener('webkitbeginfullscreen', handleWebkitBegin);
    }

    return () => {
        document.removeEventListener('fullscreenchange', handleFsChange);
        document.removeEventListener('webkitfullscreenchange', handleFsChange);
        if (videoEl) {
            videoEl.removeEventListener('webkitendfullscreen', handleWebkitEnd);
            videoEl.removeEventListener('webkitbeginfullscreen', handleWebkitBegin);
        }
    };
  }, [hasStream]);

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

    const handleMouseMove = () => {
        setShowControls(true);
        resetInputIdleTimer();
        resetControlsTimeout();
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

  useEffect(() => {
      resetInputIdleTimer();
  }, [isInputFocused]);

  // Escape key for Theater Mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTheaterMode) {
        setIsTheaterMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTheaterMode]);

  // Auto-wake chat
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

  useEffect(() => {
      if (!electronAvailable) return;

      window.electron.onGuestConnected(() => {
          setIsConnected(true);
      });

      window.electron.onGuestSignalReceived((payload) => {
          handleSignal(payload);
      });

      window.electron.onGuestError((err) => {
          alert("Connection Error: " + err);
          setIsConnecting(false);
          setIsConnected(false);
      });

      window.electron.onGuestDisconnected(() => {
          alert("Disconnected from Host");
          setIsConnected(false);
          setHasStream(false);
          if (peerRef.current) peerRef.current.destroy();
          peerRef.current = null;
      });

      return () => {
          window.electron.removeAllListeners('guest-connected');
          window.electron.removeAllListeners('guest-signal-received');
          window.electron.removeAllListeners('guest-error');
          window.electron.removeAllListeners('guest-disconnected');
          if (peerRef.current) peerRef.current.destroy();
      };
  }, [username, electronAvailable]);

  const handleSendMessage = (text: string, type: 'text' | 'gif' = 'text') => {
      if (peerRef.current?.connected) {
          const msg = { 
            id: Date.now().toString(), 
            senderId: myUserId, 
            senderName: username, 
            text, 
            timestamp: Date.now(),
            type 
          };
          setMessages(prev => {
              if (prev.some(m => m.id === msg.id)) return prev;
              return [...prev, msg];
          });
          peerRef.current.send(JSON.stringify({ type: 'chat', payload: msg }));
      }
  };

  const handleSendHype = (emoji: string) => {
      spawnHypeEmojis(emoji); 
      if (peerRef.current?.connected) {
          peerRef.current.send(JSON.stringify({ type: 'hype', payload: { emoji } }));
      }
  };

  const handlePickerAction = (action: string, value?: string) => {
      if (peerRef.current?.connected) {
          peerRef.current.send(JSON.stringify({ 
              type: 'picker_action', 
              payload: { action, value } 
          }));
      }
  };

  if (!isConnected && !hasStream) {
     return (
       <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 relative">
         <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
         <button onClick={onBack} className="absolute top-8 left-8 text-gray-400 hover:text-white flex items-center gap-2 z-20"><ArrowLeft size={16} /> Back</button>
         <div className="relative z-10 max-w-md w-full bg-white/5 backdrop-blur-xl rounded-3xl p-8 border border-white/10 shadow-2xl">
           <div className="flex justify-center mb-6"><div className="bg-purple-500/20 p-4 rounded-2xl"><Users className="text-purple-400 w-8 h-8" /></div></div>
           <h2 className="text-3xl font-bold text-center text-white mb-2">Join Party</h2>
           <p className="text-gray-400 text-center mb-8 text-sm">
               {electronAvailable ? "Enter Host IP Address" : "Connect to Host"}
           </p>
           <div className="space-y-6">
             <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Host IP Address</label>
                <input type="text" value={hostIpInput} onChange={(e) => setHostIpInput(e.target.value)} placeholder="100.x.x.x" className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
             </div>
             <Button className="w-full py-4" size="lg" onClick={connectToHost} isLoading={isConnecting} disabled={!hostIpInput}>{isConnecting ? 'CONNECTING...' : 'JOIN'}</Button>
             {!electronAvailable && <p className="text-blue-400 text-xs text-center mt-2">Running in Web Mode</p>}
           </div>
         </div>
       </div>
     );
  }

  const mobileTypingMode = isMobile && isInputFocused;
  const controlsVisible = showControls || (isInputFocused && !isInputIdle);
  const sidebarCollapsed = isTheaterMode || isFullscreen;

  // Render Mobile Layout
  if (isMobile) {
    return (
        <div style={{ height: viewportHeight }} className="flex flex-col h-full bg-[#111] text-gray-100 overflow-hidden font-sans">
            {/* Video Area (Sticky Top) */}
            <div className={`relative bg-black ${mobileTypingMode ? 'h-[30vh] flex-shrink-0' : 'flex-1'}`}>
                {/* All video-related overlays and elements go here */}
                <div 
                    ref={containerRef}
                    className="w-full h-full flex items-center justify-center relative bg-black group"
                    onClick={() => { if (!electronAvailable) { setShowControls(!showControls); } }}
                >
                    {showExitConfirm && ( <div className="absolute inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"><div className="bg-[#1e1f22] border border-white/10 rounded-2xl p-6 max-w-sm w-full"><h3 className="text-lg font-bold">Leave Party?</h3><p className="text-sm text-gray-400 my-4">You will be disconnected.</p><div className="flex gap-3 justify-end"><Button variant="ghost" onClick={() => setShowExitConfirm(false)}>Cancel</Button><Button variant="danger" onClick={onBack}>Leave</Button></div></div></div> )}
                    
                    <div className="absolute top-0 right-0 z-20 p-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <div className={`transition-opacity duration-300 ${controlsVisible && !areControlsHidden ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                            <Button size="sm" variant="danger" onClick={() => setShowExitConfirm(true)} className="rounded-full px-4">
                                Leave
                            </Button>
                        </div>
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setAreControlsHidden(prev => !prev)}
                            className="rounded-full !p-2 backdrop-blur-md bg-black/40 border border-white/10"
                            title={areControlsHidden ? 'Show Controls' : 'Hide Controls'}
                        >
                            {areControlsHidden ? <Eye size={16} /> : <EyeOff size={16} />}
                        </Button>
                    </div>
                    
                    {/* Hype Emojis */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none z-40"> 
                        {floatingEmojis.map(emoji => (
                            <div key={emoji.id} className="absolute bottom-0 text-6xl animate-float" style={{left: `${emoji.x}%`, animationDuration: `${emoji.animationDuration}s`}}>
                                {emoji.emoji}
                            </div>
                        ))} 
                        <style>{`@keyframes float { 0% { transform: translateY(100%) scale(0.8); opacity: 0; } 10% { opacity: 1; transform: translateY(80%) scale(1.2); } 100% { transform: translateY(-150%) scale(1); opacity: 0; } } .animate-float { animation-name: float; animation-timing-function: ease-out; }`}</style>
                    </div>

                    {/* Nerd Stats */}
                    {showNerdStats && ( 
                        <div className="absolute top-16 left-4 bg-black/60 backdrop-blur-md border border-white/10 p-3 rounded-lg z-30 text-[10px] font-mono pointer-events-none">
                            <h4 className={`${activeTheme.primary} font-bold mb-1`}>STREAM STATS</h4>
                            <div className="grid grid-cols-2 gap-x-4">
                                <span>Res:</span><span>{stats.resolution}</span>
                                <span>FPS:</span><span>{Math.round(stats.fps)}</span>
                                <span>Bitrate:</span><span className="text-green-400">{stats.bitrate}</span>
                                <span>Ping:</span><span className="text-yellow-400">{stats.latency}</span>
                            </div>
                        </div> 
                    )}

                    {!hasStream && <div className="text-center"><div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-white/10 animate-blob"><Tv size={32} className="text-gray-500"/></div><p className="text-gray-500 font-medium">Waiting for stream...</p></div>}
                    <video ref={ambilightRef} className="absolute inset-0 w-full h-full object-cover blur-[80px] opacity-60" muted />
                    <video ref={videoRef} className={`relative z-10 w-full h-full object-contain ${!hasStream ? 'hidden' : ''}`} autoPlay playsInline onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
                    
                    {currentSubtitleText && hasStream && (
                        <div className="absolute bottom-16 left-0 right-0 flex justify-center pointer-events-none z-30 px-4">
                            <span 
                                className="bg-black/60 text-white rounded-md px-2 py-0.5 text-center backdrop-blur-sm"
                                style={{
                                    fontSize: ccSize === 'small' ? '0.8rem' : ccSize === 'medium' ? '1rem' : '1.5rem',
                                    textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                                    fontFamily: 'sans-serif',
                                    maxWidth: '90%'
                                }}
                            >
                                {currentSubtitleText}
                            </span>
                        </div>
                    )}
                    
                    {/* --- FIX 4: INSERTED OVERLAY CHAT (THEATER MODE) --- */}
                    {(isTheaterMode || isFullscreen) && (
                        <div 
                            className="absolute bottom-20 left-0 w-full z-[60] px-2"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Chat 
                                ref={chatRef} 
                                messages={messages} 
                                onSendMessage={handleSendMessage} 
                                onAddReaction={() => {}} 
                                onHypeEmoji={handleSendHype} 
                                onPickerAction={handlePickerAction} 
                                myId={myUserId} 
                                isOverlay={true} 
                                inputVisible={controlsVisible && !areControlsHidden} 
                                onInputFocus={() => setIsInputFocused(true)} 
                                onInputBlur={() => setIsInputFocused(false)} 
                                onInputChange={resetInputIdleTimer} 
                                theme={activeTheme}
                            />
                        </div>
                    )}

                    {/* Controls */}
                    <div onClick={(e) => e.stopPropagation()} className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-50 transition-all ${controlsVisible && !areControlsHidden ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/40 backdrop-blur-xl border border-white/10">
                            <button onClick={togglePlay} className="p-2 text-white">{isPlaying ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}</button>
                            <button onClick={toggleMute} className="p-2">{volume === 0 ? <VolumeX size={18} className="text-red-400"/> : <Volume2 size={18} className="text-white"/>}</button>
                            <div className="w-px h-5 bg-white/20"/>
                            <button onClick={() => setShowNerdStats(!showNerdStats)} className={`p-2 rounded-full ${showNerdStats ? activeTheme.primary : 'text-white'}`}><Activity size={18}/></button>
                            <button onClick={togglePiP} className="p-2 text-white"><PictureInPicture size={18}/></button>
                            <button onClick={toggleTheaterMode} className={`p-2 rounded-full ${isTheaterMode ? activeTheme.primary : 'text-white'}`}><Tv size={18}/></button>
                            <button onClick={toggleFullscreen} className="p-2 text-white">{isFullscreen ? <Minimize size={18}/> : <Maximize size={18}/>}</button>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Chat/Members Area */}
            <div className={`flex-1 min-h-0 flex flex-col bg-[#1e1f22] ${isTheaterMode ? 'hidden' : ''}`}>
                <div className="flex p-2 gap-2"><button onClick={() => setActiveTab('chat')} className={`flex-1 py-2 text-xs font-bold rounded-full ${activeTab === 'chat' ? 'bg-white/10' : ''}`}>CHAT</button><button onClick={() => setActiveTab('members')} className={`flex-1 py-2 text-xs font-bold rounded-full ${activeTab === 'members' ? 'bg-white/10' : ''}`}>MEMBERS</button></div>
                <div className="flex-1 relative min-h-0">
                    {activeTab === 'chat' && <div className="absolute inset-0 flex flex-col"><Chat messages={messages} onSendMessage={handleSendMessage} onAddReaction={() => {}} onHypeEmoji={handleSendHype} onPickerAction={handlePickerAction} myId={myUserId} theme={activeTheme} onInputFocus={() => setIsInputFocused(true)} onInputBlur={() => setIsInputFocused(false)} onInputChange={resetInputIdleTimer} /></div>}
                    {activeTab === 'members' && <div className="p-4 space-y-2 overflow-y-auto">{members.map(m => (<div key={m.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold">{m.name[0]}</div><span>{m.name}</span></div>{m.isHost && <Crown size={14} className="text-yellow-500"/>}</div>))}</div>}
                </div>
            </div>
        </div>
    );
  }

  // Render Desktop Layout
  return (
    <div className="flex h-screen bg-[#111] text-gray-100 overflow-hidden font-sans">
      
      {/* Video Area */}
      <div className="flex-1 flex flex-col relative bg-black min-w-0">
        <div 
            ref={containerRef}
            className="flex-1 flex items-center justify-center relative bg-black group"
            onMouseMove={handleMouseMove}
            onClick={() => { if (!electronAvailable) { setShowControls(!showControls); } }}
        >
            {/* Leave Confirmation Modal (Moved inside for fullscreen) */}
            {showExitConfirm && (
                <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
                    <div className="bg-[#1e1f22] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-3 mb-4 text-gray-200">
                            <AlertCircle size={24} />
                            <h3 className="text-lg font-bold">Leave Party?</h3>
                        </div>
                        <p className="text-gray-400 text-sm mb-6">
                            You will be disconnected from the stream.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <Button variant="ghost" onClick={() => setShowExitConfirm(false)}>Cancel</Button>
                            <Button variant="danger" onClick={onBack}>Leave</Button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Top Controls */}
            <div onMouseEnter={clearControlsTimeout} onMouseLeave={resetControlsTimeout} onClick={(e) => e.stopPropagation()} className={`absolute top-0 right-0 z-20 p-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                {/* --- MOVIE TITLE BADGE --- */}
                <div className="flex items-center gap-4">
                    {hasStream && movieTitle && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-black/40 backdrop-blur-xl rounded-full border border-white/10 shadow-lg animate-in slide-in-from-top-2">
                            <FileVideo size={14} className="text-purple-400" />
                            <span className="text-xs font-bold text-gray-200 truncate max-w-[200px]">{movieTitle}</span>
                        </div>
                    )}
                    <Button size="sm" variant="danger" onClick={() => setShowExitConfirm(true)} className="rounded-full px-4">Leave</Button>
                </div>
                {/* ------------------------- */}
            </div>
            
            {/* Floating Emojis */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-40"> {floatingEmojis.map(emoji => (<div key={emoji.id} className="absolute bottom-0 text-6xl animate-float" style={{left: `${emoji.x}%`, animationDuration: `${emoji.animationDuration}s`}}>{emoji.emoji}</div>))} <style>{`@keyframes float { 0% { transform: translateY(100%) scale(0.8); opacity: 0; } 10% { opacity: 1; transform: translateY(80%) scale(1.2); } 100% { transform: translateY(-150%) scale(1); opacity: 0; } } .animate-float { animation-name: float; animation-timing-function: ease-out; }`}</style></div>
            
            {!hasStream && <div className="text-center"><div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-white/10 animate-blob"><Tv size={32} className="text-gray-500"/></div><p className="text-gray-500 font-medium">Waiting for stream...</p></div>}
            
            <video ref={ambilightRef} className="absolute inset-0 w-full h-full object-cover blur-[80px] opacity-60" muted />
            
            {showNerdStats && ( <div className="absolute top-16 left-4 bg-black/60 backdrop-blur-md border border-white/10 p-3 rounded-lg z-30 text-[10px] font-mono"><h4 className={`${activeTheme.primary} font-bold mb-1`}>STREAM STATS (RECV)</h4><div className="grid grid-cols-2 gap-x-4"><span>Resolution:</span><span>{stats.resolution}</span><span>FPS:</span><span>{Math.round(stats.fps)}</span><span>Bitrate:</span><span className="text-green-400">{stats.bitrate}</span><span>Latency:</span><span className="text-yellow-400">{stats.latency}</span><span>Packet Loss:</span><span className="text-red-400">{stats.packetLoss}</span></div></div> )}
            
            {hasStream && !isPlaying && <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30"><button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="bg-white/20 rounded-full p-6"><Play size={48} className="text-white fill-white ml-2"/></button></div>}
            
            <video ref={videoRef} className={`relative z-10 w-full h-full object-contain ${!hasStream ? 'hidden' : ''}`} autoPlay playsInline onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
            
            {/* --- SUBTITLE OVERLAY --- */}
            {currentSubtitleText && hasStream && (
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
            {/* ------------------------ */}

            {(isTheaterMode || isFullscreen) && <div onMouseEnter={clearControlsTimeout} onMouseLeave={resetControlsTimeout} onClick={(e) => e.stopPropagation()} className="absolute bottom-32 left-4 w-[400px] max-w-[80vw] z-[60]"><Chat ref={chatRef} messages={messages} onSendMessage={handleSendMessage} onAddReaction={() => {}} onHypeEmoji={handleSendHype} onPickerAction={handlePickerAction} myId={myUserId} isOverlay={true} inputVisible={controlsVisible} onInputFocus={() => setIsInputFocused(true)} onInputBlur={() => setIsInputFocused(false)} onInputChange={resetInputIdleTimer} theme={activeTheme}/></div>}
            
            <div onMouseEnter={clearControlsTimeout} onMouseLeave={resetControlsTimeout} onClick={(e) => e.stopPropagation()} className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-50 transition-all ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              <div className="flex items-center gap-4 px-6 py-3 rounded-full bg-black/40 backdrop-blur-xl border border-white/10">
                <button onClick={togglePlay} className="p-2 text-white">{isPlaying ? <Pause size={20} fill="currentColor"/> : <Play size={20} fill="currentColor"/>}</button>
                <div className="flex items-center gap-2 group/vol">
                    <button onClick={toggleMute} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors">
                        {volume === 0 ? <VolumeX size={20} className="text-red-400"/> : <Volume2 size={20} />}
                    </button>
                    <div className="w-0 overflow-hidden group-hover/vol:w-20 transition-all duration-300 flex items-center">
                        <input 
                            type="range" min="0" max="1" step="0.05" 
                            value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))}
                            className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer transition-colors bg-white/20 hover:bg-white/30 ${activeTheme.accent} ${activeTheme.primary} [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-current [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:bg-current`}
                        />
                    </div>
                </div>
                <div className="w-px h-6 bg-white/20"/> 
                <div className="flex gap-2 items-center">
                  <button onClick={() => handlePickerAction('start_picker')} disabled={(pickerStep !== 'idle' && pickerStep !== 'reveal')} className={`p-2 rounded-full ${activeTheme.primary}`} title="Suggest Movie"><Clapperboard size={18}/></button>
                  <button onClick={() => setShowNerdStats(!showNerdStats)} className={`p-2 rounded-full ${showNerdStats ? activeTheme.primary : 'text-white'}`} title="Nerd Stats"><Activity size={18}/></button>
                  <button onClick={togglePiP} className="p-2 text-white" title="Picture-in-Picture"><PictureInPicture size={18}/></button>
                  <button onClick={toggleTheaterMode} className={`p-2 rounded-full ${isTheaterMode ? activeTheme.primary : 'text-white'}`} title="Theater Mode"><Tv size={18}/></button>
                  <button onClick={toggleFullscreen} className="p-2 text-white" title="Fullscreen">{isFullscreen ? <Minimize size={18}/> : <Maximize size={18}/>}</button>
                </div>
              </div>
            </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className={`bg-black/40 backdrop-blur-xl flex flex-col md:flex-none min-h-0 min-w-0 transition-all duration-500 ease-in-out rounded-l-3xl border-l shadow-2xl overflow-hidden ${sidebarCollapsed ? 'w-0 max-w-0 opacity-0 border-0' : 'w-80 opacity-100'} ${activeTheme.border} ${activeTheme.glow}`}>
        <div className={`min-w-[320px] h-full flex flex-col transition-transform duration-500 ease-in-out ${sidebarCollapsed ? 'translate-x-full' : 'translate-x-0'}`}>
          <div className="flex p-2 gap-2"><button onClick={() => setActiveTab('chat')} className={`flex-1 py-2 text-xs font-bold rounded-full ${activeTab === 'chat' ? 'bg-white/10' : ''}`}>CHAT</button><button onClick={() => setActiveTab('members')} className={`flex-1 py-2 text-xs font-bold rounded-full ${activeTab === 'members' ? 'bg-white/10' : ''}`}>MEMBERS</button></div>
          <div className="flex-1 relative min-h-0">{activeTab === 'chat' && <div className="absolute inset-0 flex flex-col"><Chat messages={messages} onSendMessage={handleSendMessage} onAddReaction={() => {}} onHypeEmoji={handleSendHype} onPickerAction={handlePickerAction} myId={myUserId} theme={activeTheme} onInputFocus={() => setIsInputFocused(true)} onInputBlur={() => setIsInputFocused(false)} onInputChange={resetInputIdleTimer} /></div>}{activeTab === 'members' && <div className="p-4 space-y-2 overflow-y-auto">{members.map(m => (<div key={m.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl"><div className="flex items-center gap-3"><div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${m.isHost ? 'bg-yellow-400 text-black' : 'bg-white/10'}`}>{m.name[0]}</div><span>{m.name}</span></div>{m.isHost && <Crown size={14} className="text-yellow-500"/>}</div>))}</div>}</div>
        </div>
      </div>
    </div>
  );
};
