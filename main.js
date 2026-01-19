import * as THREE from 'three';
import { Player } from './player.js';
import { FacilityGenerator } from './environment.js';
import { FacilitySystem } from './facility_system.js';
import { AudioSystem } from './audio_system.js';

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
        this.scene.fog = new THREE.FogExp2(0x000000, 0.015); // Reduced Fog for visibility

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
            neuro: document.getElementById('neuro-status'),
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
        this.system.audio = this.audioSystem;

        // Inject Audio into Generator (for Drown Ending)
        this.generator.setAudio(this.bgMusic);

        // [EVENTS]
        window.addEventListener('resize', this.onWindowResize.bind(this));
        document.addEventListener('keydown', (e) => this.player.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.player.onKeyUp(e));

        // RESET EVENT (Endgame Loop)
        window.addEventListener('reset-simulation', () => {
            console.log("MAIN: Resetting Simulation...");
            window.location.reload();
        });

        // [AUDIO PRE-START]
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
        this.insideMirage = false; // Initialize explicitly

        // CRITICAL: Add Controls to Scene to ensure World Matrix updates correctly
        this.scene.add(this.player.controls.getObject());

        this.startIntro();
        this.animate();
    }

    startIntro() {
        console.log("MAIN: Zone -> INTRO");
        this.currentZone = 'INTRO';
        this.generator.createIntroRoom();
        this.player.controls.getObject().position.set(0, 1.6, 5);
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

        // 3. Start & Fade In Music (From Beginning)
        if (this.musicStarted) {
            this.bgMusic.currentTime = 0;
            this.bgMusic.volume = 0;
            this.bgMusic.play().catch(e => console.warn("Music play blocked", e));
            this.fadeInMusic();
        }

        // 4. Initial Paranoia
        this.system.paranoiaLevel = 0;
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

        // NUCLEAR FIX: Enforce Up Vector Every Frame
        this.camera.up.set(0, 1, 0);



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

            pFactor = 0.0;

            // Trigger: Walk Out (Z < 1.0)
            if (this.player.controls.getObject().position.z < 1.0) {
                this.enterCorridor();
            }

        } else if (this.currentZone === 'CORRIDOR') {
            // [ZONE: CORRIDOR]
            // Horror, Infinite, Audio
            pFactor = this.system.getParanoiaFactor();

            // FREEZE SYSTEM UPDATE if in Sanctuary (Mirage Room)
            // This prevents Paranoia gain and Events while inside.
            if (!this.insideMirage) {
                this.system.update(time, delta);
            } else {
                // FORCE SANCTUARY STATE (Every Frame)
                pFactor = 0.0;
                this.system.cameraInversion.active = false;
                this.player.cameraController.reset();
            }
            this.system.updateClock(delta);

            // EASTER EGG: The Backrooms Loop (Darkness)
            // If player wanders far into darkness, they find a loop.
            const pZ = this.player.controls.getObject().position.z;

            // 1. Spawn Mirage if getting close (Spawn at 70)
            // Trigger early (Z > 5.0) so it's visible from far away
            // 1. Spawn Mirage if getting close (Spawn at 100)
            // Trigger early (Z > 5.0) so it's visible from far away
            if (pZ > 5.0) {
                if (!this.generator.mirage.roomGroup) {
                    this.generator.createMirageRoom(100);
                }
            }

            // 2. Loop Logic
            if (this.generator.mirage.roomGroup) {
                // Room at 100. Door at 100 + (-2) = 98.

                // ENTERING (Pass Threshold)
                if (pZ > 98.5 && !this.insideMirage) {
                    this.insideMirage = true;

                    // RESET STATE ON ENTRY (Sanctuary)

                    // 1. Soft Reset (No full reset to avoid camera flips)
                    this.system.paranoiaLevel = 0;
                    this.system.cameraInversion.active = false;
                    this.system.blackout.active = false;
                    this.system.updateStatus("STABLE", "status-ok");

                    // 2. Force Immediate Calm (for Player/Camera update this frame)
                    pFactor = 0.0;

                    // 3. Absolute Camera Correction
                    this.system.cameraInversion.active = false;
                    this.player.camera.rotation.z = 0;

                    // We REMOVE the aggressive camera.up reset per user request/suspicion.
                    // But we keep the controller reset to ensure no FOV surge lingers.
                    this.player.cameraController.reset();

                    console.log(`MAIN: SANCTUARY ENTRY - Soft Reset Applied.`);

                    // Manual Audio Silence
                    this.audioSystem.stopAll();
                    if (this.bgMusic) this.bgMusic.pause();

                    // Start Clocks
                    this.generator.startMirageClock();
                    if (this.audioSystem.startClock) this.audioSystem.startClock();

                    // DEBUG: Trace rotation for next 120 frames
                    this.debugRotationLog = 120;

                    console.log("MAIN: Entered Loop Room (Sanctuary)");
                }

                // LEAVING (Teleport -> Seamless Shift)
                if (this.insideMirage && pZ < 97.0) {
                    console.log("MAIN: Loop Seamless Transition");

                    // 1. Calculate Shift
                    // New Center = 4. Old Center = 100. Delta = 4 - 100 = -96.
                    const deltaZ = 4.0 - 100.0;

                    this.player.controls.getObject().position.z += deltaZ;
                    this.generator.mirage.roomGroup.position.z += deltaZ;

                    // 2. Promote
                    this.generator.promoteMirageToIntro();
                    this.insideMirage = false;

                    // 3. Reset System State
                    this.system.reset();
                    this.currentZone = 'INTRO';

                    // 4. Generate World Behind Door
                    this.generator.corridor.chunks.forEach(c => this.scene.remove(c));
                    this.generator.corridor.chunks = [];
                    this.generator.corridor.zOffset = 0;
                    this.generator.corridor.interactables = [];

                    this.generator.createInitialCorridor();

                    // 5. Reset Audio System (Prepare for fade in)
                    this.audioSystem.reset();
                    if (this.bgMusic) {
                        this.bgMusic.volume = 0;
                        this.bgMusic.currentTime = 0;
                        // Don't play yet, enterCorridor logic handles fade in when walking out?
                        // Yes, player is now at approx Z=1, walking out < 1 triggers enterCorridor.
                    }
                }
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

        // --- GAME LOOP ---
        // Global updates (Logic handled by Facade/System internally)
        this.generator.update(this.player.controls.getObject().position.z, delta);

        // Single Audio Update
        this.audioSystem.update(delta, this.player.metrics, pFactor);

        if (this.currentZone === 'CORRIDOR' && this.system.shouldTriggerWhisper) {
            this.audioSystem.spawnWhisper(pFactor);
            this.system.shouldTriggerWhisper = false;
        }

        if (this.currentZone === 'INTRO' && this.audioSystem.clockBuffer && !this.audioSystem.isClockPlaying) {
            // Ensure clock starts once loaded/unlocked
            if (this.audioSystem.ctx && this.audioSystem.ctx.state === 'running') {
                this.audioSystem.startClock();
            }
        }

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

        if (this.debugRotationLog > 0) {
            console.log(`Frame ${this.debugRotationLog}: CamZ=${this.camera.rotation.z.toFixed(4)} ParZ=${this.player.controls.getObject().rotation.z.toFixed(4)} P_Met_Stat=${this.player.metrics.isStationary}`);
            this.debugRotationLog--;
        }

        this.renderer.render(this.scene, this.camera);
    }
}

new GameClient();