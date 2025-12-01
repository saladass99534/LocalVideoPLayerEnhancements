import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Send, Smile, X, Reply, Loader2, Clapperboard, Tv, RefreshCw, Star, Pin, Zap } from 'lucide-react';
import { ChatMessage, ReplyContext, Reaction, PickerEvent } from '../types';
import { GENRES, Genre, MediaType } from '../movieData';

interface ChatProps {
  messages: ChatMessage[];
  onSendMessage: (text: string, type: 'text' | 'gif', replyTo?: ReplyContext) => void;
  onAddReaction: (messageId: string, emoji: string) => void;
  onHypeEmoji?: (emoji: string) => void;
  onPickerAction?: (action: string, value?: string) => void;
  myId: string;
  isOverlay?: boolean;
  inputVisible?: boolean;
  onInputFocus?: () => void;
  onInputBlur?: () => void;
  onInputChange?: () => void;
  theme?: { primary: string, glow: string, border: string, bg: string };
}

export interface ChatHandle {
    focusInput: () => void;
}

export const EMOJIS = ["👍", "👎", "😂", "😮", "😍", "😢", "🎉", "🔥", "🤔", "👋", "🙏", "💪", "👻", "👀", "🤝", "🥳", "💔", "💯", "🚀", "💀", "💩", "🤡", "🤖", "👾", "🎃", "😺", "🙈", "🙉", "🙊", "💥", "💢", "💦", "💤", "💣", "💬", "👁️‍🗨️", "🍿", "🍺", "🥂", "🍕", "🍔", "🍟", "🌭", "🥓", "🍦", "🍩", "🍪", "🎂", "🍰", "🧁", "🍫", "🍬", "🍭", "🍷", "🍾", "🍹", "🧉", "🥄", "🍴", "🍽️", "🥡", "🥢", "🧂", "⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🎱", "🏓", "🏸", "🥅", "🏒", "🏑", "🏏", "🥍", "🏹", "🎣", "🤿", "🥊", "🥋", "⛸️", "🎿", "🛷", "🥌", "🎯", "🎮", "🎰", "🎲", "🧩", "🧸", "♠️", "♥️", "♦️", "♣️", "♟️", "🃏", "🀄", "🎴", "🎭", "🖼️", "🎨", "🧵", "🧶"];

const HYPE_EMOJIS = ["🔥", "❤️", "🎉", "🤣", "🙊", "👻", "🤯", "🤬", "🥳", "🍆", "💀", "🤡", "💩", "👀", "🍿", "🍺", "💯", "🥶", "😱", "🤢", "💢", "👾", "👋", "🙏", "😭"];

