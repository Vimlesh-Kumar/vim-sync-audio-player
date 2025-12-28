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
  elapsed: 0 // Track how much time has successfully// Placeholder to view file. played to handle syncing resumes
};

const clients = new Map();
let currentHostId = null;

io.on('connection', (socket) => {
  console.log('Client connected', socket.id);

  // Initialize client entry
  clients.set(socket.id, {
    id: socket.id,
    name: 'Unknown Device',
    isHost: false,
    volume: 1,
    status: 'Idle',
    latency: 0
  });

  // Function to broadcast updated client list to hosts
  const broadcastClientsToHosts = () => {
    const clientList = Array.from(clients.values());
    io.emit('clients_update', clientList);
  };

  // Send current state
  socket.emit('playback_state', playbackState);
  if (currentAudioName) {
    socket.emit('audio_available', { name: currentAudioName, type: currentAudioType });
  }
  broadcastClientsToHosts();

  // Time Sync
  // Handle identity update
  socket.on('update_identity', (data) => {
    const client = clients.get(socket.id);
    if (!client) return;

    // Strict Host Locking Logic
    if (data.isHost !== undefined) {
      if (data.isHost) {
        // Trying to become host
        if (currentHostId === null) {
          // Success: Claim host
          currentHostId = socket.id;
          client.isHost = true;
          console.log(`Host claimed by ${client.name} (${socket.id})`);
        } else if (currentHostId === socket.id) {
          // Already host, just refreshing (e.g. re-render)
          client.isHost = true;
        } else {
          // Failed: Someone else is host
          client.isHost = false;
          // We don't overwrite other data, just deny host
        }
      } else {
        // Trying to stop being host
        if (currentHostId === socket.id) {
          currentHostId = null;
          client.isHost = false;
          console.log(`Host released by ${client.name}`);
        } else {
          client.isHost = false;
        }
      }
    }

    // Update other properties safely
    if (data.name) client.name = data.name;
    if (data.volume !== undefined) client.volume = data.volume;
    if (data.status) client.status = data.status;

    // Force strict host state in client object to match server truth
    client.isHost = (currentHostId === socket.id);

    broadcastClientsToHosts();
    // Send back the corrected state to the requester so UI updates if denied
    socket.emit('identity_corrected', { isHost: client.isHost });
  });

  // Time Sync
  socket.on('timesync', (clientSendTime, cb) => {
    const serverTime = Date.now();
    cb(serverTime, clientSendTime);

    // Briefly update latency info for host view
    const client = clients.get(socket.id);
    if (client) {
      // clientSendTime is when they sent it, serverTime is when we got it. 
      // This is a rough estimate but good for UI
      client.latency = serverTime - clientSendTime;
    }
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
    const client = clients.get(socket.id);
    if (client) {
      client.status = 'Downloading';
      broadcastClientsToHosts();
    }

    if (currentAudioBuffer) {
      cb({ buffer: currentAudioBuffer, type: currentAudioType, name: currentAudioName });
      if (client) {
        client.status = 'Ready';
        broadcastClientsToHosts();
      }
    } else {
      cb(null);
    }
  });

  // Play
  socket.on('play', (delay = 2000) => {
    const now = Date.now();
    const startAt = (now + delay) - playbackState.elapsed;

    playbackState.isPlaying = true;
    playbackState.startTime = startAt;

    console.log(`Starting playback. Host: ${socket.id}`);

    // Update all client statuses
    clients.forEach(c => { if (c.status === 'Ready') c.status = 'Playing'; });
    broadcastClientsToHosts();

    io.emit('play', playbackState);
  });

  socket.on('pause', () => {
    if (playbackState.isPlaying) {
      const now = Date.now();
      playbackState.elapsed = now - playbackState.startTime;
      playbackState.isPlaying = false;

      clients.forEach(c => { if (c.status === 'Playing') c.status = 'Ready'; });
      broadcastClientsToHosts();

      console.log(`Paused at elapsed: ${playbackState.elapsed}ms`);
      io.emit('pause');
    }
  });

  socket.on('seek', (seekTimeMs) => {
    const now = Date.now();
    playbackState.elapsed = seekTimeMs;

    if (playbackState.isPlaying) {
      playbackState.startTime = now - seekTimeMs;
    } else {
      playbackState.startTime = 0;
    }

    console.log(`Seeking to: ${seekTimeMs}ms.`);
    io.emit('seek', playbackState);
  });

  socket.on('stop', () => {
    playbackState.isPlaying = false;
    playbackState.startTime = 0;
    playbackState.elapsed = 0;

    clients.forEach(c => c.status = 'Ready');
    broadcastClientsToHosts();

    io.emit('stop');
  });

  // Remote Control: Host to Client
  socket.on('control_device', ({ targetId, action, value }) => {
    // Basic security: In a real app we'd verify 'socket.id' is indeed a host
    io.to(targetId).emit('remote_control', { action, value });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id);
    clients.delete(socket.id);

    // Release host lock if the host disconnects
    if (currentHostId === socket.id) {
      currentHostId = null;
      console.log("Host disconnected, lock released.");
    }

    broadcastClientsToHosts();
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
