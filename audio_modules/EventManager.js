export class EventManager {
    constructor(ctx, destination) {
        this.ctx = ctx;
        this.destination = destination;

        this.violinBuffer = null;
        this.isViolinPlaying = false;
        this.violinSource = null;
        this.violinGain = null;

        this.tinnitusNode = null;
        this.tinnitusGain = null;

        this.spookBuffer = null;
    }

    async loadAssets() {
        await this.loadViolinSound();
        await this.loadSpookSound();
    }

    async loadViolinSound() {
        try {
            const response = await fetch('audio/Eerily Plucking Violin Strings.mp3');
            const arrayBuffer = await response.arrayBuffer();
            this.violinBuffer = await this.ctx.decodeAudioData(arrayBuffer);
        } catch (e) {
            console.warn("EventManager: Failed to load violin", e);
        }
    }

    async loadSpookSound() {
        try {
            const response = await fetch('audio/spook.m4a');
            const arrayBuffer = await response.arrayBuffer();
            this.spookBuffer = await this.ctx.decodeAudioData(arrayBuffer);
        } catch (e) {
            console.warn("EventManager: Failed to load spook", e);
        }
    }

    playSpook() {
        if (!this.spookBuffer) return;
        const source = this.ctx.createBufferSource();
        source.buffer = this.spookBuffer;
        const gain = this.ctx.createGain();
        gain.gain.value = 3.0; // Very Loud
        source.connect(gain);
        gain.connect(this.destination);
        source.start(0);
    }

    update(delta, metrics, parentManager) {
        this.manageViolin(delta, metrics, parentManager);
        this.manageTinnitus(delta, metrics);
    }

    // --- VIOLIN ---
    manageViolin(delta, metrics, parentManager) {
        if (!this.violinBuffer) return;
        const distToVoid = metrics.distToVoid || 9999;

        if (distToVoid < 500) {
            if (!this.isViolinPlaying) this.startViolin();

            // Mute Background Music (via Parent/Ambient Manager facade call if needed)
            // Ideally parent passes a callback, or we access the AmbientManager directly?
            // The Refactor Plan says "Refactor audio_system.js to coordinate".
            // So logic affecting GLOBAL state (BG music volume) might be better in the Facade, 
            // OR we expose a "suppression" flag.

            // For now, let's assume we can trigger suppression by returning a flag or state.
            // But to match current logic:
            if (parentManager && parentManager.fadeBgMusic) {
                parentManager.fadeBgMusic(0.0, 4.0); // Target 0, fast fade
            }

            if (this.violinGain) {
                const t = Math.max(0, Math.min((500 - distToVoid) / 300.0, 1.0));
                const vol = Math.pow(t, 2) * 1.3;
                this.violinGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);

                if (distToVoid < 10) {
                    this.stopViolin();
                }
            }
        } else {
            if (this.isViolinPlaying) this.stopViolin();
            if (parentManager && parentManager.restoreBgMusic) {
                parentManager.restoreBgMusic(1.0);
            }
        }
    }

    startViolin() {
        if (this.isViolinPlaying || !this.violinBuffer) return;
        this.violinSource = this.ctx.createBufferSource();
        this.violinSource.buffer = this.violinBuffer;
        this.violinSource.loop = true;
        this.violinSource.playbackRate.value = 0.8;
        this.violinGain = this.ctx.createGain();
        this.violinGain.gain.value = 0;
        this.violinSource.connect(this.violinGain);
        this.violinGain.connect(this.destination);
        this.violinSource.start(0);
        this.isViolinPlaying = true;
    }

    stopViolin() {
        if (this.violinSource) {
            try {
                this.violinSource.stop();
                this.violinSource.disconnect();
                this.violinGain.disconnect();
            } catch (e) { }
            this.violinSource = null;
        }
        this.isViolinPlaying = false;
    }

    // --- TINNITUS ---
    manageTinnitus(delta, metrics) {
        if (!this.consumedTime) this.consumedTime = 0;
        const dist = metrics.distToVoid || 9999;

        // Trigger PAST edge (200 units offset from BH)
        if (dist > 200) {
            if (this.tinnitusNode) {
                if (this.tinnitusGain.gain.value > 0.01) {
                    this.tinnitusGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
                }
            }
            return;
        }

        if (!this.tinnitusNode) {
            this.tinnitusNode = this.ctx.createOscillator();
            this.tinnitusNode.type = 'sine';
            this.tinnitusNode.frequency.value = 9000;
            this.tinnitusGain = this.ctx.createGain();
            this.tinnitusGain.gain.value = 0;
            this.tinnitusNode.connect(this.tinnitusGain);
            this.tinnitusGain.connect(this.destination);
            this.tinnitusNode.start();
        }

        const range = 200;
        let progress = Math.max(0, Math.min((range - dist) / range, 1.0));

        // [CONSUMED BY VOID]
        // If dist < 45, we are inside/consumed.
        // User Request: Stop 3s after entering.
        if (dist < 45) {
            if (!this.consumedTime) {
                this.consumedTime = Date.now();
            }
            // Check if 3s (3000ms) has passed
            if (Date.now() - this.consumedTime > 3000) {
                progress = 0; // Silence
            }
            // Else: progress continues as calculated (likely 1.0 -> max vol)
        } else {
            this.consumedTime = 0; // Reset if we step out? Or keep it?
            // Usually stepping out means we aren't consumed.
        }

        // Target volume based on proximity (LOWERED 50% - User Request: 0.1 -> 0.05)
        const targetVol = progress * 0.05;

        this.tinnitusGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.1);
    }
    silence() {
        this.stopViolin();
        if (this.tinnitusGain) {
            // Fade out over 3 seconds
            this.tinnitusGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
            setTimeout(() => {
                if (this.tinnitusNode) {
                    try {
                        this.tinnitusNode.stop();
                        this.tinnitusNode.disconnect();
                        this.tinnitusGain.disconnect();
                    } catch (e) { }
                    this.tinnitusNode = null;
                }
            }, 3000);
        }
    }
}
