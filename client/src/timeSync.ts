import { Socket } from 'socket.io-client';

export class TimeSync {
    socket: Socket;
    serverOffset: number = 0; // serverTime = localTime + offset

    constructor(socket: Socket) {
        this.socket = socket;
    }

    async sync() {
        const ITERATIONS = 10;
        const results: { offset: number; roundTrip: number }[] = [];

        for (let i = 0; i < ITERATIONS; i++) {
            const t1 = Date.now();
            await new Promise<void>((resolve) => {
                this.socket.emit('timesync', t1, (serverTime: number, clientSendTime: number) => {
                    const t3 = Date.now();
                    const roundTrip = t3 - clientSendTime;
                    const latency = roundTrip / 2;

                    // serverTime is the time at the server when it received the ping (approx t2)
                    // The server's true time NOW (at t3) is serverTime + latency (approx)
                    // So we want to find the diff between (serverTime + latency) and localTime (t3)

                    const estimatedServerTimeAtReceive = serverTime + latency;
                    const offset = estimatedServerTimeAtReceive - t3;

                    results.push({ offset, roundTrip });
                    resolve();
                });
            });
            // Small random delay to avoid maximizing congestion
            await new Promise(r => setTimeout(r, 50 + Math.random() * 50));
        }

        // Filter out outliers (high RTT implies queuing/jitter)
        results.sort((a, b) => a.roundTrip - b.roundTrip);

        // Take the best 3 results (lowest RTT)
        const best = results.slice(0, 3);
        const avgOffset = best.reduce((sum, r) => sum + r.offset, 0) / best.length;

        this.serverOffset = avgOffset;
        console.log(`Time synced. Offset: ${this.serverOffset.toFixed(2)}ms. Best RTT: ${best[0].roundTrip}ms`);
        return this.serverOffset;
    }

    getEstimatedServerTime() {
        return Date.now() + this.serverOffset;
    }
}
