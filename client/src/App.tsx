import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { TimeSync } from './timeSync';
import { AudioEngine } from './audioEngine';
import { Play, Pause, Square, Radio, Upload, RotateCw, Music, Monitor } from 'lucide-react';
import './App.css';

const SERVER_URL = `http://${window.location.hostname}:3000`;

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<string>('Connecting...');
  const [offset, setOffset] = useState<number>(0);
  const [audioName, setAudioName] = useState<string | null>(null);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [sessionStartTime, setSessionStartTime] = useState<number>(0);

  const timeSyncRef = useRef<TimeSync | null>(null);
  const audioEngineRef = useRef<AudioEngine | null>(null);
  
  // Timer Loop for Progress Bar
  useEffect(() => {
    let animationFrame: number;
    const update = () => {
        if (isPlaying && sessionStartTime > 0 && timeSyncRef.current) {
            const serverTime = timeSyncRef.current.getEstimatedServerTime();
            const diff = serverTime - sessionStartTime;
            setCurrentTime(diff);
        }
        animationFrame = requestAnimationFrame(update);
    };
    animationFrame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, sessionStartTime]);
  
  useEffect(() => {
    const s = io(SERVER_URL);
    setSocket(s);
    
    timeSyncRef.current = new TimeSync(s);
    audioEngineRef.current = new AudioEngine();

    if (audioEngineRef.current.ctx.state === 'running') {
        setIsAudioEnabled(true);
    }

    s.on('connect', () => {
      setStatus('Online');
      timeSyncRef.current?.sync().then((off) => {
        setOffset(off);
      });
    });

    s.on('playback_state', (state: any) => {
        if (state.isPlaying) {
            setIsPlaying(true);
            setSessionStartTime(state.startTime);
            
             const waitAndPlay = async () => {
                let attempts = 0;
                while(attempts < 100) {
                    if (timeSyncRef.current?.serverOffset !== 0 && audioEngineRef.current?.buffer) break;
                    await new Promise(r => setTimeout(r, 100));
                    attempts++;
                }
                audioEngineRef.current?.play(state.startTime, timeSyncRef.current!.serverOffset);
                setStatus(`Sync Active`);
            };
            waitAndPlay();
        }
    });

    s.on('audio_available', ({ name }: { name: string }) => {
      setStatus(`Downloading: ${name}`);
      setAudioName(name);
      
      s.emit('request_audio', async (data: any) => {
        if (data && data.buffer) {
          try {
            await audioEngineRef.current?.load(data.buffer);
            setStatus(`Ready`);
          } catch (e) {
            setStatus('Format Error');
          }
        }
      });
    });

    s.on('play', ({ startTime }: { startTime: number }) => {
      setIsPlaying(true);
      setSessionStartTime(startTime);
      
      const waitAndPlay = async () => {
          let attempts = 0;
          while (attempts < 200) { 
              if (timeSyncRef.current?.serverOffset !== 0 && audioEngineRef.current?.buffer) break;
              await new Promise(r => setTimeout(r, 100));
              attempts++;
          }
          if (audioEngineRef.current?.buffer) {
              audioEngineRef.current.play(startTime, timeSyncRef.current!.serverOffset);
              setStatus(`Playing`);
          }
      };
      waitAndPlay();

      const serverTime = timeSyncRef.current?.getEstimatedServerTime() || Date.now();
      const delay = startTime - serverTime;
      if (delay > 0) {
        setCountdown(delay);
        const interval = setInterval(() => {
            const left = startTime - (timeSyncRef.current?.getEstimatedServerTime() || 0);
            if (left <= 0) {
                setCountdown(0);
                clearInterval(interval);
            } else {
                setCountdown(left);
            }
        }, 100);
      }
    });

    s.on('seek', (state: any) => {
        if (state.isPlaying) {
             setIsPlaying(true);
             setSessionStartTime(state.startTime);
             audioEngineRef.current?.play(state.startTime, timeSyncRef.current!.serverOffset);
        } else {
             setIsPlaying(false);
             setCurrentTime(state.elapsed);
        }
    });

    s.on('stop', () => {
      setIsPlaying(false);
      setStatus(`Stopped`);
      audioEngineRef.current?.stop();
    });
    
    s.on('pause', () => {
        setIsPlaying(false);
        setStatus('Paused');
        audioEngineRef.current?.stop();
    });

    return () => {
      s.disconnect();
    };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !socket) return;
    setStatus(`Uploading...`);
    const buffer = await file.arrayBuffer();
    socket.emit('upload_audio', { name: file.name, type: file.type, buffer: buffer });
    audioEngineRef.current?.load(buffer);
    setAudioName(file.name);
    setStatus('Ready to Sync');
  };

  const handlPlayClick = () => {
    socket?.emit('play', 2000); 
  };
  
  const handlePauseClick = () => {
    socket?.emit('pause');
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!socket || !audioEngineRef.current?.buffer) return;
    const seekTime = Number(e.target.value);
    setCurrentTime(seekTime);
    socket.emit('seek', seekTime);
  };

  const handleStopClick = () => {
    socket?.emit('stop');
  };

  const handleManualSync = () => {
      timeSyncRef.current?.sync().then(off => setOffset(off));
  };

  const formatTime = (ms: number) => {
    if (ms < 0) return '00:00';
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const enableAudio = async () => {
    if (audioEngineRef.current) {
        const success = await audioEngineRef.current.resumeContext();
        if (success) {
            setIsAudioEnabled(true);
            setStatus("Ready");
        } else {
            setStatus("Context Error");
        }
    }
  };

  const handleTestSound = () => {
      audioEngineRef.current?.resumeContext();
  };

  const maxDuration = audioEngineRef.current?.buffer?.duration 
    ? audioEngineRef.current.buffer.duration * 1000 
    : 0;

  return (
    <div className="container">
      {!isAudioEnabled && (
          <div className="overlay-vlc">
              <h2>Vim SyncPlayer</h2>
              <p>Mobile browsers require permission to play audio.</p>
              <button onClick={enableAudio} className="vlc-btn-large">
                  ENABLE AUDIO SYNC
              </button>
              <p style={{marginTop: '2rem', fontSize: '0.8rem', opacity: 0.5}}>
                  Make sure your volume is up!
              </p>
          </div>
      )}

      <header>
        <h1>VIM SYNC</h1>
        <div className="status-bar">
          <span className={`pill ${socket?.connected ? 'green' : 'red'}`}>
            {socket?.connected ? 'Online' : 'Offline'}
          </span>
          <span className="pill blue">{offset.toFixed(0)}ms</span>
        </div>
      </header>

      <main>
        <div className="host-toggle-wrapper">
          <label className={`host-toggle-btn ${isHost ? 'active' : ''}`}>
              <input type="checkbox" checked={isHost} onChange={e => setIsHost(e.target.checked)} />
              {isHost ? <Monitor size={18} /> : <Radio size={18} />}
              {isHost ? "Host Controls Active" : "Enable Host Mode"}
          </label>
        </div>

        <div className="player-core">
            <div className="album-art-wrap">
                <Music size={120} className={isPlaying ? "icon-pulse" : ""} />
            </div>
            
            <div className="track-info">
                <h2 className="track-title">{audioName || "No Track Selected"}</h2>
                <div className="track-status">
                    {countdown !== null && countdown > 0 
                        ? `Starting in ${(countdown/1000).toFixed(1)}s` 
                        : status}
                </div>
                
                <div className="vlc-visualizer">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className={`vlc-bar ${isPlaying ? 'anim' : ''}`} />
                    ))}
                </div>
            </div>

            <div className="progress-section">
                <input 
                    type="range" 
                    min="0" 
                    max={maxDuration} 
                    value={currentTime} 
                    onChange={handleSeek}
                    className="vlc-slider"
                    disabled={!isHost || !audioName} 
                />
                <div className="time-row">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(maxDuration)}</span>
                </div>
            </div>
        </div>
      </main>

      <div className="bottom-controls">
          <div className="playback-btns">
              {isHost ? (
                  <>
                    <button onClick={handleStopClick} className="p-btn" disabled={!audioName}>
                        <Square size={28} fill="white" />
                    </button>
                    {isPlaying ? (
                        <button onClick={handlePauseClick} className="p-btn play-pause">
                            <Pause size={38} fill="white" />
                        </button>
                    ) : (
                        <button onClick={handlPlayClick} className="p-btn play-pause" disabled={!audioName}>
                            <Play size={38} fill="white" />
                        </button>
                    )}
                    <button onClick={handleManualSync} className="p-btn">
                        <RotateCw size={28} />
                    </button>
                  </>
              ) : (
                  <div style={{display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'center'}}>
                      <div style={{display: 'flex', gap: '10px'}}>
                        <button onClick={handleManualSync} className="vlc-btn-small">
                            RESYNC ({offset.toFixed(0)}ms)
                        </button>
                        <button onClick={handleTestSound} className="vlc-btn-small" style={{border: '1px solid var(--vlc-orange)'}}>
                            TEST BEEP
                        </button>
                      </div>
                      <p style={{fontSize: '0.7rem', color: 'var(--text-secondary)', margin: 0}}>
                          No sound? Check physical mute switch & Volume.
                      </p>
                  </div>
              )}
          </div>

          {isHost && (
              <div className="host-panel">
                 <label className="upload-btn">
                    <input type="file" accept="audio/*" onChange={handleFileUpload} hidden />
                    <Upload size={18} /> {audioName ? "Choose Another Song" : "Upload Song to Sync"}
                 </label>
              </div>
          )}
      </div>

      <footer>
        Vim SyncPlayer • Low Latency Audio Network
      </footer>
    </div>
  );
}

export default App;
