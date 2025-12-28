import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 1e8 // Allow up to 100MB
});

let currentAudioBuffer = null;
let currentAudioType = null;
let currentAudioName = null;

let playbackState = {
  isPlaying: false,
  startTime: 0,
  elapsed: 0 // Track how much time has successfully played to handle syncing resumes
};

io.on('connection', (socket) => {
  console.log('Client connected', socket.id);

  // Send current state
  socket.emit('playback_state', playbackState);
  if (currentAudioName) {
    socket.emit('audio_available', { name: currentAudioName, type: currentAudioType });
  }

  // Time Sync
  socket.on('timesync', (clientSendTime, cb) => {
    cb(Date.now(), clientSendTime);
  });

  // Host uploads audio
  socket.on('upload_audio', ({ name, type, buffer }) => {
    console.log(`Received audio: ${name}, size: ${buffer.byteLength}`);
    currentAudioBuffer = buffer;
    currentAudioType = type;
    currentAudioName = name;

    // Reset playback
    playbackState = { isPlaying: false, startTime: 0, elapsed: 0 };
    io.emit('stop');
    io.emit('audio_available', { name, type });
  });

  // Client requests audio data
  socket.on('request_audio', (cb) => {
    if (currentAudioBuffer) {
      cb({ buffer: currentAudioBuffer, type: currentAudioType, name: currentAudioName });
    } else {
      cb(null);
    }
  });

  // Play: Host specifies a delay
  socket.on('play', (delay = 2000) => {
    // If we have an accumulated elapsed time (from pausing), we shift the start time back
    // so that (Now + Delay) - StartTime = Elapsed.
    // => StartTime = (Now + Delay) - Elapsed

    const now = Date.now();
    const startAt = (now + delay) - playbackState.elapsed;

    playbackState.isPlaying = true;
    playbackState.startTime = startAt;

    console.log(`Starting playback. Server Time: ${now}, Scheduled Start: ${startAt}, resuming from: ${playbackState.elapsed}ms`);
    io.emit('play', playbackState);
  });

  socket.on('pause', () => {
    if (playbackState.isPlaying) {
      const now = Date.now();
      // Calculate how much we played since the "startTime"
      // CurrentPosition = Now - StartTime
      playbackState.elapsed = now - playbackState.startTime;
      playbackState.isPlaying = false;

      console.log(`Paused at elapsed: ${playbackState.elapsed}ms`);
      io.emit('pause');
    }
  });

  socket.on('seek', (seekTimeMs) => {
    // SeekTimeMs is the position in the track (e.g. 30000ms for 30s)

    const now = Date.now();
    playbackState.elapsed = seekTimeMs;

    if (playbackState.isPlaying) {
      // If currently playing, we shift the start time so the math works out:
      // CurrentTime = Now - StartTime  =>  SeekTime = Now - StartTime  => StartTime = Now - SeekTime
      playbackState.startTime = now - seekTimeMs;
    } else {
      // If paused, we just update the elapsed time so when we hit play, it resumes from here.
      playbackState.startTime = 0; // Not relevant while paused
    }

    console.log(`Seeking to: ${seekTimeMs}ms.`);
    io.emit('seek', playbackState);
  });

  socket.on('stop', () => {
    playbackState.isPlaying = false;
    playbackState.startTime = 0;
    playbackState.elapsed = 0;
    io.emit('stop');
  });
});

httpServer.listen(3000, '0.0.0.0', () => {
  console.log('Server running on port 3000');
});
