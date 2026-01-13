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
            ]
        };

        this.recentMessages = []; // Anti-repetition queue
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
    }

    getParanoiaFactor() {
        return this.paranoiaLevel / this.maxParanoia;
    }

    monitorParanoia(delta) {
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
        // Trigger Audio Whispers on State Change (Response, not random)
        // DISABLED PER USER REQUEST
        /*
        const p = this.player.metrics;
        
        let stateChanged = false;

        // 1. Sudden Movement Stop/Start
        if (this.lastState_stationary !== p.isStationary) {
            this.lastState_stationary = p.isStationary;
            stateChanged = true;
        }

        // 2. SUDDEN TWIST / TURN
        if (Math.abs(p.rotationSpeed) > 5.0) { 
            stateChanged = true;
        }
        
        if (stateChanged && pFactor > 0.2) {
            const chance = 0.6 + (pFactor * 0.4); 
            if (Math.random() < chance) {
                this.shouldTriggerWhisper = true; 
            }
        }
        */
    }

    handleRandomEvents(time, delta, pFactor) {
        if (this.endgameTriggered) return; // NO EVENTS IN SPACE (Peace/Void)

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

    logMessage(text, pFactor = 0) {
        // Use Voice Overlay if available, else fallback
        const targetContainer = this.ui.voice || this.ui.log;

        targetContainer.innerHTML = ''; // Single message at a time

        const entry = document.createElement('div');
        // Use appropriate class based on container
        entry.classList.add(this.ui.voice ? 'voice-entry' : 'log-entry');
        entry.innerText = text;

        // Urgency styling
        entry.style.fontWeight = (pFactor > 0.5) ? 'bold' : '300';

        if (pFactor > 0.8) {
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
}
