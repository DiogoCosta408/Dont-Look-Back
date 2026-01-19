export class PsychManager {
    constructor(ctx, destination) {
        this.ctx = ctx;
        this.destination = destination;

        this.noiseBuffer = null;
        this.whisperTimer = 0;

        this.heartbeatTimer = 0;

        this.footstepsBuffer = null;
        this.isFootstepsPlaying = false;
        this.footstepsSource = null;
        this.footstepsGain = null;
        this.footstepsGraceTimer = 0;
        this.footstepDurationTimer = 0;
    }

    async loadAssets() {
        this.createNoiseBuffer();
        await this.loadFootstepsSound();
    }

    async loadFootstepsSound() {
        try {
            const response = await fetch('audio/Footsteps in Hall.mp3');
            const arrayBuffer = await response.arrayBuffer();
            this.footstepsBuffer = await this.ctx.decodeAudioData(arrayBuffer);
        } catch (e) {
            console.warn("PsychManager: Failed to load footsteps", e);
        }
    }

    update(delta, metrics, pFactor) {
        // Heartbeat
        this.manageHeartbeat(delta, pFactor);

        // Whispers
        // this.manageWhispers(delta, pFactor);

        // Footsteps
        this.manageFootsteps(delta, metrics, pFactor);
    }

    // --- HEARTBEAT ---
    manageHeartbeat(delta, pFactor) {
        this.heartbeatTimer -= delta;
        const rateP = Math.max(0.05, Math.min(1.0, pFactor));
        const minPulse = 0.4;
        const maxPulse = 1.2;
        const interval = maxPulse - (rateP * (maxPulse - minPulse));

        if (this.heartbeatTimer <= 0) {
            if (pFactor > 0.05) {
                this.playHeartbeat(pFactor);
            }
            this.heartbeatTimer += interval;
        }
    }

    playHeartbeat(pFactor) {
        const time = this.ctx.currentTime;
        const volume = 0.2 + (pFactor * 0.6);

        this.triggerBeatImpulse(time, volume);
        this.triggerBeatImpulse(time + 0.15, volume * 0.7);
    }

    triggerBeatImpulse(startTime, vol) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(100, startTime);
        osc.frequency.exponentialRampToValueAtTime(50, startTime + 0.1);
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(vol * 0.8, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);
        osc.connect(gain);
        gain.connect(this.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.25);
    }

    // --- WHISPERS ---
    createNoiseBuffer() {
        const bufferSize = this.ctx.sampleRate * 2;
        this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        let b0, b1, b2, b3, b4, b5, b6;
        b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            data[i] *= 0.11;
            b6 = white * 0.115926;
        }
    }

    manageWhispers(delta, pFactor) {
        if (pFactor < 0.2) return;
        this.whisperTimer -= delta;
        if (this.whisperTimer <= 0) {
            this.spawnWhisper(pFactor);
            const minTime = 2 + (1.0 - pFactor) * 8;
            const maxTime = 5 + (1.0 - pFactor) * 15;
            this.whisperTimer = minTime + Math.random() * (maxTime - minTime);
        }
    }

    spawnWhisper(pFactor) {
        if (!this.noiseBuffer) this.createNoiseBuffer();
        const source = this.ctx.createBufferSource();
        source.buffer = this.noiseBuffer;
        const gainNode = this.ctx.createGain();
        gainNode.gain.value = 0;

        const panner = this.ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'linear';

        const angle = Math.random() * Math.PI * 2;
        const dist = 2 + Math.random() * 3;
        panner.positionX.value = Math.sin(angle) * dist;
        panner.positionY.value = (Math.random() - 0.5) * 1;
        panner.positionZ.value = Math.cos(angle) * dist;

        source.connect(gainNode);
        gainNode.connect(panner);
        panner.connect(this.destination);

        const now = this.ctx.currentTime;
        const duration = 0.5 + Math.random() * 1.0;
        source.start(now);
        source.stop(now + duration + 0.5);

        const vol = 0.1 + (pFactor * 0.3);
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(vol, now + duration * 0.2);
        gainNode.gain.linearRampToValueAtTime(0, now + duration);
        source.detune.value = (Math.random() - 0.5) * 1200;
    }

    // --- FOOTSTEPS ---
    manageFootsteps(delta, metrics, pFactor) {
        if (pFactor <= 0.2) {
            if (this.isFootstepsPlaying) this.stopFootsteps();
            return;
        }

        if (this.isFootstepsPlaying) {
            if (metrics.isStationary) {
                this.footstepsGraceTimer += delta;
                if (this.footstepsGraceTimer > 1.5) {
                    this.stopFootsteps();
                    this.footstepsGraceTimer = 0;
                }
                return;
            } else {
                this.footstepsGraceTimer = 0;
            }

            this.footstepDurationTimer += delta;
            if (this.footstepDurationTimer > 12.0) {
                this.stopFootsteps();
                this.footstepDurationTimer = 0;
            }
        } else {
            const chance = 0.0001 + (pFactor * 0.0002);
            if (!metrics.isStationary && Math.random() < chance) {
                this.startFootsteps();
                if (this.footstepsGain) this.footstepsGain.gain.value = 1.5;
                this.footstepDurationTimer = 0;
                this.footstepsGraceTimer = 0;
            }
        }
    }

    startFootsteps() {
        if (this.isFootstepsPlaying || !this.footstepsBuffer) return;
        this.footstepsSource = this.ctx.createBufferSource();
        this.footstepsSource.buffer = this.footstepsBuffer;
        this.footstepsSource.loop = true;
        this.footstepsGain = this.ctx.createGain();
        this.footstepsGain.gain.value = 1.0;
        this.footstepsSource.connect(this.footstepsGain);
        this.footstepsGain.connect(this.destination);
        this.footstepsSource.start(0);
        this.isFootstepsPlaying = true;
    }

    stopFootsteps() {
        if (this.footstepsSource) {
            try {
                this.footstepsSource.stop();
                this.footstepsSource.disconnect();
                this.footstepsGain.disconnect();
            } catch (e) { }
            this.footstepsSource = null;
        }
        this.isFootstepsPlaying = false;
    }

    silence() {
        this.stopFootsteps();
        this.heartbeatTimer = 999; // Delay next beat
    }

    reset() {
        this.heartbeatTimer = 0;
        this.whisperTimer = 10;
        this.footstepsGraceTimer = 0;
        this.footstepDurationTimer = 0;
    }
}
