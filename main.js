import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { Player } from './player.js';
import { FacilityGenerator } from './environment.js';
import { FacilitySystem } from './facility_system.js';
import { AudioSystem } from './audio_system.js';
import { EndingTracker } from './system_modules/EndingTracker.js';
import { DebugHUD } from './system_modules/DebugHUD.js';

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

        this.renderer.domElement.style.zIndex = '0';
        this.container.appendChild(this.renderer.domElement);

        // [POST-PROCESSING]
        this.composer = new EffectComposer(this.renderer);

        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        this.afterimagePass = new AfterimagePass();
        this.afterimagePass.uniforms['damp'].value = 0.24; // Base Blur (Intermediate)
        this.composer.addPass(this.afterimagePass);

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

        // [ENDING TRACKER]
        this.endingTracker = new EndingTracker();

        // FIX: If we load with a "True Ending" history (3 items), it means the player reloaded manualy mid-ending.
        // We should clear it to allow a new game to start.
        if (this.endingTracker.hasTrueEndingReached()) {
            console.warn("MAIN: Detected stale True Ending state. Clearing history.");
            this.endingTracker.clear();
        }

        // Inject Audio into Generator (for Drown Ending)
        this.generator.setAudio(this.bgMusic);

        // [EVENTS]
        window.addEventListener('resize', this.onWindowResize.bind(this));
        document.addEventListener('keydown', (e) => this.player.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.player.onKeyUp(e));

        // RESET EVENT (Endgame Loop)
        // RESET EVENT (Endgame Loop)
        window.addEventListener('reset-simulation', () => {
            if (this.trueEndingActive) return; // Block resets if True Ending
            console.log("MAIN: Resetting Simulation...");
            window.location.reload();
        });

        // ENDING TRIGGER EVENT
        window.addEventListener('ending-triggered', (e) => {
            if (this.trueEndingActive) return;
            this.handleEnding(e.detail.type);
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

        // Debug overlay: paranoia, visual/SFX state, frame timing (F3 to show)
        this.debug = new DebugHUD();

        this.startIntro();
        this.animate();
    }

    startIntro() {
        console.log("MAIN: Zone -> INTRO");
        this.currentZone = 'INTRO';
        this.generator.createIntroRoom();
        this.player.controls.getObject().position.set(0, 1.6, 5);
        if (this.audioSystem.startClock) this.audioSystem.startClock();

        // [ENDING HISTROY CHECK]
        this.checkConsecutiveEndings();
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
        if (this.composer) {
            this.composer.setSize(window.innerWidth, window.innerHeight);
        }
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
            // VARIANT 3 (2+) SILENCE CHECK
            const isSilentVariant = this.generator.intro.clockVariant >= 2;

            if (!isSilentVariant && this.audioSystem.clockBuffer && !this.audioSystem.isClockPlaying) {
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

                // FORCE SILENCE (Double Check)
                if (this.generator.mirage && this.generator.mirage.clockVariant >= 2) {
                    if (this.audioSystem.isClockPlaying) this.audioSystem.stopClock();
                }
            }
            this.system.updateClock(delta);

            // EASTER EGG: The Backrooms Loop (Darkness)
            // If player wanders far into darkness, they find a loop.
            const pZ = this.player.controls.getObject().position.z;

            // 1. Spawn Mirage if getting close (Spawn at 70)
            // Trigger early (Z > 5.0) so it's visible from far away
            // 1. Dynamic Mirage Spawn (User Request)
            // "spawns a large distance based if the player runs back for more than 5 seconds"
            // "same absolute distance as it is set for the intro-mirage distance" (100)

            this.runBackTimer = this.runBackTimer || 0;

            // Fix: Use World Z Delta to detect "Running Back" (Moving in +Z)
            // This works even if the player turns around (Look Back) and presses W.
            const currentZ = this.player.controls.getObject().position.z;

            if (this.lastPlayerZ !== undefined) {
                // Calculate World Velocity
                const zDist = currentZ - this.lastPlayerZ;
                const worldVelZ = zDist / delta;

                // Check if moving +Z (Back towards start) significantly
                if (worldVelZ > 2.0) { // Threshold 2.0 (Run speed is ~4.0)
                    this.runBackTimer += delta;
                } else {
                    this.runBackTimer = 0;
                }
            }
            this.lastPlayerZ = currentZ;

            if (this.runBackTimer > 5.0) {
                if (!this.generator.mirage.roomGroup) {
                    this.mirageSpawnZ = pZ + 100;

                    // Count 'BACK' endings in current history
                    const history = this.endingTracker ? this.endingTracker.history : [];
                    const backCount = history.filter(h => h === 'BACK').length;

                    this.generator.createMirageRoom(this.mirageSpawnZ, backCount);
                    // Reset timer to allow it to "settle" or prevent spam? 
                    // createMirageRoom checks if roomGroup exists, so it's safe.
                }
            }

            // 2. Loop Logic
            if (this.generator.mirage.roomGroup) {
                // Determine Entry Threshold dynamically
                // If mirageSpawnZ is set, use it. Default to 100 if somehow missing (legacy fallback).
                const targetZ = this.mirageSpawnZ || 100;
                const entryThreshold = targetZ - 1.5; // Door is at Z - 2 roughly

                // ENTERING (Pass Threshold)
                if (pZ > entryThreshold && !this.insideMirage) {
                    this.insideMirage = true;
                    console.log("MAIN: Entered Mirage. ClockVariant:", this.generator.mirage ? this.generator.mirage.clockVariant : 'N/A');

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

                    // SILENCE CHECK FOR VARIANT 3 (2+)
                    const isSilent = this.generator.mirage && this.generator.mirage.clockVariant >= 2;

                    if (isSilent) {
                        if (this.audioSystem.stopClock) this.audioSystem.stopClock();
                    } else {
                        if (this.audioSystem.startClock) this.audioSystem.startClock();
                    }

                    // DEBUG: Trace rotation for next 120 frames
                    this.debugRotationLog = 120;

                    console.log("MAIN: Entered Loop Room (Sanctuary)");

                    // HIDDEN MESSAGE: "BACK"
                    const msg = document.getElementById('death-message');
                    if (msg) {
                        msg.innerText = "BACK";
                        msg.classList.add('active');
                        setTimeout(() => msg.classList.remove('active'), 3000);
                    }
                }

                // LEAVING (Teleport -> Seamless Shift)
                const exitThreshold = (this.mirageSpawnZ || 100) - 3.0; // 97.0 relative to 100

                if (this.insideMirage && pZ < exitThreshold) {
                    console.log("MAIN: Loop Seamless Transition");

                    // 1. Calculate Shift
                    // New Center = 4. Old Center = mirageSpawnZ.
                    const currentCenter = this.mirageSpawnZ || 100;
                    const deltaZ = 4.0 - currentCenter;

                    this.player.controls.getObject().position.z += deltaZ;
                    this.generator.mirage.roomGroup.position.z += deltaZ;

                    // Clear dynamic spawn Z so next time it recalculates
                    this.mirageSpawnZ = null;
                    this.runBackTimer = 0; // Ensure timer is clean

                    // 2. Promote -> CHECK ENDING "BACK"

                    // Trigger "BACK" Ending Logic
                    // We must check this BEFORE resetting, because if True Ending triggers, we stop everything.
                    if (this.handleEnding('BACK')) {
                        return; // Stop the loop logic if True Ending triggered
                    }

                    this.generator.promoteMirageToIntro();
                    this.insideMirage = false;

                    // 3. Reset System State
                    this.system.reset();
                    this.currentZone = 'INTRO';
                    this.checkConsecutiveEndings();

                    // 4. Generate World Behind Door
                    // clearAll (not a raw scene.remove loop) so pooled lamps go back
                    // to the pool instead of being left lit in empty space.
                    this.generator.corridor.clearAll();
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

        let mirageZ = null;
        if (this.insideMirage) {
            mirageZ = this.mirageSpawnZ || 100;
        }

        this.player.update(
            delta,
            this.generator.interactables,
            this.generator.pillarPositions,
            pFactor,
            this.generator.isEndgame,
            bhPos,
            this.generator.corridorEndZ,
            (this.currentZone === 'INTRO'), // Pass isIntro flag
            mirageZ // Pass mirageZ
        );

        // --- GAME LOOP ---
        // Global updates (Logic handled by Facade/System internally)
        const genStart = performance.now();
        this.generator.update(this.player.controls.getObject().position.z, delta);
        if (this.debug) this.debug.noteGeneration(performance.now() - genStart);

        // Single Audio Update
        if (!this.generator.drownManager || !this.generator.drownManager.active) {
            this.audioSystem.update(delta, this.player.metrics, pFactor);
        }

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

        // [MOTION BLUR LOGIC]
        if (this.afterimagePass) {
            let targetDamp = 0.24 + (pFactor * 0.36); // Intermediate: 0.24 -> 0.60

            // Random High Intensity Bursts (Trauma)
            if (pFactor > 0.8) {
                // If not currently bursting, tiny chance to start
                if (!this.blurBurstActive) {
                    if (Math.random() < 0.005) { // 0.5% chance per frame (~once every 3-4s @ 60fps)
                        this.blurBurstActive = true;
                        this.blurBurstTimer = 0;
                        this.blurBurstDuration = 0.2 + Math.random() * 0.4; // 0.2s - 0.6s
                    }
                }
            }

            if (this.blurBurstActive) {
                this.blurBurstTimer += delta;
                targetDamp = 0.94; // Extreme Spike (User Req: Much Higher)
                if (this.blurBurstTimer > this.blurBurstDuration) {
                    this.blurBurstActive = false;
                }
            }

            // Smooth Interpolation towards target (avoid instant accumulation snaps)
            // But Afterimage is temporal, so changing 'damp' instantly is fine.
            // Lerp for smoother feel?
            const currentDamp = this.afterimagePass.uniforms['damp'].value;
            this.afterimagePass.uniforms['damp'].value += (targetDamp - currentDamp) * delta * 5.0;
        }

        // this.renderer.render(this.scene, this.camera);
        this.composer.render();

        if (this.debug) this.debug.endFrame(this);
    }


    handleEnding(type) {
        if (this.trueEndingActive) return true;

        console.log(`MAIN: Handling Ending -> ${type}`);
        this.endingTracker.addEnding(type);
        console.log(`MAIN: Current History:`, this.endingTracker.history);

        if (this.endingTracker.hasTrueEndingReached()) {
            const quote = this.endingTracker.getTrueEndingQuote();
            this.showTrueEnding(quote);
            return true; // Signal that we intercepted the ending
        }

        // If not true ending, allow normal flow (or force reload if it came from event)
        // If 'BACK' (Mirage), we return false to let the loop continue naturally.
        if (type === 'BACK') return false;

        // If 'DON'T' (Void) or 'LOOK' (Drown), we must reload now because we stopped their default reload.
        console.log("MAIN: Standard Ending - Reloading...");

        // FLAG: Allow history to persist for this specific reload (Chain)
        sessionStorage.setItem('allow_ending_persistence', 'true');

        setTimeout(() => window.location.reload(), 1000);
        return false;
    }

    showTrueEnding(quoteData) {
        console.log("MAIN: *** TRUE ENDING TRIGGERED ***");
        this.trueEndingActive = true;

        // 1. Stop Game Loop / Audio
        // We don't stop the loop (animate), but we stop logic updates.
        // Actually, let's freeze everything.

        // Stop Audio
        if (this.audioSystem) {
            this.audioSystem.stopAll();
            this.audioSystem.muteMaster(); // Absolute Silence (User Request)
        }
        if (this.bgMusic) {
            this.bgMusic.pause();
            this.bgMusic.volume = 0;
        }

        // 2. Black Screen
        const overlay = document.getElementById('fade-overlay'); // Ensure this ID exists or create it
        if (!overlay) {
            // Create if missing
            const div = document.createElement('div');
            div.id = 'fade-overlay';
            div.style.position = 'fixed';
            div.style.top = '0';
            div.style.left = '0';
            div.style.width = '100%';
            div.style.height = '100%';
            div.style.backgroundColor = 'black';
            div.style.opacity = '0';
            div.style.zIndex = '9999';
            div.style.transition = 'opacity 5s ease-in';
            document.body.appendChild(div);
        }

        // Force style if it exists but wasn't ready
        const finalOverlay = document.getElementById('fade-overlay');
        finalOverlay.style.transition = 'opacity 5s ease-in';
        finalOverlay.style.opacity = '1';
        finalOverlay.style.zIndex = '9999'; // On top of everything
        finalOverlay.style.pointerEvents = 'all'; // Block clicks

        // 3. Show Quote
        setTimeout(() => {
            // A. Combination Header
            const comboContainer = document.createElement('div');
            comboContainer.style.position = 'fixed';
            comboContainer.style.top = '20%';
            comboContainer.style.width = '100%';
            comboContainer.style.textAlign = 'center';
            comboContainer.style.color = '#666666';
            comboContainer.style.fontFamily = "'Courier New', Courier, monospace";
            comboContainer.style.zIndex = '10000';
            comboContainer.style.opacity = '0';
            comboContainer.style.transition = 'opacity 3s ease-in';
            comboContainer.style.pointerEvents = 'none';

            // Get last 3 endings
            const history = this.endingTracker.history.slice(-3);
            const comboText = document.createElement('h2');
            comboText.innerText = history.join("   ").toUpperCase();
            comboText.style.fontSize = '12px';
            comboText.style.letterSpacing = '6px';
            comboText.style.fontWeight = 'bold';

            comboContainer.appendChild(comboText);
            document.body.appendChild(comboContainer);

            // B. Main Quote
            const container = document.createElement('div');
            container.style.position = 'fixed';
            container.style.top = '50%';
            container.style.left = '50%';
            container.style.transform = 'translate(-50%, -50%)';
            container.style.textAlign = 'center';
            container.style.color = '#eeeeee';
            container.style.fontFamily = "'Courier New', Courier, monospace";
            container.style.zIndex = '10000';
            container.style.opacity = '0';
            container.style.transition = 'opacity 3s ease-in';
            container.style.width = '80%';

            const qText = document.createElement('h1');
            qText.innerText = quoteData.text;
            qText.style.fontSize = '24px';
            qText.style.fontWeight = '300';
            qText.style.marginBottom = '20px';
            qText.style.lineHeight = '1.5';
            qText.style.letterSpacing = '1px';

            const qAuthor = document.createElement('p');
            qAuthor.innerText = `- ${quoteData.author}`;
            qAuthor.style.fontSize = '18px';
            qAuthor.style.color = '#888888';
            qAuthor.style.fontStyle = 'italic';

            container.appendChild(qText);
            container.appendChild(qAuthor);
            document.body.appendChild(container);

            // Fade In Quote & Header
            requestAnimationFrame(() => {
                container.style.opacity = '1';
                comboContainer.style.opacity = '1';

                // Enable Click to Reset (after small delay to prevent accidental double-clicks)
                setTimeout(() => {
                    const resetHandler = () => {
                        console.log("MAIN: User clicked - Clearing History & Resetting");
                        this.endingTracker.clear();
                        window.location.reload();
                    };
                    document.addEventListener('click', resetHandler, { once: true });
                    // Also allow keypress (Space/Enter)
                    document.addEventListener('keydown', resetHandler, { once: true });
                }, 1000);
            });

        }, 5500); // Appear after screen is fully black
    }
    checkConsecutiveEndings() {
        if (this.endingTracker && this.endingTracker.history.length >= 2) {
            const h = this.endingTracker.history;
            const last = h[h.length - 1];
            const prev = h[h.length - 2];

            if (last === prev) {
                setTimeout(() => {
                    const voiceOverlay = document.getElementById('voice-overlay');
                    if (voiceOverlay) {
                        const msg = document.createElement('div');
                        msg.innerText = "SAME ACTIONS WILL BRING THE SAME END";
                        msg.classList.add('voice-entry');
                        msg.style.color = '#ffb000'; // Yellow (CRT Color)
                        voiceOverlay.appendChild(msg);

                        setTimeout(() => {
                            if (msg.parentNode) msg.parentNode.removeChild(msg);
                        }, 4000);
                    }
                }, 1500);
            }
        }
    }
}
new GameClient();