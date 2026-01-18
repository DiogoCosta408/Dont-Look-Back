export class IntroAudioManager {
    constructor(ctx, destination) {
        this.ctx = ctx;
        this.destination = destination;

        this.clockBuffer = null;
        this.clockSource = null;
        this.clockGain = null;
        this.isClockPlaying = false;
    }

    async loadAssets() {
        await this.loadClockSound();
    }

    async loadClockSound() {
        try {
            const response = await fetch('audio/ticking_clock.m4a');
            const arrayBuffer = await response.arrayBuffer();
            this.clockBuffer = await this.ctx.decodeAudioData(arrayBuffer);
        } catch (e) {
            console.warn("IntroAudio: Failed to load clock", e);
        }
    }

    startClock() {
        if (this.isClockPlaying || !this.clockBuffer) return;

        this.clockSource = this.ctx.createBufferSource();
        this.clockSource.buffer = this.clockBuffer;
        this.clockSource.loop = true;

        this.clockGain = this.ctx.createGain();
        this.clockGain.gain.value = 1.0;

        this.clockSource.connect(this.clockGain);
        this.clockGain.connect(this.destination);

        this.clockSource.start(0);
        this.isClockPlaying = true;
    }

    stopClock() {
        if (this.clockSource) {
            try {
                this.clockSource.stop();
                this.clockSource.disconnect();
                this.clockGain.disconnect();
            } catch (e) { }
            this.clockSource = null;
        }
        this.isClockPlaying = false;
    }
}
