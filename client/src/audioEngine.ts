export class AudioEngine {
    ctx: AudioContext;
    buffer: AudioBuffer | null = null;
    source: AudioBufferSourceNode | null = null;
    gainNode: GainNode;

    audioTag: HTMLAudioElement | null = null;
    blobUrl: string | null = null;

    constructor() {
        const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
        this.ctx = new AudioContextClass();
        this.gainNode = this.ctx.createGain();
        this.gainNode.connect(this.ctx.destination);

        // Setup hidden audio tag for iOS fallback
        this.audioTag = new Audio();
        this.audioTag.preload = 'auto';
        this.audioTag.style.display = 'none';
        document.body.appendChild(this.audioTag);
    }

    async load(arrayBuffer: ArrayBuffer, mimeType: string = 'audio/mpeg') {
        console.log(`AudioEngine: Loading ${arrayBuffer.byteLength} bytes as ${mimeType}`);

        // 1. Clear previous
        if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);

        // 2. WebAudio Decoding (for duration/visuals)
        try {
            // Need a fresh copy for decodeAudioData
            const decodeCopy = arrayBuffer.slice(0);
            this.buffer = await this.ctx.decodeAudioData(decodeCopy);
            console.log("AudioEngine: WebAudio Decoded, duration:", this.buffer.duration);
        } catch (e) {
            console.error("AudioEngine: WebAudio decode failed. Format might not be supported.");
        }

        // 3. Create Blob URL for HTML5 Audio Tag
        const blob = new Blob([arrayBuffer], { type: mimeType });
        this.blobUrl = URL.createObjectURL(blob);

        if (this.audioTag) {
            this.audioTag.src = this.blobUrl;
            this.audioTag.load();
        }
    }

    async resumeContext(silent: boolean = true) {
        console.log("AudioEngine: Resuming (state: " + this.ctx.state + ")");

        // iOS requires user gesture to start HTML5 audio too
        if (this.audioTag) {
            this.audioTag.play().then(() => {
                this.audioTag?.pause();
                if (this.audioTag) this.audioTag.currentTime = 0;
            }).catch(e => console.warn("AudioTag unlock failed", e));
        }

        try {
            await this.ctx.resume();

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);

            if (silent) {
                gain.gain.setValueAtTime(0, this.ctx.currentTime);
                osc.start(0);
                osc.stop(this.ctx.currentTime + 0.1);
            } else {
                osc.frequency.setValueAtTime(440, this.ctx.currentTime);
                gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.5);
                osc.start(0);
                osc.stop(this.ctx.currentTime + 0.5);
            }

            return this.ctx.state === 'running';
        } catch (e) {
            return false;
        }
    }

    play(startServerTime: number, serverTimeOffset: number) {
        this.stop();

        const nowLocal = Date.now();
        const startLocal = startServerTime - serverTimeOffset;
        let delayS = (startLocal - nowLocal) / 1000;
        let offsetS = 0;

        if (delayS < 0) {
            offsetS = -delayS;
            delayS = 0;
        }

        console.log(`AudioEngine: Play Scheduled. Delay: ${delayS.toFixed(2)}s, Offset: ${offsetS.toFixed(2)}s`);

        // iOS Logic: Use Audio Tag if we can, else WebAudio
        if (this.audioTag && this.blobUrl) {
            const startTag = () => {
                if (!this.audioTag) return;

                try {
                    this.audioTag.currentTime = offsetS;
                    this.audioTag.play().catch(e => {
                        console.error("AudioTag.play() failed:", e.name, e.message);
                        this.playWebAudio(0, offsetS); // Fallback immediately
                    });
                } catch (e) {
                    console.error("AudioTag seek failed, likely metadata not ready yet.", e);
                    this.playWebAudio(0, offsetS);
                }
            };

            if (delayS > 0) {
                setTimeout(startTag, delayS * 1000);
            } else {
                startTag();
            }
        } else {
            this.playWebAudio(delayS, offsetS);
        }
    }

    private playWebAudio(delay: number, offset: number) {
        if (!this.buffer) return;
        this.source = this.ctx.createBufferSource();
        this.source.buffer = this.buffer;
        this.source.connect(this.gainNode);
        this.source.start(this.ctx.currentTime + delay, offset);
    }

    setVolume(value: number) {
        // value should be 0 to 1
        const vol = Math.max(0, Math.min(1, value));
        this.gainNode.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.05);
        if (this.audioTag) {
            this.audioTag.volume = vol;
        }
    }

    stop() {
        if (this.audioTag) {
            this.audioTag.pause();
            this.audioTag.currentTime = 0;
        }
        if (this.source) {
            try { this.source.stop(); } catch (e) { }
            this.source.disconnect();
            this.source = null;
        }
    }
}