const PickerWidget: React.FC<{ event: PickerEvent, onAction?: (a: string, v?: string) => void, isActive: boolean }> = ({ event, onAction, isActive }) => {
    if (!onAction) return null;

    if (event.state === 'type_selection') {
        return (
            <div className={`bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-4 max-w-xs w-full shadow-lg animate-in fade-in slide-in-from-bottom-2 ${!isActive ? 'opacity-60 pointer-events-none' : ''}`}>
                <div className="flex items-center gap-2 mb-3 text-purple-300 font-bold text-xs uppercase tracking-wider">
                    <Clapperboard size={14} /> Group Picking...
                </div>
                <p className="text-gray-300 text-sm mb-4">What are we watching tonight?</p>
                <div className="flex gap-2">
                    <button disabled={!isActive} onClick={() => onAction('select_type', 'Movie')} className="flex-1 flex items-center justify-center gap-2 bg-white/10 hover:bg-purple-600 text-white py-2 rounded-lg transition-colors text-sm font-medium disabled:cursor-not-allowed">
                        <Clapperboard size={16} /> Movie
                    </button>
                    <button disabled={!isActive} onClick={() => onAction('select_type', 'Show')} className="flex-1 flex items-center justify-center gap-2 bg-white/10 hover:bg-purple-600 text-white py-2 rounded-lg transition-colors text-sm font-medium disabled:cursor-not-allowed">
                        <Tv size={16} /> TV Show
                    </button>
                </div>
            </div>
        );
    }

    if (event.state === 'genre_selection') {
        return (
            <div className={`bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-4 max-w-sm w-full shadow-lg animate-in fade-in slide-in-from-bottom-2 ${!isActive ? 'opacity-60 pointer-events-none' : ''}`}>
                <div className="flex items-center gap-2 mb-2 text-purple-300 font-bold text-xs uppercase tracking-wider">
                    {event.mediaType === 'Movie' ? <Clapperboard size={14} /> : <Tv size={14} />} 
                    Pick {event.mediaType} Genre
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3">
                    {GENRES.map(genre => (
                        <button 
                            key={genre} 
                            disabled={!isActive}
                            onClick={() => onAction('select_genre', genre)}
                            className="text-xs bg-white/5 hover:bg-purple-500 hover:text-white border border-white/10 rounded py-2 px-1 transition-colors disabled:cursor-not-allowed"
                        >
                            {genre}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    if (event.state === 'reveal' && event.movies) {
        return (
            <div className={`bg-black/60 backdrop-blur-md border border-yellow-500/30 rounded-xl p-4 max-w-md w-full shadow-lg animate-in zoom-in duration-300 ${!isActive ? 'opacity-80' : ''}`}>
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
                    <div className="flex items-center gap-2 text-yellow-400 font-bold text-xs uppercase tracking-wider">
                        <Star size={14} fill="currentColor" /> Top Picks: {event.genre} {event.mediaType}s
                    </div>
                    <button disabled={!isActive} onClick={() => onAction('reroll', event.genre)} className="text-xs flex items-center gap-1 text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        <RefreshCw size={12} /> Reroll
                    </button>
                </div>
                <div className="space-y-3">
                    {event.movies.map((m, i) => (
                        <div key={i} className="bg-white/5 p-3 rounded-lg border border-white/5 hover:bg-white/10 transition-colors">
                            <div className="flex justify-between items-start">
                                <h4 className="font-bold text-white text-sm">{m.title} <span className="text-gray-500 text-xs font-normal">({m.year})</span></h4>
                                <span className="text-yellow-500 text-xs font-mono">{m.rating}</span>
                            </div>
                            <p className="text-gray-400 text-xs mt-1 italic">"{m.tagline}"</p>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return null;
};

export const Chat = forwardRef<ChatHandle, ChatProps>(({ 
    messages, 
    onSendMessage, 
    onAddReaction,
    onHypeEmoji,
    onPickerAction,
    myId, 
    isOverlay = false, 
    inputVisible = true,
    onInputFocus,
    onInputBlur,
    onInputChange,
    theme
}, ref) => {
  const [inputText, setInputText] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [showHypePicker, setShowHypePicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<'emoji' | 'gif'>('emoji');
  
  // 0 = Off, 1 = Auto-Hide (follows input), 2 = Always-On (sticky)
  const [pinState, setPinState] = useState<0 | 1 | 2>(0);
  
  const [gifSearch, setGifSearch] = useState('');
  const [gifs, setGifs] = useState<string[]>([]);
  const [isLoadingGifs, setIsLoadingGifs] = useState(false);
  
  const [replyingTo, setReplyingTo] = useState<ReplyContext | undefined>(undefined);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [reactingToMessageId, setReactingToMessageId] = useState<string | null>(null);
  
  const [toasts, setToasts] = useState<ChatMessage[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
      focusInput: () => {
          chatInputRef.current?.focus();
      }
  }));

  // --- MOBILE KEYBOARD FIX START ---
  useEffect(() => {
    // Only run this logic on mobile devices (touch supported)
    if (typeof window !== 'undefined' && 'ontouchstart' in window && window.visualViewport) {
        const handleVisualResize = () => {
            // When the visual viewport resizes (keyboard open/close), 
            // force the window scroll to top. This prevents the browser from
            // scrolling the document body and creating the black gap.
            window.scrollTo(0, 0);
        };

        window.visualViewport.addEventListener('resize', handleVisualResize);
        window.visualViewport.addEventListener('scroll', handleVisualResize);
        
        return () => {
            window.visualViewport?.removeEventListener('resize', handleVisualResize);
            window.visualViewport?.removeEventListener('scroll', handleVisualResize);
        };
    }
  }, []);
  // --- MOBILE KEYBOARD FIX END ---

  const lastSystemMessageId = [...messages].reverse().find(m => m.isSystemEvent)?.id;

  // Toast Logic: Only active if Pin State is OFF (0)
  useEffect(() => {
    if (isOverlay && pinState === 0 && messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        const isRecent = (Date.now() - lastMsg.timestamp) < 5000;

        if (isRecent || lastMsg.isSystemEvent) {
            setToasts(prev => {
                if (prev.some(t => t.id === lastMsg.id)) return prev;
                return [...prev, lastMsg];
            });
            
            const duration = lastMsg.isSystemEvent ? 15000 : 6000;
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== lastMsg.id));
            }, duration);
        }
    }
  }, [messages, isOverlay, pinState]);

  const scrollToBottom = () => {
    if (!isOverlay) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, showPicker, replyingTo, isOverlay]);

  useEffect(() => {
    if (showPicker && pickerTab === 'gif' && searchInputRef.current) {
        setTimeout(() => searchInputRef.current?.focus(), 100);
    }
    if (!showPicker) setGifSearch(''); 
  }, [showPicker, pickerTab]);

  useEffect(() => {
    if (!showPicker || pickerTab !== 'gif') return;

    const fetchGifs = async () => {
        setIsLoadingGifs(true);
        try {
            const endpoint = gifSearch.trim()
                ? `https://g.tenor.com/v1/search?q=${encodeURIComponent(gifSearch)}&key=LIVDSRZULELA&limit=21`
                : `https://g.tenor.com/v1/trending?key=LIVDSRZULELA&limit=21`;
            
            const res = await fetch(endpoint);
            const data = await res.json();
            
            if (data.results) {
                const urls = data.results.map((item: any) => item.media[0].tinygif.url);
                setGifs(urls);
            }
        } catch (e) {
            console.error("Failed to fetch GIFs", e);
        } finally {
            setIsLoadingGifs(false);
        }
    };

    const timeoutId = setTimeout(fetchGifs, 500); 
    return () => clearTimeout(timeoutId);
  }, [gifSearch, showPicker, pickerTab]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSendMessage(inputText.trim(), 'text', replyingTo);
      setInputText('');
      setReplyingTo(undefined);
      setShowPicker(false);
      if (onInputChange) onInputChange(); // Reset timer on submit
    }
  };

  const handleEmojiClick = (emoji: string) => {
    if (reactingToMessageId) {
        onAddReaction(reactingToMessageId, emoji);
        setReactingToMessageId(null);
    } else {
        setInputText(prev => prev + emoji);
        if (onInputChange) onInputChange();
    }
  };

  const handleHypeClick = (emoji: string) => {
      if (onHypeEmoji) {
          onHypeEmoji(emoji);
          setShowHypePicker(false);
          if (onInputChange) onInputChange();
      }
  };

  const handleGifClick = (url: string) => {
    onSendMessage(url, 'gif', replyingTo);
    setReplyingTo(undefined);
    setShowPicker(false);
    if (onInputChange) onInputChange();
  };

  const renderMessageBubble = (msg: ChatMessage, isToast: boolean = false) => {
      const isMe = msg.senderId === myId;
      
      if (msg.isSystemEvent && msg.eventPayload) {
          const isLatest = msg.id === lastSystemMessageId;
          return (
              <div key={msg.id} className={`w-full flex justify-center my-4 animate-in fade-in slide-in-from-bottom-2 ${isToast ? 'pointer-events-auto' : ''}`}>
                  <PickerWidget 
                      event={msg.eventPayload} 
                      onAction={onPickerAction}
                      isActive={isLatest}
                  />
              </div>
          );
      }
      
      return (
        <div
            key={msg.id}
            className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} ${isToast ? 'w-fit max-w-full' : 'w-full'} group relative ${isToast ? 'animate-in slide-in-from-bottom-5 fade-in duration-300 mb-2' : 'mb-5'}`}
            onMouseEnter={() => !isToast && setHoveredMessageId(msg.id)}
            onMouseLeave={() => !isToast && setHoveredMessageId(null)}
        >
            {!isToast && (
                <div className={`absolute -top-3 ${isMe ? 'right-2' : 'left-2'} flex gap-1 bg-[#313338] border border-[#3f4147] rounded-full p-1 shadow-lg transition-opacity duration-200 z-10 ${hoveredMessageId === msg.id || reactingToMessageId === msg.id ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                    <button onClick={() => setReactingToMessageId(reactingToMessageId === msg.id ? null : msg.id)} className="p-1.5 hover:bg-white/10 rounded-full text-gray-300 hover:text-yellow-400"><Smile size={14} /></button>
                    <button onClick={() => { setReplyingTo({ id: msg.id, senderName: msg.senderName, text: msg.type === 'gif' ? 'Sent a GIF' : msg.text }); }} className="p-1.5 hover:bg-white/10 rounded-full text-gray-300 hover:text-blue-400"><Reply size={14} /></button>
                </div>
            )}

            <span className={`text-[10px] mb-1 px-2 font-bold uppercase tracking-wide ${isToast ? 'text-white/90 shadow-black drop-shadow-md' : 'text-gray-500 opacity-70'}`}>
                {isMe ? 'You' : msg.senderName}
            </span>
            
            <div className={`relative whitespace-pre-wrap word-break-normal ${
                msg.type === 'gif' 
                ? 'p-0 bg-transparent rounded-2xl overflow-hidden' 
                : `px-4 py-2 ${isMe ? `${theme ? theme.bg : 'bg-blue-600'} text-white rounded-t-2xl rounded-bl-2xl rounded-br-sm` : (isToast ? 'bg-black/60 backdrop-blur-md text-white border border-white/10' : 'bg-white/5 text-gray-100 border border-white/5') + ' rounded-t-2xl rounded-br-2xl rounded-bl-sm'}`
            } text-sm shadow-sm ${isToast ? '' : 'max-w-[90%] md:max-w-[85%]'}`}>
                
                {msg.replyTo && (
                    <div className={`mb-1 text-[10px] border-l-2 pl-2 ${isMe ? 'border-white/30 text-white/70' : 'border-gray-500 text-gray-400'}`}>
                        <p className="font-bold opacity-75">{msg.replyTo.senderName}</p>
                        <p className="truncate opacity-60">{msg.replyTo.text}</p>
                    </div>
                )}

                {msg.type === 'gif' ? (
                    <img src={msg.text} alt="GIF" className="w-40 h-auto object-cover rounded-xl" />
                ) : (
                    <span className="break-words block min-w-[20px]">{msg.text}</span>
                )}

                {!isToast && msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                        {Object.values(msg.reactions).map((reaction: Reaction, i) => (
                            reaction.count > 0 && (
                                <button key={i} className="text-[10px] px-1.5 bg-black/20 rounded-full border border-white/5 text-gray-300">
                                    {reaction.emoji} {reaction.count}
                                </button>
                            )
                        ))}
                    </div>
                )}
            </div>
        </div>
      );
  };

  const handleInputFocusInternal = () => {
    // Force scroll to top when focusing input on mobile
    if (typeof window !== 'undefined' && 'ontouchstart' in window) {
        window.scrollTo(0, 0);
    }
    if (onInputFocus) onInputFocus();
  };

  return (
    <div className={`flex flex-col h-full w-full relative font-sans ${isOverlay ? 'bg-transparent pointer-events-none' : 'bg-transparent'}`}>
      
      <div className={`flex-1 relative ${isOverlay ? 'flex flex-col justify-end' : 'overflow-y-auto p-4 scrollbar-hide'}`}>
        {!isOverlay && (
            <>
                {messages.length === 0 && (
                    <div className="text-center text-gray-500 mt-10 opacity-50">
                        <p className="text-sm">No messages yet.</p>
                    </div>
                )}
                {messages.map((msg) => renderMessageBubble(msg))}
                <div ref={messagesEndRef} />
            </>
        )}

        {isOverlay && (
            // CONTAINER FOR OVERLAY MESSAGES (TOASTS OR PINNED)
            // pinState 1 (Auto-Hide): follows inputVisible opacity.
            // pinState 2 (Always-On): opacity 100 always.
            <div className={`px-4 pb-2 flex flex-col w-full gap-2 items-start pointer-events-none transition-opacity duration-300 ${
                pinState === 1 ? (inputVisible ? 'opacity-100' : 'opacity-0') : 'opacity-100'
            }`}>
                {(pinState > 0 ? messages.slice(-2) : toasts).map((msg) => {
                    const isMe = msg.senderId === myId;
                    const justify = msg.isSystemEvent ? 'justify-center' : (isMe ? 'justify-end' : 'justify-start');
                    
                    return (
                        <div key={msg.id} className={`pointer-events-auto flex w-full ${justify}`}>
                            <div className={`flex flex-col ${msg.isSystemEvent ? 'w-full max-w-md' : 'max-w-[350px] w-auto'}`}>
                                {renderMessageBubble(msg, true)}
                            </div>
                        </div>
                    );
                })}
            </div>
        )}
      </div>

      <div className={`relative z-20 flex-shrink-0 ${
          isOverlay 
            ? `transition-all duration-300 transform px-4 ${inputVisible ? 'opacity-100 pointer-events-auto translate-y-0 pb-4' : 'opacity-0 pointer-events-none translate-y-4'}` 
            : 'px-4 pt-4 pb-2' 
      }`}>
        
        {showPicker && (
             <div className={`absolute bottom-full mb-2 left-4 w-64 bg-[#1e1f22] border border-white/10 rounded-xl shadow-2xl z-30 overflow-hidden flex flex-col h-64 animate-in slide-in-from-bottom-2 backdrop-blur-xl`}>
                <div className="flex border-b border-white/10">
                    <button onClick={() => setPickerTab('emoji')} className={`flex-1 py-2 text-xs font-bold ${pickerTab === 'emoji' ? 'bg-white/10 text-white' : 'text-gray-400'}`}>Emoji</button>
                    <button onClick={() => setPickerTab('gif')} className={`flex-1 py-2 text-xs font-bold ${pickerTab === 'gif' ? 'bg-white/10 text-white' : 'text-gray-400'}`}>GIFs</button>
                    <button onClick={() => setShowPicker(false)} className="px-3 text-gray-400 hover:text-white"><X size={14} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 scrollbar-hide">
                    {pickerTab === 'emoji' ? (
                        <div className="grid grid-cols-6 gap-1">
                            {EMOJIS.map(e => <button key={e} onClick={() => handleEmojiClick(e)} className="text-xl hover:bg-white/10 rounded p-1">{e}</button>)}
                        </div>
                    ) : (
                        <div className="space-y-2">
                             <input 
                                ref={searchInputRef} 
                                type="text" 
                                placeholder="Search Tenor..." 
                                className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-white" 
                                value={gifSearch} 
                                onChange={e => setGifSearch(e.target.value)}
                                onFocus={handleInputFocusInternal}
                                onBlur={onInputBlur}
                             />
                             
                             {isLoadingGifs ? (
                                 <div className="flex justify-center py-4 text-blue-500"><Loader2 className="animate-spin" size={20} /></div>
                             ) : (
                                <div className="grid grid-cols-2 gap-2">
                                    {gifs.map((url, i) => (
                                        <button key={i} onClick={() => handleGifClick(url)} className="hover:opacity-80 border border-transparent hover:border-blue-500 rounded-lg overflow-hidden">
                                            <img src={url} className="w-full h-auto" />
                                        </button>
                                    ))}
                                    {gifs.length === 0 && <p className="col-span-2 text-center text-xs text-gray-500">No GIFs found.</p>}
                                </div>
                             )}
                             <div className="text-[9px] text-gray-600 text-center pb-1">Powered by Tenor</div>
                        </div>
                    )}
                </div>
             </div>
        )}

        {showHypePicker && (
            <div className={`absolute bottom-full mb-2 left-0 w-full flex justify-center z-30 animate-in slide-in-from-bottom-2 fade-in duration-200 pointer-events-none`}>
                <div className={`bg-[#1e1f22]/95 backdrop-blur-xl border border-yellow-500/30 rounded-2xl p-3 shadow-2xl pointer-events-auto`}>
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/10">
                        <div className="text-[10px] font-bold text-yellow-500 uppercase tracking-wider flex items-center gap-1">
                            <Zap size={12} fill="currentColor"/> Hype Frenzy
                        </div>
                        <button onClick={() => setShowHypePicker(false)} className="text-gray-400 hover:text-white">
                            <X size={12} />
                        </button>
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                        {HYPE_EMOJIS.map(e => (
                            <button 
                                key={e} 
                                onClick={() => handleHypeClick(e)} 
                                className="text-2xl hover:scale-125 transition-transform p-2 hover:bg-white/10 rounded-lg hover:drop-shadow-[0_0_10px_rgba(255,255,0,0.5)]"
                            >
                                {e}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {replyingTo && (
            <div className={`mb-2 flex items-center justify-between p-2 rounded-lg text-xs ${isOverlay ? 'bg-black/60 backdrop-blur text-white' : 'bg-white/5 border border-white/10'}`}>
                <span className="truncate max-w-[200px]"><span className={`${theme ? theme.primary : 'text-blue-400'} font-bold`}>@{replyingTo.senderName}:</span> {replyingTo.text}</span>
                <button onClick={() => setReplyingTo(undefined)}><X size={12} /></button>
            </div>
        )}

        <form onSubmit={handleSubmit} className="relative">
            <div className={`flex items-center gap-2 rounded-full p-1 transition-all ${isOverlay ? 'bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 hover:border-white/30' : 'bg-white/5 backdrop-blur-md border border-white/10 focus-within:bg-white/10'}`}>
                
                {isOverlay && (
                    <button
                        type="button"
                        onClick={() => setPinState(prev => (prev + 1) % 3 as any)}
                        className={`p-1.5 rounded-full transition-all duration-200 ${
                            pinState === 2 
                                ? `${theme ? theme.bg : 'bg-blue-600'} text-white shadow-lg` // Always On (Filled)
                                : pinState === 1 
                                    ? `${theme ? theme.primary : 'text-blue-400'} bg-white/10` // Auto-Hide (Active)
                                    : 'text-gray-400 hover:text-white' // Off
                        }`}
                        title={pinState === 0 ? "Pin Chat" : pinState === 1 ? "Pinned (Auto-Hide)" : "Pinned (Always On)"}
                    >
                        <Pin size={18} className={pinState === 2 ? "fill-white" : ""} />
                    </button>
                )}

                <button 
                    type="button" 
                    onClick={() => { setShowPicker(!showPicker); setShowHypePicker(false); }}
                    className={`p-1.5 rounded-full transition-colors ${showPicker ? `${theme ? theme.primary : 'text-blue-400'} bg-white/10` : 'text-gray-400 hover:text-white'}`}
                >
                    <Smile size={18} />
                </button>

                <button 
                    type="button" 
                    onClick={() => { setShowHypePicker(!showHypePicker); setShowPicker(false); }}
                    className={`p-1.5 rounded-full transition-colors ${showHypePicker ? 'text-yellow-400 bg-white/10' : 'text-gray-400 hover:text-yellow-400'}`}
                    title="Hype Mode"
                >
                    <Zap size={18} className={showHypePicker ? "fill-current" : ""} />
                </button>
                
                <input
                    ref={chatInputRef}
                    type="text"
                    value={inputText}
                    onChange={(e) => { setInputText(e.target.value); if(onInputChange) onInputChange(); }}
                    onFocus={handleInputFocusInternal}
                    onBlur={onInputBlur}
                    placeholder={isOverlay ? "Type a message..." : "Message..."}
                    className="flex-1 bg-transparent border-none text-white text-sm px-1 focus:outline-none placeholder-gray-500/70 min-w-0"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                />
                
                {inputText.trim() && (
                    <button type="submit" className={`p-1.5 rounded-full ${theme ? theme.bg : 'bg-blue-600'} text-white hover:opacity-90 transition-all animate-in zoom-in duration-200`}>
                        <Send size={14} />
                    </button>
                )}
            </div>
        </form>
      </div>
    </div>
  );
});
Chat.displayName = 'Chat';
