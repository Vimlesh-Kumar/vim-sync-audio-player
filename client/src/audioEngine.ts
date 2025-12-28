export class AudioEngine {
    ctx: AudioContext;
    buffer: AudioBuffer | null = null;
    source: AudioBufferSourceNode | null = null;
    gainNode: GainNode;

    constructor() {
        const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
        this.ctx = new AudioContextClass();
        this.gainNode = this.ctx.createGain();
        this.gainNode.connect(this.ctx.destination);
    }

    async load(arrayBuffer: ArrayBuffer) {
        return new Promise<void>((resolve, reject) => {
            this.ctx.decodeAudioData(
                arrayBuffer,
                (buffer) => {
                    this.buffer = buffer;
                    console.log("AudioEngine: Decoded successfully, duration:", this.buffer.duration);
                    resolve();
                },
                (err) => {
                    console.error("AudioEngine: Decode failed", err);
                    reject(err);
                }
            );
        });
    }

    async resumeContext() {
        console.log("AudioEngine: Attempting to resume context...");
        if (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted') {
            await this.ctx.resume();
        }

        // Essential for iOS: play a burst of sound on user interaction
        const osc = this.ctx.createOscillator();
        const silentGain = this.ctx.createGain();
        osc.connect(silentGain);
        silentGain.connect(this.ctx.destination);
        silentGain.gain.setValueAtTime(0, this.ctx.currentTime);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);

        console.log("AudioEngine: Context state after resume:", this.ctx.state);
        return this.ctx.state === 'running';
    }

    play(startServerTime: number, serverTimeOffset: number) {
        if (!this.buffer) {
            console.warn("AudioEngine: Cannot play, no buffer loaded.");
            return;
        }

        this.stop();

        const playInternal = () => {
            if (!this.buffer || !this.ctx) return;

            const nowLocal = Date.now();
            const startLocal = startServerTime - serverTimeOffset;

            let delay = (startLocal - nowLocal) / 1000;
            let startOffset = 0;

            if (delay < 0) {
                if (-delay > this.buffer.duration) {
                    console.log("AudioEngine: Playback time is beyond buffer duration");
                    return;
                }
                startOffset = -delay;
                delay = 0;
            }

            console.log(`AudioEngine: Scheduling start in ${delay.toFixed(3)}s at offset ${startOffset.toFixed(3)}s`);

            this.source = this.ctx.createBufferSource();
            this.source.buffer = this.buffer;
            this.source.connect(this.gainNode);
            this.gainNode.gain.value = 1.0;

            // start(when, offset)
            this.source.start(this.ctx.currentTime + delay, startOffset);
        };

        if (this.ctx.state !== 'running') {
            this.ctx.resume().then(() => playInternal());
        } else {
            playInternal();
        }
    }

    stop() {
        if (this.source) {
            try { this.source.stop(); } catch (e) { }
            this.source.disconnect();
            this.source = null;
        }
    }
}
