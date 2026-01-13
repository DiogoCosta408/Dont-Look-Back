export class AudioSystem {
    constructor(camera) {
        this.camera = camera;
        this.initialized = false;

        // Web Audio API
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();

        // Nodes
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);

        // Filters for "Silence Pressure"
        this.pressureFilter = this.ctx.createBiquadFilter();
        this.pressureFilter.type = 'lowpass';
        this.pressureFilter.frequency.value = 20000; // Open
        this.pressureFilter.connect(this.masterGain);

        // Ambience (Stillness sound)
        this.humOsc = null;
        this.humGain = null;
        this.isHumming = false;
    }

    initialize(bgMusicElement) {
        if (this.initialized) return;

        // Connect BG Music to our graph
        try {
            const track = this.ctx.createMediaElementSource(bgMusicElement);
            track.connect(this.pressureFilter);
            this.initialized = true;
            console.log("AudioSystem: Wired to BG Music");

            // Load Violin Sample
            this.loadViolinSound();
            this.loadClockSound();
            this.loadFootstepsSound();
            this.loadSpookSound();

        } catch (e) {
            console.warn("AudioSystem: Failed to hook BG music", e);
        }
    }

    async loadViolinSound() {
        try {
            const response = await fetch('audio/Eerily Plucking Violin Strings.mp3');
            const arrayBuffer = await response.arrayBuffer();
            this.violinBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            console.log("AudioSystem: Violin Sample Loaded");
        } catch (e) {
            console.warn("AudioSystem: Failed to load violin sample", e);
        }
    }

    async loadClockSound() {
        try {
            const response = await fetch('audio/ticking_clock.m4a');
            const arrayBuffer = await response.arrayBuffer();
            this.clockBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            console.log("AudioSystem: Clock Sample Loaded");
        } catch (e) {
            console.warn("AudioSystem: Failed to load clock sample", e);
        }
    }

    async loadSpookSound() {
        try {
            const response = await fetch('audio/spook.m4a');
            const arrayBuffer = await response.arrayBuffer();
            this.spookBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            console.log("AudioSystem: Spook Sample Loaded");
        } catch (e) {
            console.warn("AudioSystem: Failed to load spook sample", e);
        }
    }

    playSpook() {
        if (!this.spookBuffer) return;
        const source = this.ctx.createBufferSource();
        source.buffer = this.spookBuffer;

        const gain = this.ctx.createGain();
        gain.gain.value = 3.0; // Very Loud

        source.connect(gain);
        gain.connect(this.masterGain);

        source.start(0);
    }

    startClock() {
        if (this.isClockPlaying || !this.clockBuffer) return;

        this.clockSource = this.ctx.createBufferSource();
        this.clockSource.buffer = this.clockBuffer;
        this.clockSource.loop = true;

        this.clockGain = this.ctx.createGain();
        this.clockGain.gain.value = 1.0; // Loud loop

        this.clockSource.connect(this.clockGain);
        this.clockGain.connect(this.masterGain);

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

    startViolin() {
        if (this.isViolinPlaying || !this.violinBuffer) return;

        this.violinSource = this.ctx.createBufferSource();
        this.violinSource.buffer = this.violinBuffer;
        this.violinSource.loop = true;
        this.violinSource.playbackRate.value = 0.8;

        this.violinGain = this.ctx.createGain();
        this.violinGain.gain.value = 0;

        this.violinSource.connect(this.violinGain);
        this.violinGain.connect(this.masterGain);

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
            this.violinGain = null;
        }
        this.isViolinPlaying = false;
    }

    manageViolin(delta, metrics) {
        if (!this.violinBuffer) return;

        const distToVoid = metrics.distToVoid || 9999;

        // Trigger Range: 500 units (Approx 300u before edge, visible range)
        if (distToVoid < 500) {
            if (!this.isViolinPlaying) this.startViolin();

            // FADE OUT BG MUSIC (Carpathian) - STOP immediately when violin starts
            if (this.pressureFilter) {
                // Target gain: 0.0 (Silence)
                const current = this.pressureFilter.gain.value;
                this.pressureFilter.gain.value += (0.0 - current) * delta * 4.0; // Fast fade
            }

            if (this.violinGain) {
                // Fade In Logic
                // 500 -> 0.0
                // 200 -> 1.0 (Max volume at Edge)
                const t = Math.max(0, Math.min((500 - distToVoid) / 300.0, 1.0));
                const vol = Math.pow(t, 2) * 1.3; // Boosted 30%
                this.violinGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);

                // No Hard Cutoff for violin, let it screech into the void
                // Or cutoff at impact?
                if (distToVoid < 10) {
                    this.stopViolin();
                }
            }
        } else {
            if (this.isViolinPlaying) this.stopViolin();

            // RESTORE BG MUSIC
            if (this.pressureFilter && this.pressureFilter.gain.value < 1.0) {
                const current = this.pressureFilter.gain.value;
                this.pressureFilter.gain.value += (1.0 - current) * delta * 1.0;
            }
        }
    }

    manageTinnitus(delta, metrics) {
        // TINNITUS: High pitched screaming logic
        const dist = metrics.distToVoid || 9999;

        // Trigger ONLY when crossing the edge.
        // Black Hole is at ~200 units from the edge (See Environment.js)
        // So crossing the edge means dist <= 200.

        if (dist > 200) {
            // Far from edge - Silence
            if (this.tinnitusNode) {
                if (this.tinnitusGain.gain.value > 0.01) {
                    const t = this.ctx.currentTime;
                    this.tinnitusGain.gain.setTargetAtTime(0, t, 0.2);
                } else {
                    // Stop oscillator if effectively silent to save CPU
                    // Actually, keep it running but silent is safer for scheduling
                }
            }
            return;
        }

        // We are PAST the Edge (or falling)
        if (!this.tinnitusNode) {
            this.tinnitusNode = this.ctx.createOscillator();
            this.tinnitusNode.type = 'sine';
            this.tinnitusNode.frequency.value = 9000; // Pierce

            this.tinnitusGain = this.ctx.createGain();
            this.tinnitusGain.gain.value = 0;

            this.tinnitusNode.connect(this.tinnitusGain);
            this.tinnitusGain.connect(this.masterGain);
            this.tinnitusNode.start();
        }

        // Volume Ramp: 200 -> 0.0, 0 -> 0.1
        // As we fall closer to BH (0), volume increases
        const range = 200;
        const progress = Math.max(0, Math.min((range - dist) / range, 1.0));

        // Target Volume (Max 0.1)
        const targetVol = progress * 0.1;

        const t = this.ctx.currentTime;
        this.tinnitusGain.gain.setTargetAtTime(targetVol, t, 0.1);
    }

    resume() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // ... (existing methods remain, replacing from manageStillnessHum down)

    update(delta, metrics, pFactor) {
        if (!this.initialized) return;

        // ENDGAME AUDIO CUTOFF
        if (pFactor >= 0.99) {
            this.pressureFilter.gain.value = 0;
            this.manageStillnessHum(delta, metrics, 1.0);
            this.manageTinnitus(delta, metrics); // Pass Metrics
            return;
        }

        this.manageSilencePressure(delta, metrics);
        this.manageStillnessHum(delta, metrics, pFactor);
        this.manageHeartbeat(delta, pFactor);
        this.manageTinnitus(delta, metrics);
        this.manageTinnitus(delta, metrics);
        this.manageViolin(delta, metrics);
        this.manageFootsteps(delta, metrics, pFactor);
    }

    async loadFootstepsSound() {
        try {
            const response = await fetch('audio/Footsteps in Hall.mp3');
            const arrayBuffer = await response.arrayBuffer();
            this.footstepsBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            console.log("AudioSystem: Footsteps Sample Loaded");
        } catch (e) {
            console.warn("AudioSystem: Failed to load footsteps sample", e);
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
        this.footstepsGain.connect(this.masterGain);

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

    manageFootsteps(delta, metrics, pFactor) {
        // PHANTOM FOOTSTEPS: Rare event when Paranoia > 20%
        // Simulates finding someone walking behind you.
        if (pFactor <= 0.2) {
            if (this.isFootstepsPlaying) this.stopFootsteps();
            return;
        }

        if (this.isFootstepsPlaying) {
            // INTERRUPT LOGIC:
            // If player stops, sound continues for ~1.5s then stops (Simulating 'catching up')
            if (metrics.isStationary) {
                if (this.footstepsGraceTimer === undefined) this.footstepsGraceTimer = 0;
                this.footstepsGraceTimer += delta;

                if (this.footstepsGraceTimer > 1.5) {
                    this.stopFootsteps();
                    this.footstepsGraceTimer = 0;
                }
                return; // processing done for this frame
            } else {
                this.footstepsGraceTimer = 0; // Reset grace if moving
            }

            // PLAYING DURATION (While Moving)
            // Play for a longer burst (8 seconds) then vanish
            if (this.footstepDurationTimer === undefined) this.footstepDurationTimer = 0;
            this.footstepDurationTimer += delta;

            if (this.footstepDurationTimer > 12.0) {
                this.stopFootsteps();
                this.footstepDurationTimer = 0;
            }
        } else {
            // IDLE STATE - Chance to trigger
            // Very rare: 0.01% base chance per frame
            const chance = 0.0001 + (pFactor * 0.0002);

            // Only start if player is moving
            if (!metrics.isStationary && Math.random() < chance) {
                this.startFootsteps();
                this.footstepsGain.gain.value = 1.5; // Louder (was 0.6)
                this.footstepDurationTimer = 0;
                this.footstepsGraceTimer = 0;
            }
        }
    }



    manageSilencePressure(delta, metrics) {
        // PRESSURE: As player stands still, audio becomes muffled (LowPass)
        let targetFreq = 20000;
        if (metrics.isStationary && metrics.stationaryTime > 3.0) {
            const progress = Math.min((metrics.stationaryTime - 3.0) / 10.0, 1.0);
            targetFreq = 20000 - (19600 * progress);
        }
        const current = this.pressureFilter.frequency.value;
        this.pressureFilter.frequency.value += (targetFreq - current) * delta * 0.5;
    }

    manageStillnessHum(delta, metrics, pFactor) {
        // HUM LOGIC:
        // Scaled purely by Paranoia as a "Sensorial Indicator"
        let targetGain = 0;

        if (pFactor > 0) {
            // Linear scaling: 0.0 -> 0.0, 1.0 -> 0.25
            targetGain = pFactor * 0.25;
        }

        // Force silence in Intro explicitly (though pFactor should be 0)
        if (pFactor <= 0) targetGain = 0;

        // ENDGAME OVERRIDE (Starfield / Psychosis Break)
        if (pFactor >= 0.99) {
            targetGain = 0.4; // Loud roar
        }

        if (targetGain > 0) {
            if (!this.isHumming) this.startHum();

            if (this.humGain) {
                // Smooth ramp
                const current = this.humGain.gain.value;
                this.humGain.gain.value += (targetGain - current) * delta * 1.0; // Faster response
            }
        } else {
            if (this.isHumming) this.stopHum();
        }
    }

    manageWhispers(delta, pFactor) {
        // WHISPERS: Synthesized spatial noise bursts
        // NONE at stable (< 0.2)
        if (pFactor < 0.2) return;

        // Timer initialization
        if (this.whisperTimer === undefined) this.whisperTimer = 0;
        this.whisperTimer -= delta;

        if (this.whisperTimer <= 0) {
            // Trigger Whisper!
            this.spawnWhisper(pFactor);

            // Reset Timer: 
            // Low Paranoia (0.2): Every 10-20s
            // High Paranoia (1.0): Every 2-5s
            const minTime = 2 + (1.0 - pFactor) * 8;
            const maxTime = 5 + (1.0 - pFactor) * 15;
            this.whisperTimer = minTime + Math.random() * (maxTime - minTime);
        }
    }

    spawnWhisper(pFactor) {
        // Create Noise Source (Pink Noise for "breathy" sound)
        if (!this.noiseBuffer) this.createNoiseBuffer();

        const source = this.ctx.createBufferSource();
        source.buffer = this.noiseBuffer;

        // Envelope (Attack/Release)
        const gainNode = this.ctx.createGain();
        gainNode.gain.value = 0;

        // Spatial Panner
        // Random position around player
        const panner = this.ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'linear';

        const angle = Math.random() * Math.PI * 2;
        const dist = 2 + Math.random() * 3; // Close (2m to 5m)
        panner.positionX.value = Math.sin(angle) * dist;
        panner.positionY.value = (Math.random() - 0.5) * 1; // Eye level variation
        panner.positionZ.value = Math.cos(angle) * dist;

        // Connect
        source.connect(gainNode);
        gainNode.connect(panner);
        panner.connect(this.masterGain);

        // Play
        const now = this.ctx.currentTime;
        const duration = 0.5 + Math.random() * 1.0; // Short burst

        source.start(now);
        source.stop(now + duration + 0.5); // Cleanup

        // Volume Envelope
        const vol = 0.1 + (pFactor * 0.3); // Louder with paranoia
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(vol, now + duration * 0.2); // Attack
        gainNode.gain.linearRampToValueAtTime(0, now + duration); // Release

        // Pitch Shift (Detune) for variety
        source.detune.value = (Math.random() - 0.5) * 1200; // +/- 1 octave
    }

    createNoiseBuffer() {
        // 2 Seconds of Pink Noise
        const bufferSize = this.ctx.sampleRate * 2;
        this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);

        // Pink Noise Generator
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
            data[i] *= 0.11; // Normalize roughly
            b6 = white * 0.115926;
        }
    }

    startHum() {
        this.isHumming = true;

        this.humOsc = this.ctx.createOscillator();
        this.humOsc.type = 'sine'; // LowSine
        this.humOsc.frequency.value = 55; // Slightly lower A1

        // Add a second osc for beat/dissonance
        this.humOsc2 = this.ctx.createOscillator();
        this.humOsc2.type = 'triangle';
        this.humOsc2.frequency.value = 58; // Dissonant beating (~3Hz)

        this.humGain = this.ctx.createGain();
        this.humGain.gain.value = 0; // Controlled by update loop

        this.humOsc.connect(this.humGain);
        this.humOsc2.connect(this.humGain);
        this.humGain.connect(this.masterGain);

        this.humOsc.start();
        this.humOsc2.start();
    }

    stopHum() {
        this.isHumming = false;

        if (this.humGain) {
            // Quick fade out
            this.humGain.gain.cancelScheduledValues(this.ctx.currentTime);
            this.humGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 2.0);

            const oldOsc = this.humOsc;
            const oldOsc2 = this.humOsc2;
            const oldGain = this.humGain;

            setTimeout(() => {
                if (oldOsc) oldOsc.stop();
                if (oldOsc2) oldOsc2.stop();
                if (oldGain) oldGain.disconnect();
            }, 2100);

            this.humOsc = null;
            this.humOsc2 = null;
            this.humGain = null;
        }
    }

    manageHeartbeat(delta, pFactor) {
        // [CONTINUOUS RHYTHM]
        // We update the timer regardless of paranoia so the heartbeat
        // stays "on grid" and doesn't stutter when pFactor fluctuates.

        // Initialize Timer
        if (!this.heartbeatTimer) this.heartbeatTimer = 0;
        this.heartbeatTimer -= delta;

        // Calculate Rate (BPM) based on pFactor
        // Clamp pFactor for rate calculation to avoid extreme slow/fast
        const rateP = Math.max(0.05, Math.min(1.0, pFactor));

        // 0.05 -> 50 BPM (1.2s)
        // 1.00 -> 150 BPM (0.4s)
        const minPulse = 0.4;
        const maxPulse = 1.2;
        const interval = maxPulse - (rateP * (maxPulse - minPulse));

        if (this.heartbeatTimer <= 0) {
            // Only play audibly if paranoia is high enough
            if (pFactor > 0.05) {
                this.playHeartbeat(pFactor);
            }
            // Reset timer (Loop)
            this.heartbeatTimer += interval;
        }
    }

    playHeartbeat(pFactor) {
        // "Thump-Thump"
        const time = this.ctx.currentTime;

        // Volume: Base 0.2 (Audible) -> Max 0.8 (Not distinctively loud)
        // User reported not noticing it, likely due to low pitch/volume mixing.
        const volume = 0.2 + (pFactor * 0.6);

        // Beat 1 (Systole)
        this.triggerBeatImpulse(time, volume);
        // Beat 2 (Diastole) - delayed by 150ms
        this.triggerBeatImpulse(time + 0.15, volume * 0.7);
    }

    triggerBeatImpulse(startTime, vol) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle'; // Muffled thud
        // Higher pitch for better audibility on small speakers
        osc.frequency.setValueAtTime(100, startTime);
        osc.frequency.exponentialRampToValueAtTime(50, startTime + 0.1); // Pitch Drop

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(vol * 0.8, startTime + 0.02); // Attack
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2); // Decay

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(startTime);
        osc.stop(startTime + 0.25);
    }
}
