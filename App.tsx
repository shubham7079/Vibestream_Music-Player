
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Search, 
  Plus, 
  Home, 
  Compass, 
  Library, 
  Settings, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX,
  Repeat,
  Shuffle,
  Activity,
  Trash2,
  Database,
  X,
  Edit2,
  Check
} from 'lucide-react';
import { db } from './services/db';
import { geminiService } from './services/gemini';
import { Track, PlayerState, RepeatMode, StorageStatus } from './types';
import { Visualizer } from './components/Visualizer';
import { InteractionShield } from './components/InteractionShield';

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: any;
  }
}

type View = 'explorer' | 'hub' | 'archive' | 'settings';

const App: React.FC = () => {
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Partial<Track>[]>([]);
  const [library, setLibrary] = useState<Track[]>([]);
  const [storage, setStorage] = useState<StorageStatus>({ used: 0, quota: 0, trackCount: 0 });
  const [currentView, setCurrentView] = useState<View>('explorer');
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  
  const [state, setState] = useState<PlayerState>({
    currentTrack: null,
    isPlaying: false,
    volume: 80,
    currentTime: 0,
    duration: 0,
    repeatMode: RepeatMode.OFF,
    shuffle: false,
    queue: [],
    history: []
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const seekerRef = useRef<HTMLDivElement>(null);

  // --- Initializers ---
  useEffect(() => {
    const init = async () => {
      await db.init();
      const tracks = await db.getAllTracks();
      setLibrary(tracks);
      const est = await db.getStorageEstimate();
      setStorage({ ...est, trackCount: tracks.length });

      const savedVolume = localStorage.getItem('vs_volume');
      if (savedVolume) setState(s => ({ ...s, volume: parseInt(savedVolume) }));
    };
    init();
  }, []);

  // --- YouTube Engine ---
  useEffect(() => {
    if (!unlocked) return;
    
    const setupYT = () => {
      if (!window.YT || !window.YT.Player) {
          setTimeout(setupYT, 100);
          return;
      }
      ytPlayerRef.current = new window.YT.Player('yt-player-hidden', {
        height: '0',
        width: '0',
        videoId: '',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1
        },
        events: {
          onReady: () => console.log('YT Engine Ready'),
          onStateChange: (event: any) => {
            if (event.data === window.YT.PlayerState.PLAYING) {
              setState(s => ({ ...s, isPlaying: true, duration: ytPlayerRef.current.getDuration() }));
            } else if (event.data === window.YT.PlayerState.ENDED) {
              handleTrackEnd();
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              setState(s => ({ ...s, isPlaying: false }));
            }
          },
          onError: async (event: any) => {
            console.error('YT Engine Error:', event.data);
            if (event.data === 101 || event.data === 150) {
              if (state.currentTrack) {
                const altQuery = await geminiService.resolveAlternativeAudio(state.currentTrack);
                if (altQuery) {
                  const res = await geminiService.semanticDiscovery(altQuery);
                  if (res[0]) playTrack({ ...res[0], source: 'youtube', id: `yt-${Date.now()}` } as Track);
                }
              }
            }
          }
        }
      });
    };
    
    if (window.YT && window.YT.Player) {
      setupYT();
    } else {
      window.onYouTubeIframeAPIReady = setupYT;
    }
  }, [unlocked]);

  // --- Sync Polling ---
  useEffect(() => {
    const interval = setInterval(() => {
      if (state.isPlaying) {
        if (state.currentTrack?.source === 'youtube' && ytPlayerRef.current?.getCurrentTime) {
          setState(s => ({ ...s, currentTime: ytPlayerRef.current.getCurrentTime() }));
        } else if (state.currentTrack?.source === 'local' && audioRef.current) {
          setState(s => ({ ...s, currentTime: audioRef.current!.currentTime }));
        }
      }
    }, 500);
    return () => clearInterval(interval);
  }, [state.isPlaying, state.currentTrack]);

  // --- Audio Handlers ---
  const playTrack = useCallback(async (track: Track) => {
    audioRef.current?.pause();
    if (ytPlayerRef.current?.stopVideo) ytPlayerRef.current.stopVideo();

    if (track.source === 'local') {
      const blob = await db.getTrackBlob(track.id);
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play();
        setState(s => ({ ...s, currentTrack: track, isPlaying: true, duration: track.duration }));
      }
    } else {
      const videoId = track.uri.length === 11 ? track.uri : null;
      if (videoId) {
        ytPlayerRef.current?.loadVideoById(videoId);
        ytPlayerRef.current?.playVideo();
        setState(s => ({ ...s, currentTrack: track, isPlaying: true }));
      } else {
        // Fallback: If uri is query, search it
        const res = await geminiService.semanticDiscovery(track.uri);
        if (res[0] && res[0].uri && res[0].uri.length === 11) {
            playTrack({ ...res[0], source: 'youtube', id: `yt-${Date.now()}` } as Track);
        }
      }
    }
  }, []);

  const togglePlay = () => {
    if (!state.currentTrack) return;
    if (state.isPlaying) {
      if (state.currentTrack.source === 'local') audioRef.current?.pause();
      else ytPlayerRef.current?.pauseVideo();
    } else {
      if (state.currentTrack.source === 'local') audioRef.current?.play();
      else ytPlayerRef.current?.playVideo();
    }
    setState(s => ({ ...s, isPlaying: !s.isPlaying }));
  };

  const handleTrackEnd = () => {
    console.log('Track ended');
    // Basic auto-next logic
    if (state.repeatMode === RepeatMode.ONE && state.currentTrack) {
        playTrack(state.currentTrack);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoading(true);
    setCurrentView('hub');
    const results = await geminiService.semanticDiscovery(searchQuery);
    setSearchResults(results);
    setLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const analysis = await geminiService.analyzeLocalFile(file.name);
    
    const tempAudio = new Audio();
    tempAudio.src = URL.createObjectURL(file);
    tempAudio.onloadedmetadata = async () => {
      const newTrack: Track = {
        id: crypto.randomUUID(),
        title: analysis.title || file.name,
        artist: analysis.artist || 'Unknown',
        duration: tempAudio.duration,
        coverUrl: analysis.coverUrl || `https://picsum.photos/seed/${Math.random()}/600/600`,
        source: 'local',
        uri: file.name,
        genre: analysis.genre,
        addedAt: Date.now()
      };

      await db.saveTrack(newTrack, file);
      setLibrary(prev => [newTrack, ...prev]);
      const est = await db.getStorageEstimate();
      setStorage(s => ({ ...s, ...est, trackCount: s.trackCount + 1 }));
      setLoading(false);
      if (currentView !== 'archive') setCurrentView('archive');
    };
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!state.currentTrack || !seekerRef.current) return;
    const rect = seekerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    const targetTime = pct * state.duration;

    if (state.currentTrack.source === 'local' && audioRef.current) {
        audioRef.current.currentTime = targetTime;
    } else if (ytPlayerRef.current) {
        ytPlayerRef.current.seekTo(targetTime, true);
    }
    setState(s => ({ ...s, currentTime: targetTime }));
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSaveEdit = (updated: Track) => {
    // Fix: db.saveTrack now supports metadata-only updates
    db.saveTrack(updated).then(() => {
        setLibrary(l => l.map(t => t.id === updated.id ? updated : t));
        if (state.currentTrack?.id === updated.id) setState(s => ({ ...s, currentTrack: updated }));
        setEditingTrack(null);
    });
  };

  if (!unlocked) return <InteractionShield onUnlock={() => setUnlocked(true)} />;

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <audio ref={audioRef} onEnded={handleTrackEnd} className="hidden" />
      <div id="yt-player-hidden" className="hidden"></div>

      {/* Sidebar */}
      <aside className="w-72 bg-slate-900/50 backdrop-blur-2xl border-r border-slate-800/50 flex flex-col p-6 z-30">
        <div className="flex items-center gap-3 mb-10 px-2 cursor-pointer" onClick={() => setCurrentView('explorer')}>
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Activity size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-black tracking-tighter">VIBESTREAM <span className="text-indigo-500">PRO</span></h1>
        </div>

        <nav className="flex-1 space-y-2">
          <NavItem 
            icon={<Home size={22} />} 
            label="Explorer" 
            active={currentView === 'explorer'} 
            onClick={() => setCurrentView('explorer')} 
          />
          <NavItem 
            icon={<Compass size={22} />} 
            label="Semantic Hub" 
            active={currentView === 'hub'} 
            onClick={() => setCurrentView('hub')} 
          />
          <NavItem 
            icon={<Library size={22} />} 
            label="Archive" 
            active={currentView === 'archive'} 
            onClick={() => setCurrentView('archive')} 
          />
          <NavItem 
            icon={<Settings size={22} />} 
            label="Settings" 
            active={currentView === 'settings'} 
            onClick={() => setCurrentView('settings')} 
          />
        </nav>

        <div className="mt-auto p-5 rounded-[32px] bg-slate-800/40 border border-slate-700/50 group cursor-pointer hover:border-indigo-500/50 transition-all" onClick={() => setCurrentView('settings')}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-indigo-400">Cluster Status</span>
            <Database size={14} className="text-indigo-400" />
          </div>
          <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden mb-3">
            <div 
              className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)] transition-all duration-1000" 
              style={{ width: `${(storage.used / (storage.quota || 1)) * 100}%` }}
            ></div>
          </div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">
            {Math.round(storage.used / 1024 / 1024)}MB / {Math.round(storage.quota / 1024 / 1024 / 1024)}GB STACKED
          </p>
          <p className="text-[10px] text-indigo-400 mt-1 font-black">{storage.trackCount} LOCAL ENTITIES</p>
        </div>

        <div className="mt-4 p-4 rounded-[24px] bg-gradient-to-br from-indigo-900/20 to-purple-900/20 border border-indigo-500/20">
            <button className="w-full py-2 rounded-full bg-indigo-500/10 text-[10px] font-black text-indigo-300 border border-indigo-500/30 flex items-center justify-center gap-2 hover:bg-indigo-500/20 transition-all">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                CORE STABLE
            </button>
        </div>
      </aside>

      {/* Main Container */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-slate-950/20 backdrop-blur-sm">
        {/* Header */}
        <header className="h-24 flex items-center px-10 gap-6 z-10 shrink-0">
          <form onSubmit={handleSearch} className="flex-1 relative group">
            <input 
              type="text" 
              placeholder="Query the Deep Space Hub... (e.g. 'Synthesizer dreams for coding')" 
              className="w-full h-14 bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-full pl-14 pr-6 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all group-hover:bg-slate-800/60 font-medium"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400" size={20} />
            {loading && <div className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>}
          </form>

          <label className="flex items-center gap-3 h-14 px-8 bg-indigo-600 hover:bg-indigo-500 rounded-full cursor-pointer transition-all shadow-lg shadow-indigo-500/30 font-black text-xs uppercase tracking-widest whitespace-nowrap active:scale-95">
            <Plus size={20} />
            Archive File
            <input type="file" className="hidden" accept="audio/*" onChange={handleFileUpload} />
          </label>
        </header>

        {/* Dynamic Views */}
        <div className="flex-1 overflow-y-auto px-10 pb-40">
          {currentView === 'explorer' && (
            <div className="space-y-12 py-6">
                <section>
                    <h2 className="text-3xl font-black mb-8 flex items-center gap-3 tracking-tighter">
                        <div className="w-2 h-10 bg-indigo-500 rounded-full"></div>
                        VIBE OF THE DAY
                    </h2>
                    <div 
                        className="w-full h-80 rounded-[48px] bg-gradient-to-r from-indigo-900/40 to-slate-900/40 border border-slate-800/50 p-12 flex items-center justify-between group overflow-hidden relative cursor-pointer"
                        onClick={() => { setSearchQuery('Late night jazz for rainy days'); handleSearch({ preventDefault: () => {} } as any); }}
                    >
                        <div className="z-10 relative">
                            <span className="px-4 py-1.5 bg-indigo-500 rounded-full text-[10px] font-black uppercase tracking-widest mb-4 inline-block">Featured Vibe</span>
                            <h3 className="text-5xl font-black mb-4 max-w-xl leading-tight tracking-tighter">Late Night Deep Space Explorations</h3>
                            <p className="text-slate-400 text-lg mb-8 max-w-md">Gemini curated synthesis of atmospheric textures and lo-fi beats for maximum focus.</p>
                            <button className="px-10 py-4 bg-white text-slate-950 rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all active:scale-95 shadow-xl">Start Signal</button>
                        </div>
                        <Activity size={300} className="absolute right-0 top-1/2 -translate-y-1/2 text-indigo-500/10 -rotate-12 group-hover:scale-110 transition-transform duration-1000" />
                    </div>
                </section>

                <section>
                   <h2 className="text-2xl font-black mb-6 flex items-center gap-3">
                        <div className="w-2 h-8 bg-emerald-500 rounded-full"></div>
                        QUICK ARCHIVE
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                        {library.slice(0, 5).map(track => (
                            <TrackCard key={track.id} track={track} active={state.currentTrack?.id === track.id} onClick={() => playTrack(track)} onEdit={() => setEditingTrack(track)} onDelete={() => { db.deleteTrack(track.id).then(() => setLibrary(l => l.filter(t => t.id !== track.id))); }} />
                        ))}
                    </div>
                </section>
            </div>
          )}

          {currentView === 'hub' && (
             <section className="py-6">
                <h2 className="text-3xl font-black mb-8 flex items-center gap-3 tracking-tighter">
                  <div className="w-2 h-10 bg-indigo-500 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.8)]"></div>
                  HUB DISCOVERY
                </h2>
                {searchResults.length === 0 ? (
                    <div className="h-96 flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-slate-800 rounded-[64px]">
                        <Compass size={64} className="mb-4 opacity-20" />
                        <p className="font-bold uppercase tracking-widest text-xs">Waiting for Semantic Input</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {searchResults.map((res, i) => (
                        <DiscoveryCard 
                            key={i} 
                            res={res} 
                            onPlay={() => playTrack({
                                id: `yt-${i}-${Date.now()}`,
                                title: res.title!,
                                artist: res.artist!,
                                uri: res.uri!, 
                                source: 'youtube',
                                duration: 0,
                                coverUrl: `https://picsum.photos/seed/${res.title}/600/600`,
                                addedAt: Date.now()
                            } as Track)} 
                        />
                        ))}
                    </div>
                )}
             </section>
          )}

          {currentView === 'archive' && (
             <section className="py-6">
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-3xl font-black flex items-center gap-3 tracking-tighter">
                        <div className="w-2 h-10 bg-emerald-500 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.8)]"></div>
                        LIFETIME ARCHIVE
                    </h2>
                    <span className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">{library.length} Objects</span>
                </div>
                {library.length === 0 ? (
                    <div className="h-96 flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-slate-800 rounded-[64px]">
                        <Library size={64} className="mb-4 opacity-20" />
                        <p className="font-bold uppercase tracking-widest text-xs">No Objects Archived</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:grid-cols-5 gap-6">
                        {library.map((track) => (
                            <TrackCard key={track.id} track={track} active={state.currentTrack?.id === track.id} onClick={() => playTrack(track)} onEdit={() => setEditingTrack(track)} onDelete={() => { db.deleteTrack(track.id).then(() => setLibrary(l => l.filter(t => t.id !== track.id))); }} />
                        ))}
                    </div>
                )}
             </section>
          )}

          {currentView === 'settings' && (
              <section className="py-6 space-y-8">
                  <h2 className="text-3xl font-black mb-8 flex items-center gap-3 tracking-tighter">
                    <div className="w-2 h-10 bg-slate-500 rounded-full"></div>
                    CORE SETTINGS
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="bg-slate-900/40 p-8 rounded-[48px] border border-slate-800/50">
                          <h3 className="text-xl font-black mb-4 uppercase tracking-widest text-indigo-400">Memory Cluster</h3>
                          <div className="space-y-6">
                              <div>
                                  <div className="flex justify-between text-xs font-bold mb-2 uppercase tracking-widest">
                                      <span>Archive Capacity</span>
                                      <span>{Math.round((storage.used / (storage.quota || 1)) * 100)}%</span>
                                  </div>
                                  <div className="h-4 w-full bg-slate-800 rounded-full overflow-hidden">
                                      <div className="h-full bg-indigo-500" style={{ width: `${(storage.used / (storage.quota || 1)) * 100}%` }}></div>
                                  </div>
                              </div>
                              <button 
                                onClick={() => { if(confirm('Purge all archived entities?')) { library.forEach(t => db.deleteTrack(t.id)); setLibrary([]); } }}
                                className="w-full py-4 bg-red-500/10 text-red-400 border border-red-500/20 rounded-3xl font-bold uppercase text-[10px] tracking-widest hover:bg-red-500/20 transition-all"
                              >
                                Purge Lifetime Archive
                              </button>
                          </div>
                      </div>
                      <div className="bg-slate-900/40 p-8 rounded-[48px] border border-slate-800/50">
                          <h3 className="text-xl font-black mb-4 uppercase tracking-widest text-indigo-400">AI Personality</h3>
                          <div className="space-y-4">
                              <p className="text-slate-400 text-sm leading-relaxed">VibeStream Pro utilizes Gemini 3 Flash for semantic discovery and link healing. Engine state: <span className="text-green-400 font-bold">READY</span></p>
                              <div className="p-4 bg-indigo-500/5 rounded-3xl border border-indigo-500/20">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300 mb-1">Last Analysis</p>
                                  <p className="text-xs text-slate-500 font-medium italic">"Deep Space aesthetic prioritized for 60 LPA user profile."</p>
                              </div>
                          </div>
                      </div>
                  </div>
              </section>
          )}
        </div>

        {/* Playback Deck */}
        <footer className="absolute bottom-6 left-6 right-6 h-28 bg-slate-900/90 backdrop-blur-3xl border border-white/5 rounded-[48px] flex items-center px-8 shadow-[0_30px_60px_rgba(0,0,0,0.6)] z-40">
          <div className="flex items-center gap-5 w-1/4">
            <div className={`w-16 h-16 rounded-full bg-slate-800 overflow-hidden border-2 border-indigo-500/50 flex-shrink-0 shadow-lg ${state.isPlaying ? 'animate-[spin_8s_linear_infinite]' : ''}`}>
              {state.currentTrack ? (
                <img src={state.currentTrack.coverUrl} className="w-full h-full object-cover" alt="" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-indigo-900/20">
                    <Activity className="text-indigo-400" />
                </div>
              )}
            </div>
            <div className="truncate">
              <h4 className="font-black text-lg truncate leading-none mb-1 group cursor-pointer" onClick={() => state.currentTrack && setEditingTrack(state.currentTrack)}>
                {state.currentTrack?.title || 'System Idle'}
                <Edit2 size={12} className="inline ml-2 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h4>
              <p className="text-slate-500 text-xs font-black tracking-widest uppercase truncate">{state.currentTrack?.artist || 'Ready for Signal'}</p>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center px-10">
            <div className="flex items-center gap-8 mb-4">
              <button className={`transition-all hover:scale-110 ${state.shuffle ? 'text-indigo-400' : 'text-slate-500'}`} onClick={() => setState(s => ({ ...s, shuffle: !s.shuffle }))}><Shuffle size={20} /></button>
              <button className="text-slate-300 hover:text-white transition-all active:scale-90"><SkipBack size={24} fill="currentColor" /></button>
              <button 
                onClick={togglePlay}
                className="w-14 h-14 bg-white text-slate-950 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.4)]"
              >
                {state.isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
              </button>
              <button className="text-slate-300 hover:text-white transition-all active:scale-90"><SkipForward size={24} fill="currentColor" /></button>
              <button 
                className={`transition-all hover:scale-110 ${state.repeatMode !== RepeatMode.OFF ? 'text-indigo-400' : 'text-slate-500'}`} 
                onClick={() => setState(s => ({ ...s, repeatMode: s.repeatMode === RepeatMode.OFF ? RepeatMode.ONE : s.repeatMode === RepeatMode.ONE ? RepeatMode.ALL : RepeatMode.OFF }))}
              >
                <Repeat size={20} />
                {state.repeatMode === RepeatMode.ONE && <span className="absolute text-[8px] font-black mt-[-10px] ml-4">1</span>}
              </button>
            </div>
            
            <div className="w-full flex items-center gap-4 relative">
                <span className="text-[10px] font-black text-slate-500 w-12 text-right tabular-nums">{formatTime(state.currentTime)}</span>
                <div 
                    ref={seekerRef}
                    onClick={handleSeek}
                    className="flex-1 h-2 bg-slate-800 rounded-full relative overflow-hidden group cursor-pointer"
                >
                    <div 
                        className="absolute left-0 top-0 h-full bg-indigo-500 group-hover:bg-indigo-400 transition-all shadow-[0_0_15px_rgba(99,102,241,0.6)] z-10" 
                        style={{ width: `${(state.currentTime / (state.duration || 1)) * 100}%` }}
                    ></div>
                    <div className="absolute inset-0 z-0 opacity-40">
                        <Visualizer isPlaying={state.isPlaying} volume={state.volume} />
                    </div>
                </div>
                <span className="text-[10px] font-black text-slate-500 w-12 tabular-nums">{formatTime(state.duration)}</span>
            </div>
          </div>

          <div className="w-1/4 flex items-center justify-end gap-6">
            <div className="flex items-center gap-3 group">
              <button className="text-slate-400 hover:text-white transition-all" onClick={() => setState(s => ({ ...s, volume: s.volume === 0 ? 80 : 0 }))}>
                {state.volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={state.volume}
                onChange={(e) => {
                    const v = parseInt(e.target.value);
                    setState(s => ({ ...s, volume: v }));
                    localStorage.setItem('vs_volume', v.toString());
                    if (audioRef.current) audioRef.current.volume = v / 100;
                    if (ytPlayerRef.current?.setVolume) ytPlayerRef.current.setVolume(v);
                }}
                className="w-24 h-1 bg-slate-800 rounded-full accent-indigo-500 cursor-pointer hover:h-2 transition-all"
              />
            </div>
            <button className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl hover:bg-indigo-500/20 transition-all border border-indigo-500/20 active:scale-90" onClick={() => setCurrentView('settings')}>
                <Settings size={20} />
            </button>
          </div>
        </footer>
      </main>

      {/* Metadata Editor Modal */}
      {editingTrack && (
          <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-6">
              <div className="bg-slate-900 w-full max-w-lg rounded-[48px] border border-slate-800 p-10 shadow-2xl">
                  <div className="flex justify-between items-start mb-8">
                      <h3 className="text-2xl font-black tracking-tighter uppercase">Commit to Database</h3>
                      <button onClick={() => setEditingTrack(null)} className="text-slate-500 hover:text-white transition-all"><X size={24}/></button>
                  </div>
                  <div className="space-y-6">
                      <div>
                          <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-2">Entity Title</label>
                          <input 
                            type="text" 
                            className="w-full bg-slate-800 border border-slate-700 rounded-3xl p-4 focus:ring-2 focus:ring-indigo-500/50 focus:outline-none font-bold"
                            value={editingTrack.title}
                            onChange={(e) => setEditingTrack({...editingTrack, title: e.target.value})}
                          />
                      </div>
                      <div>
                          <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-2">Primary Artist</label>
                          <input 
                            type="text" 
                            className="w-full bg-slate-800 border border-slate-700 rounded-3xl p-4 focus:ring-2 focus:ring-indigo-500/50 focus:outline-none font-bold"
                            value={editingTrack.artist}
                            onChange={(e) => setEditingTrack({...editingTrack, artist: e.target.value})}
                          />
                      </div>
                      <div className="flex gap-4">
                          <div className="flex-1">
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-2">Genre Tag</label>
                            <input 
                                type="text" 
                                className="w-full bg-slate-800 border border-slate-700 rounded-3xl p-4 focus:ring-2 focus:ring-indigo-500/50 focus:outline-none font-bold text-xs"
                                value={editingTrack.genre || ''}
                                onChange={(e) => setEditingTrack({...editingTrack, genre: e.target.value})}
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-2">Source Engine</label>
                            <div className="w-full bg-slate-800 border border-slate-700 rounded-3xl p-4 font-black text-xs uppercase text-indigo-400">
                                {editingTrack.source}
                            </div>
                          </div>
                      </div>
                      <button 
                        onClick={() => handleSaveEdit(editingTrack)}
                        className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 rounded-full font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-3"
                      >
                        <Check size={20} />
                        UPDATE ARCHIVE
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

// Fix: Use React.FC to handle key prop correctly in TypeScript
const NavItem: React.FC<{ icon: React.ReactNode, label: string, active: boolean, onClick: () => void }> = ({ icon, label, active, onClick }) => (
    <button 
        onClick={onClick}
        className={`flex items-center gap-4 w-full p-4 rounded-3xl transition-all duration-300 font-bold text-sm tracking-tight ${active ? 'bg-indigo-600/10 text-indigo-400 shadow-[inset_0_0_20px_rgba(79,70,229,0.1)]' : 'hover:bg-slate-800/50 text-slate-500 hover:text-white'}`}
    >
        {icon}
        {label}
        {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,1)]"></div>}
    </button>
);

interface TrackCardProps {
  track: Track;
  active: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

// Fix: Use React.FC to handle key prop correctly in TypeScript
const TrackCard: React.FC<TrackCardProps> = ({ track, active, onClick, onEdit, onDelete }) => (
    <div 
        className={`group bg-slate-900/40 p-4 rounded-[40px] border transition-all cursor-pointer relative ${active ? 'border-indigo-500 bg-indigo-500/5' : 'border-slate-800/50 hover:bg-slate-800/60 hover:scale-[1.02] hover:shadow-2xl'}`}
        onClick={onClick}
    >
        <div className="aspect-square rounded-[32px] bg-slate-800 mb-4 overflow-hidden relative shadow-lg">
            <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover transition-all duration-700 group-hover:scale-110" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-4">
                <button 
                    onClick={(e) => { e.stopPropagation(); onEdit(); }}
                    className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center hover:bg-white/40 transition-all"
                >
                    <Edit2 size={18} className="text-white" />
                </button>
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
                    <Play size={24} className="text-slate-950 fill-slate-950 ml-1" />
                </div>
                <button 
                    onClick={(e) => { e.stopPropagation(); if(window.confirm('Purge entity?')) onDelete(); }}
                    className="w-10 h-10 bg-red-500/20 backdrop-blur-md rounded-full flex items-center justify-center hover:bg-red-500/40 transition-all"
                >
                    <Trash2 size={18} className="text-white" />
                </button>
            </div>
            {active && (
                <div className="absolute top-4 right-4 bg-indigo-500 text-white p-2 rounded-full shadow-lg">
                    <Activity size={16} />
                </div>
            )}
        </div>
        <div className="px-1">
            <h3 className="font-bold text-base truncate leading-tight group-hover:text-indigo-400 transition-colors">{track.title}</h3>
            <p className="text-slate-500 text-xs font-black uppercase tracking-widest mt-1 truncate">{track.artist}</p>
        </div>
    </div>
);

interface DiscoveryCardProps {
  res: Partial<Track>;
  onPlay: () => void;
}

// Fix: Use React.FC to handle key prop correctly in TypeScript
const DiscoveryCard: React.FC<DiscoveryCardProps> = ({ res, onPlay }) => (
    <div 
        onClick={onPlay}
        className="group bg-slate-900/40 p-5 rounded-[48px] border border-slate-800/50 hover:bg-slate-800/60 hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)] transition-all cursor-pointer relative overflow-hidden"
    >
        <div className="aspect-square rounded-[32px] bg-slate-800 mb-5 overflow-hidden relative shadow-lg">
            <img 
                src={`https://picsum.photos/seed/${res.title}/600/600`} 
                alt="" 
                className="w-full h-full object-cover grayscale-[0.2] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-110" 
            />
            <div className="absolute inset-0 bg-indigo-600/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center">
                    <Play size={32} className="text-white fill-white ml-1" />
                </div>
            </div>
        </div>
        <h3 className="font-black text-lg leading-tight truncate tracking-tight">{res.title}</h3>
        <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mt-2 truncate">{res.artist}</p>
        <div className="mt-4 flex gap-2">
            <span className="px-3 py-1 bg-indigo-500/10 text-indigo-400 text-[9px] font-black rounded-full border border-indigo-500/20 uppercase tracking-widest">
                {res.genre || 'Cloud Entity'}
            </span>
        </div>
    </div>
);

export default App;
