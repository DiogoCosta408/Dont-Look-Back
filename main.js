import * as THREE from 'three';
import { Player } from './player.js?v=void_physics_v3';
import { FacilityGenerator } from './environment.js?v=endgame_vis_v4';
import { FacilitySystem } from './facility_system.js?v=ev_reset_v2';
import { AudioSystem } from './audio_system.js?v=v1';

console.log("FACILITY_OS: CORE SYSTEM INITIALIZED");

class GameClient {
    constructor() {
        this.container = document.body;
        this.clock = new THREE.Clock();

        // UI Elements
        this.ui = {
            log: document.getElementById('log-container'),
            neuro: document.getElementById('neuro-status'),
            bio: document.getElementById('bio-status')
        };

        this.init();



    }

    init() {
        // [SCENE SETUP]
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000); // PITCH BLACK
        this.scene.fog = new THREE.FogExp2(0x000000, 0.02); // Restore Fog

        // [CAMERA SETUP]
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.camera.position.set(0, 1.7, 0); // Eye level

        // [RENDERER SETUP]
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.zIndex = '0';
        this.container.appendChild(this.renderer.domElement);

        // [LIGHTING]
        const ambientLight = new THREE.AmbientLight(0x111111, 0.5); // Low ambient
        this.scene.add(ambientLight);

        // [WORLD GEN]
        this.generator = new FacilityGenerator(this.scene, this.camera);

        // [PLAYER]
        this.player = new Player(this.camera, document.body);

        // [UI SETUP]
        this.ui = {
            log: document.getElementById('log-container'),
            neuro: document.getElementById('neuro-status'), // FIXED: Matches HTML ID
            status: document.getElementById('status-bar')
        };

        // [SYSTEM]
        this.system = new FacilitySystem(this.player, this.generator, this.ui);

        // [BACKGROUND MUSIC]
        this.bgMusic = new Audio('audio/The Carpathians.mp3');
        this.bgMusic.loop = true;
        this.bgMusic.volume = 0;
        this.musicStarted = false;
        this.targetVolume = 0.25;

        // [PSYCHOLOGICAL AUDIO SYSTEM]
        this.audioSystem = new AudioSystem(this.camera);

        // [EVENTS]
        window.addEventListener('resize', this.onWindowResize.bind(this));
        document.addEventListener('keydown', (e) => this.player.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.player.onKeyUp(e));

        // INTERACTION (Click)
        document.addEventListener('mousedown', (e) => {
            // Deprecated: Walk-through logic used now.
            // Kept for potential future interaction.
        });

        // RESET EVENT (Endgame Loop)
        window.addEventListener('reset-simulation', () => {
            // "Game starts over right in the beginning"
            // Simplest way to ensure clean state: Reload
            console.log("MAIN: Resetting Simulation...");
            window.location.reload();
        });

