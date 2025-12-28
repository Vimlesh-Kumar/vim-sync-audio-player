# Vim SyncPlayer

**Vim SyncPlayer** is a web-based multi-device audio player that allows you to play music in perfect synchronization across multiple devices (Laptops, Phones, Tablets) connected to the same Wi-Fi network.

![Vim SyncPlayer UI](https://via.placeholder.com/800x400?text=Vim+SyncPlayer)

## Features

*   **Precision Sync**: Uses NTP-like time synchronization to ensure audio plays at the exact same millisecond on all devices.
*   **Host Control**: One device acts as the "Host" to upload songs, play, pause, and stop playback.
*   **Late Join Support**: Devices can join in the middle of a song and effectively "catch up" instantly.
*   **Mobile Support**: Includes a "Enable Audio" unlock flow for iOS/Android devices with strict autoplay policies.
*   **Visualizer**: A sleek UI with a simulated audio visualizer.

## Prerequisites

*   **Node.js** (v18 or higher)
*   **Wi-Fi Network**: All devices must be on the same local network.

## Installation

1.  **Clone the repository** (or download source):
    ```bash
    git clone <your-repo-url>
    cd audio-player
    ```

2.  **Install Dependencies**:
    The project is a monorepo containing `client` and `server`.
    ```bash
    # Install server dependencies
    cd server
    npm install

    # Install client dependencies
    cd ../client
    npm install
    ```

## Usage

### 1. Start the Server
In a terminal window:
```bash
cd server
node index.js
```
The server will run on port `3000`.

### 2. Start the Client
In a separate terminal window:
```bash
cd client
npm run dev -- --host
```
The client will start (usually on port `5173`) and expose it to your local network.

### 3. Connect Devices
1.  Look at the `client` terminal output for the **Network URL** (e.g., `http://192.168.1.5:5173/`).
2.  Open this URL on all your devices (Mac, iPhone, Android, etc.).

### 4. Play Music
1.  On one device (e.g., your Laptop), check the **"Enable Host Controls"** box.
2.  Click **"Choose File"** and upload an MP3/WAV file.
3.  Click **"Play in Sync"**.
4.  All connected devices should start playing the music in perfect sync!

> **Note for Mobile Users**: You must tap the **"Enable Audio"** button on your phone before playback can start. This is a browser security requirement.

## Troubleshooting

*   **Audio not playing on iPhone?** Ensure you clicked the "Enable Audio" button at the top of the screen.
*   **Not measuring offset?** Ensure your firewall allows traffic on port `3000` and `5173`.
*   **Out of sync?** Click the "Resync Clock" button on the lagging device.

## License

MIT
