import React, { useState, useRef, useEffect } from 'react';
import { HostRoom } from './components/HostRoom';
import { ViewerRoom } from './components/ViewerRoom';
import { AppMode } from './types';
import { Users, ShieldCheck, Zap, ArrowRight, Globe, RefreshCw, Network } from 'lucide-react';

// ... TiltCard Component remains exactly the same ...
interface TiltCardProps {
  children: React.ReactNode;
  onClick: () => void;
  accentColor: string;
}

const TiltCard: React.FC<TiltCardProps> = ({ children, onClick, accentColor }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [glow, setGlow] = useState({ x: 0, y: 0, opacity: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const rotateX = ((y - centerY) / centerY) * -10; 
    const rotateY = ((x - centerX) / centerX) * 10;

    setRotation({ x: rotateX, y: rotateY });
    setGlow({ x, y, opacity: 1 });
  };

  const handleMouseLeave = () => {
    setRotation({ x: 0, y: 0 });
    setGlow({ ...glow, opacity: 0 });
  };

  return (
    <div 
      style={{ perspective: '1000px' }} 
      className="w-full h-full"
      onClick={onClick}
    >
      <div
        ref={ref}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
          transition: 'transform 0.1s ease-out',
        }}
        className="relative w-full h-full bg-white/[0.02] backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden group cursor-pointer"
      >
        <div 
          className="absolute w-[300px] h-[300px] bg-gradient-to-r from-white/10 to-transparent rounded-full blur-3xl pointer-events-none transition-opacity duration-500"
          style={{
            left: glow.x - 150,
            top: glow.y - 150,
            opacity: glow.opacity,
            background: `radial-gradient(circle, ${accentColor}20 0%, transparent 70%)`
          }}
        />
        
        <div className="relative z-10 p-6 md:p-8 h-full flex flex-col">
          {children}
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [mode, setMode] = useState<AppMode>(AppMode.LANDING);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [peers, setPeers] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  
  const electronAvailable = typeof window !== 'undefined' && window.electron !== undefined;

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = (e.clientY / window.innerHeight) * 2 - 1;
      setMousePos({ x, y });
    };
    window.addEventListener('mousemove', handleGlobalMouseMove);
    
    // Initial Scan
    if (electronAvailable) {
        scanNetwork();
    }

    return () => window.removeEventListener('mousemove', handleGlobalMouseMove);
  }, []);

  const scanNetwork = async () => {
      if (!electronAvailable) return;
      setScanning(true);
      try {
          const status = await window.electron.getTailscaleStatus();
          const peerList = [];
          if (status.Peer) {
              for (const key in status.Peer) {
                  peerList.push(status.Peer[key]);
              }
          }
          setPeers(peerList);
      } catch (e) {
          console.error("Scan failed", e);
      } finally {
          setScanning(false);
      }
  };

  if (mode === AppMode.HOST) {
    return <HostRoom onBack={() => setMode(AppMode.LANDING)} />;
  }

  if (mode === AppMode.VIEWER) {
    return <ViewerRoom onBack={() => setMode(AppMode.LANDING)} />;
  }

  return (
    // UPDATED CONTAINER: min-h-screen ensures it grows if content grows. pb-24 adds padding at bottom for mobile scrolling.
    <div className="min-h-screen w-full bg-black text-white selection:bg-blue-500/30 font-sans relative overflow-x-hidden">
      
      {/* --- LIVING BACKGROUND (Fixed, so it stays put while you scroll) --- */}
      <div className="fixed inset-0 z-0 pointer-events-none">
         <div 
           className="absolute top-[-10%] left-[20%] w-[40vw] h-[40vw] bg-purple-900/20 rounded-full blur-[128px] animate-blob"
           style={{ transform: `translate(${mousePos.x * -20}px, ${mousePos.y * -20}px)` }}
         />
         <div 
           className="absolute bottom-[-10%] right-[10%] w-[35vw] h-[35vw] bg-blue-900/10 rounded-full blur-[128px] animate-blob animation-delay-2000"
           style={{ transform: `translate(${mousePos.x * 20}px, ${mousePos.y * 20}px)` }}
         />
         
         <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
         <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)]"></div>
      </div>

      {/* UPDATED: Added pb-24 to ensure bottom content isn't cut off on phones */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-8 md:pt-12 pb-24 flex flex-col items-center">
        
        {/* Navbar */}
        <div className="w-full flex justify-between items-center mb-12">
           <div className="flex gap-6 text-sm text-gray-400 font-mono uppercase tracking-widest">
              <span className="hover:text-white transition-colors cursor-pointer">Protocol v2.1</span>
           </div>
           <div className={`flex items-center gap-2 text-[10px] md:text-xs border rounded-full px-3 py-1 ${electronAvailable ? 'text-green-400 border-green-500/20 bg-green-500/5' : 'text-blue-400 border-blue-500/20 bg-blue-500/5'}`}>
              <div className={`w-2 h-2 rounded-full ${electronAvailable ? 'bg-green-500 animate-pulse' : 'bg-blue-500'}`}></div>
              <span>{electronAvailable ? 'DESKTOP MODE' : 'WEB MODE'}</span>
           </div>
        </div>

        {/* HERO */}
        <div className="text-center max-w-5xl mx-auto mt-4 mb-16 relative">
           <div className="relative inline-block mb-6 group cursor-default">
              <div className="absolute inset-0 bg-blue-600/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
              {/* UPDATED: Text sizes to better fit mobile */}
              <h1 className="text-4xl sm:text-6xl md:text-9xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-gray-500 drop-shadow-2xl leading-tight">
                SheiyuWatch
              </h1>
           </div>
           
           <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 backdrop-blur-md text-xs md:text-sm font-medium text-blue-300 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <ShieldCheck size={14} className="md:w-4 md:h-4" />
              <span>Tailscale Optimized P2P Network</span>
           </div>
           
           <p className="text-base md:text-2xl text-gray-400 max-w-2xl mx-auto leading-relaxed mb-8 font-light px-4">
             Serverless, High-Fidelity Screen Sharing.<br/>
             <span className="text-white font-normal">Connect via Tailscale. 0% compression artifacts.</span>
           </p>
        </div>

        {/* CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl mb-20">
            {/* Host Card - Disable on Web */}
            <div className={`h-[280px] md:h-[350px] ${!electronAvailable ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
              <TiltCard onClick={() => electronAvailable && setMode(AppMode.HOST)} accentColor="#3b82f6">
                  <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/5 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-blue-500/20">
                     <Zap className="text-blue-400 w-8 h-8" />
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold mb-2">Host Party</h2>
                  <p className="text-gray-400 mb-8 text-sm">Broadcast your screen in 1080p 60fps to your Tailnet.</p>
                  <div className="mt-auto flex items-center gap-3 text-blue-400 font-medium uppercase tracking-wider text-sm">
                    {electronAvailable ? 'Initialize' : 'Desktop App Required'} <ArrowRight size={16} />
                  </div>
              </TiltCard>
            </div>

            {/* Viewer Card - Always Active */}
            <div className="h-[280px] md:h-[350px]">
              <TiltCard onClick={() => setMode(AppMode.VIEWER)} accentColor="#a855f7">
                  <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/5 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-purple-500/20">
                     <Users className="text-purple-400 w-8 h-8" />
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold mb-2">Join Party</h2>
                  <p className="text-gray-400 mb-8 text-sm">Connect to a host IP address directly.</p>
                  <div className="mt-auto flex items-center gap-3 text-purple-400 font-medium uppercase tracking-wider text-sm">
                    Connect <ArrowRight size={16} />
                  </div>
              </TiltCard>
            </div>
        </div>

        {/* TAILSCALE DISCOVERY PANEL - Hide on Web */}
        {electronAvailable && (
            <div className="w-full max-w-4xl border-t border-white/10 pt-10">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <Network size={16} /> Tailscale Network Discovery
                    </h3>
                    <button onClick={scanNetwork} className={`p-2 rounded-full hover:bg-white/10 transition-colors ${scanning ? 'animate-spin' : ''}`}>
                        <RefreshCw size={16} className="text-gray-400" />
                    </button>
                </div>
                
                {/* Grid automatically stacks on mobile (grid-cols-1) and expands on desktop (md:grid-cols-3) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {peers.length === 0 ? (
                        <div className="col-span-1 md:col-span-3 text-center py-8 border border-dashed border-white/10 rounded-xl">
                            <p className="text-gray-500 text-sm">
                                No active Tailscale peers found.
                            </p>
                            <p className="text-gray-600 text-xs mt-2">
                                Mac Users: Ensure Tailscale is open and installed in /Applications.
                            </p>
                        </div>
                    ) : (
                        peers.map((peer, i) => (
                            <div key={i} className="bg-white/5 border border-white/5 p-4 rounded-xl flex items-center justify-between hover:bg-white/10 transition-colors">
                                <div className="overflow-hidden">
                                    <p className="font-bold text-white text-sm truncate">{peer.HostName}</p>
                                    <p className="text-xs text-gray-500 font-mono mt-1">{peer.TailscaleIPs[0]}</p>
                                </div>
                                <div className="flex gap-2 flex-shrink-0">
                                    <button 
                                        onClick={() => { navigator.clipboard.writeText(peer.TailscaleIPs[0]); }}
                                        className="p-1.5 bg-black/50 rounded-lg text-gray-400 hover:text-white"
                                        title="Copy IP"
                                    >
                                        <Globe size={14} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        )}

      </div>
    </div>
  );
}