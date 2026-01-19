export class FacilitySystem {
    constructor(player, environment, uiElements) {
        this.player = player;
        this.environment = environment;
        this.ui = uiElements;
        this.ui.voice = document.getElementById('voice-overlay'); // Direct access

        // State
        this.paranoiaLevel = 0; // 0-100 (Hidden Meter)
        this.maxParanoia = 100;

        this.lastMessageTime = 0;
        this.baseMessageCooldown = 15.0;

        this.lastTriggeredBehavior = null;

        // Event State
        this.cameraInversion = {
            active: false,
            timer: 0,
            duration: 0.5
        };

        // Blackout Event
        this.blackout = {
            active: false,
            timer: 0,
            duration: 5.0
        };

        // Timer Logic
        this.survivalTime = 0;
        this.clockEl = document.getElementById('clock');


        // Context-Aware Message Pools
        this.messagePools = {
            stationary: [
                "WHY HAVE YOU STOPPED?",
                "CONTINUE MOVING",
                "CAN YOU HEAR IT?",
                "YOU ARE BEING WATCHED"
            ],
            lookBack: [
                "THERE IS NOTHING BEHIND YOU",
                "LOOKING BACK IS UNNECESSARY",
                "WHY DO YOU KEEP CHECKING?",
                "DON'T LOOK BACK",
                "YOU SEEM NERVOUS"
            ],
            continuousMove: [
                "KEEP WALKING",
                "CONTINUE MOVING",
                "DO NOT STOP",
                "YOU ARE MAKING PROGRESS",
                "THE CORRIDOR CONTINUES"
            ],
            zoneReentry: [
                "THIS PLACE REMEMBERS YOU",
                "HAVE YOU BEEN HERE BEFORE?",
                "YOU CANNOT GO BACK"
            ],
            highParanoia: [
                "THEY KNOW YOU KNOW",
                "DONT TURN AROUND",
                "IT IS GETTING CLOSER",
                "RUN",
            ],
            contradiction: [
                "IT WAS A LIE",
                "THAT WAS FALSE",
            ],
            apathy: [
                "It's peaceful here...",
                "Why was I so afraid?",
                "I don't want to move anymore.",
                "Just let go...",
                "The silence is comforting.",
                "Drifting away..."
            ]
        };

        this.recentMessages = []; // Anti-repetition queue

        // Track Apathy Levels (0, 1, 2...)
        this.apathyLevel = 0;
        this.lastStationaryReset = 0;
        this.bellFlags = { level2: false, level3: false, finalWarning: false };
    }

    update(time, delta) {
        this.monitorParanoia(delta);
        const pFactor = this.getParanoiaFactor();

        // Drive Environmental Drift
        if (this.environment.setDriftIntensity) {
            // RESTRICTION: Only apply drift if paranoia > 50%
            let driftIntensity = 0;
            if (pFactor > 0.5) {
                // Map 0.5->1.0 to 0.0->1.0
                driftIntensity = (pFactor - 0.5) * 2.0;
            }
            this.environment.setDriftIntensity(driftIntensity);
        }

        this.checkMessaging(time, pFactor);
        this.handleRandomEvents(time, delta, pFactor);
        this.updateBreathing(delta);

        // DROWN ENDING CHECK
        // If stationary for > 60s and Low Paranoia (< 20%)
        if (this.player.metrics.stationaryTime > 60.0 && this.paranoiaLevel < 20) {
            if (this.environment.enterDrownEnding) {
                // Ensure single trigger
                if (!this.environment.drownManager || !this.environment.drownManager.active) {
                    this.environment.enterDrownEnding();

                    // Silence other audio (Violet, Footsteps, Ambience)
                    if (this.audio && this.audio.stopAll) {
                        this.audio.stopAll();
                    }

                    // Stop any active whisper IMMEDIATELY
                    if (this._currentWhisper) {
                        this._currentWhisper.pause();
                        if (this._currentWhisper._fadeInterval) clearInterval(this._currentWhisper._fadeInterval);
                        this._currentWhisper = null;
                    }

                    // LOCK CONTROLS
                    this.player.setMobilized(false);
                    if (this.player.setViewLocked) this.player.setViewLocked(true); // No looking back
                }
            }
        } else if (this.player.metrics.stationaryTime > 10.0 && this.player.metrics.stationaryTime < 60.0 && !(this.environment.drownManager && this.environment.drownManager.active)) {
            // STOP WHISPERS IMMEDIATELY IF TURNING AROUND
            if (this.player.metrics.isLookingBack) {
                if (this._currentWhisper) {
                    this._currentWhisper.pause();
                    if (this._currentWhisper._fadeInterval) clearInterval(this._currentWhisper._fadeInterval);
                    this._currentWhisper = null;
                }
                return; // Do not trigger new ones
            }

            // WARNINGS (10s-60s)

            // BELL WARNING (59s - 1s before Drown)
            if (this.player.metrics.stationaryTime > 59.0 && this.paranoiaLevel < 20 && !this.bellFlags.finalWarning) {
                this.playBell();
                this.bellFlags.finalWarning = true;
            }

            // Cooldown Check
            if (this.whisperCooldownTimer === undefined) this.whisperCooldownTimer = 0;
            this.whisperCooldownTimer -= delta;

            if (this.whisperCooldownTimer > 0) return; // Wait for cooldown

            // Calculate Intensity & Length (0.0 at 10s -> 1.0 at 60s)
            const t = this.player.metrics.stationaryTime;
            const progress = (t - 10.0) / (60.0 - 10.0); // 0.0 to 1.0

            // Base chance increases with time
            const baseChance = 0.002;
            const chance = baseChance + (progress * 0.02);

            // Random chance to play Whisper.mp3
            if (Math.random() < chance) {
                // Stop previous if any
                if (this._currentWhisper) {
                    this._currentWhisper.pause();
                    if (this._currentWhisper._fadeInterval) clearInterval(this._currentWhisper._fadeInterval);
                }

                const hint = new Audio('audio/Whisper.mp3');
                // Volume increases with intensity
                hint.volume = 0.3 + (progress * 0.7);

                // RANDOM SEEK for variety (start from somewhere in the middle?)
                // actually full clip is better, just cut it off.
                // maybe random start time to make shorts sound different?
                // 'Whisper.mp3' might be short though. Let's assume start 0.

                hint.play().catch(() => { });
                this._currentWhisper = hint;

                // VARIABLE DURATION (Short bursts -> Long)
                // Start: 3.0s. End: 8.0s (User requested min 3s, max 8s)
                const durationMs = (3000 + (progress * 5000));

                // Set Cooldown: Duration + 17 seconds Silence
                this.whisperCooldownTimer = (durationMs / 1000) + 17.0;

                // Start Fade Out 1s before end (min 0.1s delay to play something)
                const fadeTime = 1000;
                const playTime = Math.max(100, durationMs - fadeTime);

                setTimeout(() => {
                    // Only fade if still active
                    if (this._currentWhisper === hint) {
                        const startVol = hint.volume;
                        const fadeInterval = setInterval(() => {
                            if (hint.volume > 0.02) {
                                hint.volume -= 0.02;
                            } else {
                                hint.volume = 0;
                                hint.pause();
                                clearInterval(fadeInterval);
                                if (this._currentWhisper === hint) this._currentWhisper = null;
                            }
                        }, 50); // Fade over ~1s-2s dep on volume
                        hint._fadeInterval = fadeInterval;
                    }
                }, playTime);

                // Clear ref when naturally done
                hint.onended = () => {
                    if (this._currentWhisper === hint) this._currentWhisper = null;
                };
            }
        }
    }

    getParanoiaFactor() {
        return this.paranoiaLevel / this.maxParanoia;
    }

    updateBreathing(delta) {
        // Drown Ending Block
        if (this.environment.drownManager && this.environment.drownManager.active) {
            if (this.breathingAudio) {
                this.breathingAudio.pause();
                this.breathingAudio.currentTime = 0;
            }
            return;
        }

        // Logic: Low Paranoia (< 20) AND Stationary (> 2s)
        const isCalm = this.paranoiaLevel < 20;
        const isStationary = this.player.metrics.stationaryTime > 2.0;

        if (isCalm && isStationary) {
            if (!this.breathingAudio) {
                this.breathingAudio = new Audio('audio/Slow Breathing.mp3');
                this.breathingAudio.loop = true;
                this.breathingAudio.volume = 0;
            }

            // Play if not playing
            if (this.breathingAudio.paused) {
                this.breathingAudio.play().catch(() => { });
            }

            // Fade In to 0.3
            if (this.breathingAudio.volume < 0.3) {
                this.breathingAudio.volume = Math.min(0.3, this.breathingAudio.volume + delta * 0.1);
            }
        } else {
            // Fade Out and Stop
            if (this.breathingAudio && !this.breathingAudio.paused) {
                if (this.breathingAudio.volume > 0.01) {
                    this.breathingAudio.volume = Math.max(0, this.breathingAudio.volume - delta * 0.5);
                } else {
                    this.breathingAudio.pause();
                    this.breathingAudio.currentTime = 0;
                }
            }
        }
    }

    monitorParanoia(delta) {
        // [BLOCK] If Drown Ending Active, Stop Paranoia Calculation
        if (this.environment.drownManager && this.environment.drownManager.active) return;

        const p = this.player.metrics;

        // INCREASE: Looking Back (Doubled Rate per user request)
        if (p.isLookingBack) {
            this.paranoiaLevel += delta * 20.0;
        }

        // INCREASE: Continuous Running (Reduced Rate)
        if (p.continuousForwardTime > 3.0) {
            this.paranoiaLevel += delta * 1.0;
        }

        // DECAY: Recover when stationary or moving carefully
        if (!p.isLookingBack) {
            if (p.isStationary) {
                this.paranoiaLevel -= delta * 0.5; // Slow recovery when still
            } else if (p.continuousForwardTime < 3.0) {
                this.paranoiaLevel -= delta * 0.5; // Slow recovery while walking
            }
        }

        this.paranoiaLevel = Math.max(0, Math.min(this.paranoiaLevel, this.maxParanoia));

        // Update Status based on Paranoia Level
        let statusText = "STABLE";
        let statusClass = "status-ok";

        if (this.paranoiaLevel < 20) {
            statusText = "STABLE";
            statusClass = "status-ok";
        } else if (this.paranoiaLevel < 40) {
            statusText = "UNSETTLED";
            statusClass = "status-ok";
        } else if (this.paranoiaLevel < 60) {
            statusText = "AGITATED";
            statusClass = "status-warn";
        } else if (this.paranoiaLevel < 80) {
            statusText = "HYSTERIA";
            statusClass = "status-warn";
        } else {
            statusText = "PSYCHOSIS";
            statusClass = "status-err";
        }

        this.updateStatus(statusText, statusClass);

        // TRIGGER ENDGAME (PHASE 3) - DELAYED
        // Must hold Max Paranoia for 60 seconds
        if (this.paranoiaLevel >= 99) {
            if (this.maxParanoiaTimer === undefined) this.maxParanoiaTimer = 0;
            this.maxParanoiaTimer += delta;

            // Console log every 10s
            if (Math.floor(this.maxParanoiaTimer) % 5 === 0 && Math.floor(this.maxParanoiaTimer) !== this._lastLogTime) {
                this._lastLogTime = Math.floor(this.maxParanoiaTimer);
                console.log(`SYS: Psychosis Hold: ${this.maxParanoiaTimer.toFixed(1)}s / 20s`);
            }

            if (this.maxParanoiaTimer > 20.0 && !this.endgameTriggered) {
                // FORCE RESET EVENTS
                this.blackout.active = false;
                this.environment.forceBlackout = false; // CRITICAL FIX
                this.cameraInversion.active = false;

                this.endgameTriggered = true;
                console.log("SYS: PSYCHOSIS BREAK - TRIGGERING ENDGAME");
                this.environment.enterEndgame();
            }
        } else {
            // Reset timer if they drift below max? 
            // Or Keep it? Let's bleed it slowly so they don't lose all progress instantly
            if (this.maxParanoiaTimer > 0) this.maxParanoiaTimer -= delta * 0.5;
        }
    }

    checkStateChanges(pFactor) {
        if (this.environment.drownManager && this.environment.drownManager.active) return;
        // Trigger Audio Whispers on State Change (Response, not random)
        // DISABLED PER USER REQUEST
    }

    handleRandomEvents(time, delta, pFactor) {
        if (this.endgameTriggered) return; // NO EVENTS IN SPACE (Peace/Void)
        if (this.environment.drownManager && this.environment.drownManager.active) return; // NO EVENTS DURING DROWNING

        if (pFactor < 0.1) return; // Too calm

        // Check for state-driven whispers
        this.checkStateChanges(pFactor);

        // 1. BLACKOUT EVENT (Max Paranoia Only, Very Rare)
        if (this.blackout.active) {
            this.blackout.timer += delta;

            // Force lights off
            this.environment.forceBlackout = true;

            // MIRAGE LOGIC
            if (this.blackout.timer < 0.1) {
                if (this.environment.showMirage) {
                    this.environment.showMirage(this.player.controls.getObject().position.z);
                }
            } else if (this.blackout.timer > 0.8) {
                if (this.environment.hideMirage) {
                    this.environment.hideMirage();
                }
            }

            // ANIMATE GLITCH
            if (this.environment.updateMirageEffect) {
                this.environment.updateMirageEffect();
            }

            if (this.blackout.timer > this.blackout.duration) {
                this.blackout.active = false;
                this.environment.forceBlackout = false;
                if (this.environment.hideMirage) this.environment.hideMirage();
            }
            return; // Skip other events during blackout
        } else if (pFactor > 0.95) {
            // ... blackout trigger ...
            // Reduced Rate (User Request: Half rate)
            if (Math.random() < 0.00025) {
                this.blackout.active = true;
                this.blackout.timer = 0;
            }
        }

        // 2. LIGHT FLICKERING
        // Reduced Rate (User Request: Half rate)
        const flickerChance = (0.0005 + (pFactor * 0.05)) * 0.5;
        if (Math.random() < flickerChance) {
            if (this.environment.flickerLights) this.environment.flickerLights();
        }

        // 3. CAMERA INVERSION (High Paranoia)
        // 3. CAMERA TWIST (Inversion/Roll)
        // Scaled Effect: Subtle tilt at low paranoia, violent twist at high.
        // User Update: Only at MAX paranoia levels (> 95%)
        if (pFactor > 0.95) {
            if (this.cameraInversion.active) {
                this.cameraInversion.timer += delta;

                // Rotation Logic
                let angle = 0;

                if (pFactor < 0.5) {
                    // LOW PARANOIA: Subtle Tilt
                    // Scale angle slightly with paranoia (0.02 to 0.08 radians)
                    angle = (Math.PI * 0.02) + (pFactor * 0.1);
                } else {
                    // HIGH PARANOIA: Severe Twist
                    // 0.1 to 0.3 radians
                    angle = (Math.PI * 0.1) + ((pFactor - 0.5) * 0.4);
                }

                // Apply Direction
                const currentAngle = angle * this.cameraInversion.direction;

                // Smoothly lerp or just set? Set is jittery, usually fine for horror.
                // Let's use a sine wave for "breathing" the twist if long duration
                if (this.cameraInversion.duration > 1.0) {
                    // Easing in/out
                    const progress = this.cameraInversion.timer / this.cameraInversion.duration;
                    const wave = Math.sin(progress * Math.PI); // 0 -> 1 -> 0
                    this.player.camera.rotation.z = currentAngle * wave;
                } else {
                    this.player.camera.rotation.z = currentAngle;
                }

                if (this.cameraInversion.timer > this.cameraInversion.duration) {
                    this.cameraInversion.active = false;
                    this.player.camera.rotation.z = 0;
                }

            } else {
                // TRIGGER LOGIC
                // Chance increases with paranoia
                // Low: Rare. High: Frequent.
                const invertChance = 0.0001 + (pFactor * 0.002);

                if (Math.random() < invertChance) {
                    this.cameraInversion.active = true;
                    this.cameraInversion.timer = 0;

                    // RANDOM DIRECTION
                    this.cameraInversion.direction = Math.random() < 0.5 ? 1 : -1;

                    // DURATION SCALING
                    if (pFactor < 0.5) {
                        // "max 3s for levels below 50%" - User
                        // Let's make it 1.0s to 3.0s
                        this.cameraInversion.duration = 1.0 + Math.random() * 2.0;
                    } else {
                        // High Paranoia: Faster, sharper glitches? Or longer disorientation?
                        // "scale with paranoia levels"
                        // Let's try varied: Short snaps (0.2s) or Long holds (4s)
                        this.cameraInversion.duration = 0.2 + (Math.random() * (pFactor * 4.0));
                    }
                }
            }
        }
    }

    checkMessaging(time, pFactor) {
        if (this.endgameTriggered) return; // No messages in space
        if (this.environment.drownManager && this.environment.drownManager.active) return;

        // RESET APATHY LEVEL IF MOVING
        if (this.player.metrics.stationaryTime < 1.0) {
            this.apathyLevel = 0;
            this.bellFlags.level2 = false;
            this.bellFlags.level3 = false;
            this.bellFlags.finalWarning = false;
        }

        // APATHY MODE MESSAGING (Stationary & Low Paranoia < 20)
        if (this.player.metrics.stationaryTime > 5.0 && this.paranoiaLevel < 20) {
            const apathyPool = this.messagePools.apathy;
            const style = { color: '#cccccc', textShadow: '0 0 5px #ffffff' }; // Light Gray effect

            // Level 1: ~15s
            if (this.player.metrics.stationaryTime > 15.0 && this.apathyLevel < 1) {
                this.apathyLevel = 1;
                this.logMessage(apathyPool[0], 0, style); // "It's peaceful here..."
                return;
            }

            // Level 2: 30s (Bell + Message)
            if (this.player.metrics.stationaryTime > 30.0) {
                if (this.apathyLevel < 2) {
                    this.apathyLevel = 2;
                    this.logMessage(apathyPool[2], 0, style); // "I don't want to move anymore."
                }
                if (!this.bellFlags.level2) {
                    this.playBell();
                    this.bellFlags.level2 = true;
                }
            }

            // Level 3: 45s (Bell + Message)
            if (this.player.metrics.stationaryTime > 45.0) {
                if (this.apathyLevel < 3) {
                    this.apathyLevel = 3;
                    this.logMessage(apathyPool[3], 0, style); // "Just let go..."
                }
                if (!this.bellFlags.level3) {
                    this.playBell();
                    this.bellFlags.level3 = true;
                }
            }
        }

        // MESSAGING SYSTEM (4 Types)
        // 1. SYSTEM LOGS (Bottom Left, Green/Console style)
        // 2. VOICES (Top Center, Ghostly)
        // Cooldown: Minimum 8s, up to 15s
        const currentCooldown = Math.max(8.0, this.baseMessageCooldown - (pFactor * 7.0));

        if (time - this.lastMessageTime < currentCooldown) return;

        const p = this.player.metrics;
        let selectedPool = null;

        // High Paranoia Overlay
        if (pFactor > 0.7 && Math.random() < 0.4) {
            selectedPool = "highParanoia";
        }

        // Standard Strict Triggers (if no high paranoia override)
        if (!selectedPool) {
            // 1. Re-visiting zones
            if (p.zoneHistory.length > 15) {
                const currentZone = p.zoneHistory[p.zoneHistory.length - 1];
                const oldHistory = p.zoneHistory.slice(0, p.zoneHistory.length - 10);
                if (oldHistory.includes(currentZone) && Math.random() < 0.1) {
                    selectedPool = "zoneReentry";
                }
            }

            // 2. Look Back
            if (!selectedPool && p.isLookingBack && Math.random() < 0.3) {
                selectedPool = "lookBack";
            }

            // 3. Stationary
            if (!selectedPool && p.isStationary && p.stationaryTime > 5.0 && Math.random() < 0.2) {
                selectedPool = "stationary";
            }

            // 4. Continuous Flow
            if (!selectedPool && p.continuousForwardTime > 15.0 && Math.random() < 0.2) {
                selectedPool = "continuousMove";
            }
        }

        if (selectedPool) {
            this.triggerMessage(time, selectedPool, pFactor);
        }
    }

    updateClock(delta) {
        // Normal Time Update
        this.survivalTime += delta;

        if (this.clockEl) {
            const totalSeconds = Math.floor(this.survivalTime);
            const safeSeconds = Math.min(totalSeconds, 359999);

            const hrs = Math.floor(safeSeconds / 3600).toString().padStart(2, '0');
            const mins = Math.floor((safeSeconds % 3600) / 60).toString().padStart(2, '0');
            const secs = (safeSeconds % 60).toString().padStart(2, '0');
            this.clockEl.innerText = `${hrs}:${mins}:${secs}`;
        }
    }

    triggerMessage(time, poolName, pFactor = 0) {
        this.lastMessageTime = time;

        // Chance of contradiction scales with paranoia
        if (Math.random() < (0.01 + pFactor * 0.2)) {
            poolName = "contradiction";
        }

        const pool = this.messagePools[poolName];
        if (pool) {
            let msg = "";
            let uniqueFound = false;

            // Try 3 times to find a unique message
            for (let i = 0; i < 3; i++) {
                msg = pool[Math.floor(Math.random() * pool.length)];
                if (!this.recentMessages.includes(msg)) {
                    uniqueFound = true;
                    break;
                }
            }

            // If failed to find unique, use last picked (msg)

            // Update Queue
            this.recentMessages.push(msg);
            if (this.recentMessages.length > 5) {
                this.recentMessages.shift();
            }

            this.logMessage(msg, pFactor);
        }
    }

    playBell() {
        if (!this.bellAudio) {
            this.bellAudio = new Audio('audio/temple_bell.mp3');
            this.bellAudio.volume = 0.8;
        }
        this.bellAudio.currentTime = 0;
        this.bellAudio.play().catch(() => { });
    }

    logMessage(text, pFactor = 0, styleOverride = null) {
        // Use Voice Overlay if available, else fallback
        const targetContainer = this.ui.voice || this.ui.log;

        targetContainer.innerHTML = ''; // Single message at a time

        const entry = document.createElement('div');
        // Use appropriate class based on container
        entry.classList.add(this.ui.voice ? 'voice-entry' : 'log-entry');
        entry.innerText = text;

        // Urgency styling
        entry.style.fontWeight = (pFactor > 0.5) ? 'bold' : '300';

        if (styleOverride) {
            // Apply custom styles
            if (styleOverride.color) entry.style.color = styleOverride.color;
            if (styleOverride.textShadow) entry.style.textShadow = styleOverride.textShadow;
            if (styleOverride.fontSize) entry.style.fontSize = styleOverride.fontSize;
            if (styleOverride.letterSpacing) entry.style.letterSpacing = styleOverride.letterSpacing;
        } else if (pFactor > 0.8) {
            entry.style.color = '#ff0000'; // Pure Red
            entry.style.textShadow = '0 0 20px red';
            entry.style.fontSize = '32px'; // Larger than base 24px
            entry.style.letterSpacing = '6px';
        }

        targetContainer.appendChild(entry);
    }

    updateStatus(text, className) {
        if (this.ui.neuro) {
            this.ui.neuro.innerText = text;
            this.ui.neuro.className = className;
        }
    }

    reset() {
        console.log("SYS: System Reset (Loop)");
        this.paranoiaLevel = 0;
        this.maxParanoiaTimer = 0;
        this.endgameTriggered = false;
        this.lastMessageTime = 0;
        this.recentMessages = [];
        this.lastTriggeredBehavior = null;

        // Reset Effects
        this.blackout.active = false;
        this.blackout.timer = 0;
        this.environment.forceBlackout = false;

        if (this._currentWhisper) {
            this._currentWhisper.pause();
            if (this._currentWhisper._fadeInterval) clearInterval(this._currentWhisper._fadeInterval);
            this._currentWhisper = null;
        }

        if (this.breathingAudio) {
            this.breathingAudio.pause();
            this.breathingAudio.currentTime = 0;
        }

        this.whisperCooldownTimer = 0;

        if (this.environment.reset) this.environment.reset();

        this.cameraInversion.active = false;
        this.cameraInversion.timer = 0;
        this.player.camera.rotation.z = 0; // Fix rotation
        if (this.player.setViewLocked) this.player.setViewLocked(false);

        this.player.setMobilized(true);

        // Update UI
        this.updateStatus("STABLE", "status-ok");
        if (this.ui.log) this.ui.log.innerHTML = '';
        if (this.ui.voice) this.ui.voice.innerHTML = '';

        // Reset Player Metrics (Optional, but good for "New Game" feel)
        // Accessing player directly might be tight coupling, but system owns analysis.
        if (this.player && this.player.metrics) {
            this.player.metrics.totalDistance = 0;
            this.player.metrics.stationaryTime = 0;
            this.player.metrics.continuousForwardTime = 0;
            // Keep zone history? Maybe clear it so "revisiting" logic resets.
            this.player.metrics.zoneHistory = [];
        }
    }
}
