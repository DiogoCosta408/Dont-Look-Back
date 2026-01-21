import { AmbientManager } from './audio_modules/AmbientManager.js';
import { PsychManager } from './audio_modules/PsychManager.js';
import { EventManager } from './audio_modules/EventManager.js';
import { IntroAudioManager } from './audio_modules/IntroAudioManager.js';

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

        // Sub-Managers
        this.ambient = new AmbientManager(this.ctx, this.masterGain);
        this.psych = new PsychManager(this.ctx, this.masterGain);
        this.eventAudio = new EventManager(this.ctx, this.masterGain);
        this.introAudio = new IntroAudioManager(this.ctx, this.masterGain);
    }

    initialize(bgMusicElement) {
        if (this.initialized) return;

        // Connect BG Music to Ambient Manager's Pressure Filter
        try {
            const track = this.ctx.createMediaElementSource(bgMusicElement);
            track.connect(this.ambient.getMusicInputNode());
            this.initialized = true;
            console.log("AudioSystem: Wired to BG Music");

            // Load All Assets
            this.loadAllAssets();

        } catch (e) {
            console.warn("AudioSystem: Failed to hook BG music", e);
        }
    }

    async loadAllAssets() {
        // Parallel loading ok
        this.psych.loadAssets();
        this.eventAudio.loadAssets();
        this.introAudio.loadAssets();
    }

    // --- FACADE METHODS ---

    resume() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // Intro methods
    startClock() { this.introAudio.startClock(); }
    stopClock() { this.introAudio.stopClock(); }

    stopAll() {
        // Silence Everything except Intro (Clock)
        if (this.ambient.silence) this.ambient.silence();
        if (this.psych.silence) this.psych.silence();
        if (this.eventAudio.silence) this.eventAudio.silence();
    }

    muteMaster() {
        if (this.masterGain) {
            this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
            this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
        }
    }

    reset() {
        if (this.ambient.reset) this.ambient.reset();
        if (this.psych.reset) this.psych.reset();
    }

    // Properties accessed by Main
    get isClockPlaying() { return this.introAudio.isClockPlaying; }
    get clockBuffer() { return this.introAudio.clockBuffer; }

    // Event One-shots (Facade)
    playSpook() {
        this.eventAudio.playSpook();
    }

    spawnWhisper(pFactor) {
        this.psych.spawnWhisper(pFactor);
    }

    // --- COORDINATION ---
    // Methods for Sub-Managers to request global state changes

    fadeBgMusic(targetVol, speed) {
        // In AmbientManager, the pressure filter controls the output of the BG music channel.
        // We can lower the pressureFilter gain.
        // AmbientManager logic:
        if (this.ambient.pressureFilter) {
            const current = this.ambient.pressureFilter.gain.value;
            // Immediate set or linear ramp?
            // Since we are in an update loop (usually), we can just set, but targetAtTime is smoother
            // for async events.
            this.ambient.pressureFilter.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 1.0 / speed);
        }
    }

    restoreBgMusic(speed) {
        // Restore to 1.0 (assuming normal volume)
        if (this.ambient.pressureFilter) {
            this.ambient.pressureFilter.gain.setTargetAtTime(1.0, this.ctx.currentTime, 1.0 / speed);
        }
    }

    // --- MAIN UPDATE ---

    update(delta, metrics, pFactor) {
        if (!this.initialized) return;

        // 1. Ambient (Filters, Hum)
        this.ambient.update(delta, metrics, pFactor);

        // 2. Psychological (Heartbeat, Whispers, Footsteps)
        this.psych.update(delta, metrics, pFactor);

        // 3. Events (Violin, Tinnitus)
        // Pass 'this' as parentManager to allow callback for BG fade
        this.eventAudio.update(delta, metrics, this);
    }
}
