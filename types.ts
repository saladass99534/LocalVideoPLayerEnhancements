export enum AppMode {
  LANDING = 'LANDING',
  HOST = 'HOST',
  VIEWER = 'VIEWER',
}

export interface Reaction {
  emoji: string;
  users: string[]; 
  count: number;
}

export interface ReplyContext {
  id: string;
  senderName: string;
  text: string;
}

// --- SHARED PICKER TYPES ---
export interface PickerEvent {
  state: 'type_selection' | 'genre_selection' | 'reveal';
  mediaType?: 'Movie' | 'Show';
  genre?: string;
  movies?: { title: string; year: string; tagline: string; rating: string }[];
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
  isSystemEvent?: boolean; // New flag for widgets
  eventPayload?: PickerEvent; // Payload for widgets
  type?: 'text' | 'gif';
  replyTo?: ReplyContext;
  reactions?: Record<string, Reaction>;
}

export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

export interface Member {
  id: string;
  name: string;
  isHost: boolean;
}

// Electron Types
export interface DesktopSource {
  id: string;
  name: string;
  thumbnail: string; // Data URL
}

// Stream Stats for Nerd Mode
export interface StreamStats {
  resolution: string;
  bitrate: string; // Mbps
  fps: number;
  packetLoss: string; // Percentage
  latency: string; // ms
}

// 3D Floating Emoji
export interface FloatingEmoji {
  id: string;
  emoji: string;
  x: number; // random start percentage
  animationDuration: number;
}

declare global {
  interface Window {
    electron: {
      getTailscaleStatus: () => Promise<any>;
      getDesktopSources: () => Promise<DesktopSource[]>;
      setWindowOpacity: (opacity: number) => void;
      
      toggleWebServer: (enable: boolean) => void;

      startHostServer: (port?: number) => void;
      stopHostServer: () => void;
      onHostServerStarted: (cb: (res: any) => void) => void;
      onHostClientConnected: (cb: (res: { socketId: string }) => void) => void;
      onHostClientDisconnected: (cb: (res: { socketId: string }) => void) => void;
      onHostSignalReceived: (cb: (res: { socketId: string, data: any }) => void) => void;
      hostSendSignal: (socketId: string, data: any) => void;

      connectToHost: (ip: string, port?: number) => void;
      onGuestConnected: (cb: () => void) => void;
      onGuestSignalReceived: (cb: (data: any) => void) => void;
      onGuestError: (cb: (err: string) => void) => void;
      onGuestDisconnected: (cb: () => void) => void;
      guestSendSignal: (data: any) => void;
      
      removeAllListeners: (channel: string) => void;
      
      openVideoFile: () => Promise<string | null>;
      openSubtitleFile: () => Promise<{ content: string; path: string } | null>;
    }
  }
}

export const generateRandomName = () => {
  const adjs = ["Neon", "Cosmic", "Glitchy", "Retro", "Funky", "Turbo", "Pixel", "Vibe", "Chill", "Hyper", "Sonic", "Mega", "Ultra", "Super", "Giga", "Happy", "Lucky", "Fuzzy", "Dizzy", "Jolly"];
  const nouns = ["Badger", "Panda", "Fox", "Raccoon", "Cat", "Dog", "Tiger", "Lion", "Bear", "Wolf", "Hawk", "Eagle", "Owl", "Shark", "Whale", "Dolphin", "Otter", "Seal", "Penguin", "Koala"];
  
  const adj = adjs[Math.floor(Math.random() * adjs.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj} ${noun}`;
};