        // [AUDIO PRE-START]
        // Browser Policy: Audio must start on user interaction.
        // We start it here (muted) so we can fade it in cleanly later without permission errors.
        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement) {
                // Unlock AudioContext but don't start music yet
                this.audioSystem.resume();
                if (!this.musicStarted) {
                    this.musicStarted = true; // Mark as initialized
                    this.audioSystem.initialize(this.bgMusic);
                    console.log("MAIN: Audio Context Unlocked - Music Ready");
                }
            }
        });

        this.clock = new THREE.Clock();
        this.currentZone = 'INTRO'; // 'INTRO' | 'CORRIDOR'
        this.startIntro();
        this.animate();
    }

    startIntro() {
        console.log("MAIN: Zone -> INTRO");
        this.currentZone = 'INTRO';
        this.generator.createIntroRoom();
        this.player.controls.getObject().position.set(0, 1.6, 5);
        // Try to start immediately (if cached)
        if (this.audioSystem.startClock) this.audioSystem.startClock();
    }

    enterCorridor() {
        if (this.currentZone === 'CORRIDOR') return; // Debounce

        console.log("MAIN: Zone -> CORRIDOR");
        this.currentZone = 'CORRIDOR';

        // STOP CLOCK
        if (this.audioSystem.stopClock) this.audioSystem.stopClock();

        this.generator.destroyIntroRoom();

        // 1. Generate Corridor
        this.generator.createInitialCorridor();

        // 2. Destroy Intro Room (Delayed cleanup possible, keeping for now)
        // this.generator.destroyIntroRoom(); 

        // 3. Start & Fade In Music (From Beginning)
        if (this.musicStarted) {
            this.bgMusic.currentTime = 0;
            this.bgMusic.volume = 0;
            this.bgMusic.play().catch(e => console.warn("Music play blocked", e));
            this.fadeInMusic();
        }

        // 4. Initial Paranoia
        this.system.paranoia = 0;
    }

    // checkIntroInteraction Removed (Walk-through)

    triggerJumpscare() {
        if (this.jumpscareActive) return;
        this.jumpscareActive = true;
        console.log("MAIN: EASTER EGG TRIGGERED");

        // 1. Audio
        this.audioSystem.playSpook();

        // 2. Visuals
        const overlay = document.getElementById('jumpscare-overlay');
        const img = document.getElementById('jumpscare-img');

        if (overlay && img) {
            overlay.style.display = 'flex';
            // Force reflow
            void overlay.offsetWidth;
            img.style.transform = 'scale(1.0)'; // Zoom In to face
        }

        // 3. Reset
        setTimeout(() => {
            window.location.reload();
        }, 3000);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    fadeInMusic() {
        console.log("MAIN: Fading in Music...");
        const fadeDuration = 3000;
        const fadeSteps = 30;
        const stepTime = fadeDuration / fadeSteps;
        const volumeStep = this.targetVolume / fadeSteps;
        let currentStep = 0;

        const fadeInterval = setInterval(() => {
            currentStep++;
            // Check if user paused or something? No, just fade.
            if (this.bgMusic) {
                this.bgMusic.volume = Math.min(volumeStep * currentStep, this.targetVolume);
            }
            if (currentStep >= fadeSteps) {
                clearInterval(fadeInterval);
            }
        }, stepTime);
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));

        const delta = this.clock.getDelta();
        const time = this.clock.getElapsedTime();

        /* ===============================
        ZONE LOGIC & UPDATES
        ================================ */
        let pFactor = 0;

        if (this.currentZone === 'INTRO') {
            // [ZONE: INTRO]
            // Retry starting clock if loaded but not playing (e.g., loaded after start)
            if (this.audioSystem.clockBuffer && !this.audioSystem.isClockPlaying) {
                this.audioSystem.startClock();
            }

            // Safe, Silent, Static
            this.generator.updateIntroTick(delta);
            pFactor = 0.0;

            // Trigger: Walk Out (Z < 1.0)
            if (this.player.controls.getObject().position.z < 1.0) {
                this.enterCorridor();
            }

            // EASTER EGG: Out of Bounds Jumpscare (Z > 12) REMOVED - Moved to VOID logic

        } else if (this.currentZone === 'CORRIDOR') {
            // [ZONE: CORRIDOR]
            // Horror, Infinite, Audio
            pFactor = this.system.getParanoiaFactor();
            this.system.update(time, delta);
            this.system.updateClock(delta);
            this.generator.update(this.player.controls.getObject().position.z, delta);

            // EASTER EGG: Back into the Nothingness (Z > 25)
            // If player exits intro, turns around, and walks into the void where intro was
            if (this.player.controls.getObject().position.z > 25.0) {
                this.triggerJumpscare();
            }
        }

        // Pass State to Player (Collisions, Effects)
        const bhPos = this.generator.blackHole ? this.generator.blackHole.position : null;
        this.player.update(
            delta,
            this.generator.interactables,
            this.generator.pillarPositions,
            pFactor,
            this.generator.isEndgame,
            bhPos,
            this.generator.corridorEndZ,
            (this.currentZone === 'INTRO') // Pass isIntro flag
        );

        // Audio System Update
        if (this.currentZone === 'INTRO') {
            this.audioSystem.update(delta, this.player.metrics, 0);
        } else {
            this.audioSystem.update(delta, this.player.metrics, pFactor);

            if (this.system.shouldTriggerWhisper) {
                this.audioSystem.spawnWhisper(pFactor);
                this.system.shouldTriggerWhisper = false;
            }
        }

        this.system.updateClock(delta);

        if (this.currentZone === 'INTRO' && this.audioSystem.clockBuffer && !this.audioSystem.isClockPlaying) {
            // Ensure clock starts once loaded/unlocked
            if (this.audioSystem.ctx && this.audioSystem.ctx.state === 'running') {
                this.audioSystem.startClock();
            }
        }

        // --- GAME LOOP ---
        this.generator.update(this.player.controls.getObject().position.z, delta);

        this.generator.updateLights(delta);
        this.audioSystem.update(delta, this.player.metrics, pFactor);

        // Legacy atmosphere removed (handled in Player.js/FacilitySystem.js)

        // Light instability (DELEGATED TO FACILITY SYSTEM)
        // Removed to allow event-driven control

        /* ===============================
        RARE CLOCK DESYNC (every 10s)
        ================================ */

        if (this._clockDesyncTimer === undefined) {
            this._clockDesyncTimer = 0;
        }

        this._clockDesyncTimer += delta;

        if (this._clockDesyncTimer >= 10) {
            this._clockDesyncTimer = 0;
            this.clock.elapsedTime -= 0.03;
        }

        /* ===============================
        CAMERA INVERSION (DELEGATED TO SYSTEM)
        ================================ */
        // Logic moved to FacilitySystem.handleRandomEvents

        this.renderer.render(this.scene, this.camera);
    }
}

new GameClient();