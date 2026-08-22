// [LIGHT EVENT TUNING]
// Rates are per second and multiplied by delta at the call site, so they mean the
// same thing at 60fps and 144fps.

// Full blackout: a rare punctuation mark, not a recurring effect. Only rolls above
// 95% paranoia, and then averages once every ~150s of sustained max paranoia, with
// a hard cooldown afterwards so two can never land close together.
const BLACKOUT_RATE_PER_SEC = 1 / 150;
const BLACKOUT_COOLDOWN = 90;

// Flicker: the ambient version of the same idea. Silent below moderate-high
// paranoia, then ramps from an occasional stutter to a steady crackle at max.
const FLICKER_MIN_PARANOIA = 0.55;
const FLICKER_RATE_MIN = 0.15; // ~1 per 7s at the threshold
const FLICKER_RATE_MAX = 1.5;  // matches the old peak rate at max paranoia

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
        // Seconds still to wait before another blackout may be rolled.
        this.blackoutCooldown = 0;

        // Timer Logic
        this.survivalTime = 0;
        this.clockEl = document.getElementById('clock');


        // Context-Aware Message Pools
        this.messagePools = {
            stationary: [
                "WHY HAVE YOU STOPPED?",
                "DON'T STOP",
                "CAN YOU HEAR IT?",
                "ARE YOU LOST?"
            ],
            lookBack: [
                "THERE IS NOTHING BEHIND YOU",
                "LOOKING BACK IS UNNECESSARY",
                "WHY DO YOU KEEP CHECKING?",
                "DON'T LOOK BACK",
                "YOU SEEM NERVOUS"
            ],
            continuousMove: [
                "KEEP GOING",
                "CONTINUE",
                "DO NOT STOP",
                "YOU WILL REACH THE END",
                "THE CORRIDOR IS LONG"
            ],
            zoneReentry: [
                "THIS PLACE REMEMBERS YOU",
                "HAVE YOU BEEN HERE BEFORE?",
            ],
            highParanoia: [
                "THEY WON'T GET YOU",
                "DON'T TURN AROUND",
                "IT IS GETTING CLOSER",
                "RUN",
            ],
            contradiction: [
                "IT WAS A LIE",
                "NO...",
            ],
            apathy: [
                "It's peaceful here...",
                "Why was I so afraid?",
                "I don't want to move anymore.",
                "Just let go...",
                "Drifting away..."
            ],
            instinctiveDoubt: [
                "DON'T LET GO",
                "SHOULD YOU LOOK?",
                "WILL YOU IGNORE IT?",
                "AM I SAFE?",
                "WHY ARE YOU CALM?"
            ],
            longLookBack: [
                "I WANT TO GO HOME",
                "I MISS HOW IT WAS",
                "TAKE ME BACK",
                "WHY DID I LEAVE?",
                "IT WAS BETTER BEFORE"
            ]
        };

        this.recentMessages = []; // Anti-repetition queue

        // Track Apathy Levels (0, 1, 2...)
        this.apathyLevel = 0;
        this.lastStationaryReset = 0;
        this.bellFlags = { level2: false, level3: false, finalWarning: false };
        this.lookBackTimer = 0;

        // VOID ENDING STATE
        this.highParanoiaDistance = 0;
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

        // [APATHY TRACKER]
        // Strict requirement: Continuous stationary + Low Paranoia (< 20)
        if (this.apathyTimer === undefined) this.apathyTimer = 0;

        if (this.player.metrics.stationaryTime > 0.1 && this.paranoiaLevel < 20.0) {
            this.apathyTimer += delta;
        } else {
            // Reset if moved OR paranoia spiked
            this.apathyTimer = 0;
            this.apathyLevel = 0;
            this.bellFlags.level2 = false;
            this.bellFlags.level3 = false;
            this.bellFlags.finalWarning = false;
        }

        // DROWN ENDING CHECK
        // If strict apathy time > 60s
        if (this.apathyTimer > 60.0) {
            if (this.environment.enterDrownEnding) {
                // Ensure single trigger
                if (!this.environment.drownManager || !this.environment.drownManager.active) {
                    this.environment.enterDrownEnding();

                    // Fade out Bell if it's ringing (Final Warning)
                    this.fadeOutBell();

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
        } else if (this.apathyTimer > 10.0 && !(this.environment.drownManager && this.environment.drownManager.active)) {
            // STOP WHISPERS IMMEDIATELY IF TURNING AROUND
            // (Handled by paranoia spike resetting timer, but good to be safe)
            if (this.player.metrics.isLookingBack) {
                // Actually looking back spikes paranoia, which resets apathyTimer to 0. 
                // So we won't be in this block.
                return;
            }

            // WARNINGS (10s-60s)

            // BELL WARNING (59s)
            if (this.apathyTimer > 59.0 && !this.bellFlags.finalWarning) {
                this.playBell();
                this.bellFlags.finalWarning = true;
            }

            // Cooldown Check
            if (this.whisperCooldownTimer === undefined) this.whisperCooldownTimer = 0;
            this.whisperCooldownTimer -= delta;

            if (this.whisperCooldownTimer > 0) return; // Wait for cooldown

            // Calculate Intensity & Length (0.0 at 10s -> 1.0 at 60s)
            const t = this.apathyTimer;
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

        // [LOOK BACK MECHANIC]

        // Instant Spike (Positive -> Negative Z Crossing)
        if (p.turnAroundTrigger) {
            this.paranoiaLevel += 15.0; // User Request: +15
            console.log("SYS: Look Back Return Spike (+15)");
        }

        // Continuous Gain (While Z > 0)
        if (p.isLookingBack) {
            this.paranoiaLevel += delta * 3.0; // User Request: +3/sec

            // Timer for Shake
            if (this.lookBackTimer === undefined) this.lookBackTimer = 0;
            this.lookBackTimer += delta;

            // Progressive Screen Shake
            // Start > 1s. Max at 10s.
            if (this.lookBackTimer > 1.0) {
                const progress = Math.min(1.0, (this.lookBackTimer - 1.0) / 9.0);
                const shakeIntensity = progress * 0.5;
                if (this.player.cameraController) this.player.cameraController.setShake(shakeIntensity);
            }
        } else {
            this.lookBackTimer = 0;
            if (this.player.cameraController) this.player.cameraController.setShake(0);
        }

        // [CONTINUOUS RUNNING]
        if (p.continuousForwardTime > 5.0) {
            this.paranoiaLevel += delta * 1.2;
        }

        // [DECAY - RECOVERY]
        // Only recover if NOT Looking Back AND (Stationary OR Careful Walking)
        if (!p.isLookingBack) {
            if (p.isStationary) {
                this.paranoiaLevel -= delta * 0.5; // Slow recovery when still
            } else if (p.continuousForwardTime < 5.0) {
                this.paranoiaLevel -= delta * 0.5; // Slow recovery while walking
            }
        }

        this.paranoiaLevel = Math.max(0, Math.min(this.paranoiaLevel, this.maxParanoia));

        // Update Status based on Paranoia Level
        let statusText = "STABLE";
        let statusClass = "status-ok";

        if (this.paranoiaLevel < 19) {
            statusText = "STABLE";
            statusClass = "status-ok";
        } else if (this.paranoiaLevel < 40) {
            statusText = "UNSETTLED";
            statusClass = "status-ok";
        } else if (this.paranoiaLevel < 65) {
            statusText = "AGITATED";
            statusClass = "status-warn";
        } else if (this.paranoiaLevel < 86) {
            statusText = "HYSTERIA";
            statusClass = "status-warn";
        } else {
            statusText = "PSYCHOSIS";
            statusClass = "status-err";
        }

        this.updateStatus(statusText, statusClass);

        // TRIGGER ENDGAME (PHASE 3) - DELAYED
        // Condition: Run 200 units while in Psychosis (Paranoia > 86)

        if (this.paranoiaLevel >= 86) {
            // Track distance if moving
            if (!this.player.metrics.isStationary) {
                // Approximate distance this frame based on move speed ~4.0
                // Better: Use actual delta position from Metrics?
                // Metrics has totalDistance. We can track delta of totalDistance.
                // But simplified: 4.0 * delta is roughly correct if running.
                // Let's use MetricsManager's distanceTraveled for accuracy if available, 
                // but we only have totalDistance.

                // Let's just use constant approximation if running:
                if (this.player.metrics.continuousForwardTime > 0.1 || !this.player.metrics.isStationary) {
                    const estimatedSpeed = 4.0;
                    this.highParanoiaDistance += estimatedSpeed * delta;
                }
            }

            // Console log every 50 units
            if (this.highParanoiaDistance > 0 && Math.floor(this.highParanoiaDistance / 50) > this._lastLogDist) {
                this._lastLogDist = Math.floor(this.highParanoiaDistance / 50);
                console.log(`SYS: Psychosis Run: ${this.highParanoiaDistance.toFixed(1)} / 200`);
            }

            if (this.highParanoiaDistance > 160.0 && !this.endgameTriggered) {
                // FORCE RESET EVENTS
                this.blackout.active = false;
                this.environment.forceBlackout = false;
                this.cameraInversion.active = false;

                this.endgameTriggered = true;
                console.log("SYS: PSYCHOSIS BREAK - TRIGGERING ENDGAME");
                this.environment.enterEndgame();
            }
        } else {
            // Decay progress if they calm down? 
            // "it seems that a look back is needed to trigger even if the other conditions are met" -> No, we want pure run.
            // Let's NOT decay distance. Once you run enough in fear, it unlocks.
            // Actually, maybe slight decay so they can't cheese it in 10 bursts?
            // User didn't specify, but "run 200 distance" implies cummulative or continuous.
            // Let's keep it cumulative but safe.
            if (this.highParanoiaDistance > 0) {
                this._lastLogDist = 0; // Reset log flag
            }
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

        // Tick the blackout cooldown before the calm early-out, so it measures real
        // elapsed time rather than only time spent at high paranoia.
        if (this.blackoutCooldown > 0) this.blackoutCooldown -= delta;

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
            this.blackoutCooldown = BLACKOUT_COOLDOWN;
            return; // Skip other events during blackout
        } else if (pFactor > 0.95) {
            // [BLACKOUT TRIGGER]
            // Rates below are PER SECOND and scaled by delta. The old code rolled a
            // fixed per-frame chance, so the event fired 2.4x more often at 144fps
            // than at 60 - impossible to tune "rare" against.
            if (this.blackoutCooldown <= 0 && Math.random() < BLACKOUT_RATE_PER_SEC * delta) {
                this.blackout.active = true;
                this.blackout.timer = 0;
            }
        }

        // 2. LIGHT FLICKERING
        // Only from moderate-high paranoia upward, ramping to full rate at max.
        // Below the threshold the corridor stays steady, so a flicker actually reads
        // as the facility reacting to the player rather than as constant noise.
        if (pFactor >= FLICKER_MIN_PARANOIA) {
            const ramp = (pFactor - FLICKER_MIN_PARANOIA) / (1 - FLICKER_MIN_PARANOIA);
            const flickerRate = FLICKER_RATE_MIN + ramp * (FLICKER_RATE_MAX - FLICKER_RATE_MIN);

            if (Math.random() < flickerRate * delta) {
                if (this.environment.flickerLights) this.environment.flickerLights();
            }
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
                // NOTE: we hand the angle to CameraController instead of writing
                // camera.rotation.z here. CameraController runs later in the frame and
                // used to stomp this value (or get blocked by its own guard), so the
                // twist fought the sway every frame.
                let rollZ;
                if (this.cameraInversion.duration > 1.0) {
                    // Easing in/out
                    const progress = this.cameraInversion.timer / this.cameraInversion.duration;
                    const wave = Math.sin(progress * Math.PI); // 0 -> 1 -> 0
                    rollZ = currentAngle * wave;
                } else {
                    rollZ = currentAngle;
                }

                if (this.cameraInversion.timer > this.cameraInversion.duration) {
                    this.cameraInversion.active = false;
                    rollZ = 0;
                }

                if (this.player.cameraController) this.player.cameraController.setExternalRoll(rollZ);

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

                if (this.player.cameraController) this.player.cameraController.setExternalRoll(0);
            }
        } else if (this.cameraInversion.active) {
            // Paranoia dropped out of the twist band mid-event: cancel cleanly instead
            // of leaving the roll frozen at its last value.
            this.cameraInversion.active = false;
            this.cameraInversion.timer = 0;
            if (this.player.cameraController) this.player.cameraController.setExternalRoll(0);
        }
    }

    checkMessaging(time, pFactor) {
        if (this.endgameTriggered) return; // No messages in space
        if (this.environment.drownManager && this.environment.drownManager.active) return;

        const p = this.player.metrics;

        // RESET APATHY LEVEL IF MOVING
        if (this.player.metrics.stationaryTime < 1.0) {
            this.apathyLevel = 0;
            this.bellFlags.level2 = false;
            this.bellFlags.level3 = false;
            this.bellFlags.finalWarning = false;
        }

        // APATHY MODE MESSAGING (Stationary & Low Paranoia < 20)
        let processedApathyEvent = false;

        if (this.player.metrics.stationaryTime > 5.0 && this.paranoiaLevel < 20) {
            const apathyPool = this.messagePools.apathy;
            const style = { color: '#cccccc', textShadow: '0 0 5px #ffffff' }; // Light Gray effect

            // Helper to trigger delayed message
            const triggerApathySequence = (level, msgIndex) => {
                this.apathyLevel = level;

                // 1. Play Bell
                this.playBell();

                // 2. Delayed Message (0.5s)
                setTimeout(() => {
                    this.logMessage(apathyPool[msgIndex], 0, style);
                }, 500);

                // Block regular messages for a while (full duration of effect ~5-8s)
                this.lastApathyEventTime = time;
                processedApathyEvent = true;
            };

            // Level 1: ~15s (Just message, no bell usually? Or bell? User said "Bell & Message Timing")
            // Previously Level 1 (15s) was just message. Level 2 (30s) was Bell+Message.
            // Let's keep Level 1 as just message for Intro, but apply the "lockout" logic.
            if (this.player.metrics.stationaryTime > 15.0 && this.apathyLevel < 1) {
                this.apathyLevel = 1;
                this.logMessage(apathyPool[0], 0, style);
                this.lastApathyEventTime = time;
                processedApathyEvent = true;
            }

            // Level 2: 30s (Bell + Message)
            if (this.player.metrics.stationaryTime > 30.0 && this.apathyLevel < 2) {
                triggerApathySequence(2, 2);
                if (!this.bellFlags.level2) this.bellFlags.level2 = true;
            }
            // Catch-up Bell
            if (this.player.metrics.stationaryTime > 30.0 && !this.bellFlags.level2) {
                this.playBell();
                this.bellFlags.level2 = true;
            }

            // Level 3: 45s (Bell + Message)
            if (this.player.metrics.stationaryTime > 45.0 && this.apathyLevel < 3) {
                triggerApathySequence(3, 3);
                if (!this.bellFlags.level3) this.bellFlags.level3 = true;
            }
            // Catch-up Bell
            if (this.player.metrics.stationaryTime > 45.0 && !this.bellFlags.level3) {
                this.playBell();
                this.bellFlags.level3 = true;
            }
        }

        // MESSAGING SYSTEM (4 Types)

        // [LOGIC: First Message "DON'T LOOK BACK"]
        if (!this.hasTriggeredFirstMessage && p.isLookingBack) {
            // Override everything for the very first look-back experience
            this.hasTriggeredFirstMessage = true;
            this.triggerMessage(time, 'first_look_back_override', pFactor);
            return;
        }

        // GATING: If Apathy Event just happened, block regular messages for 10 seconds
        if (this.lastApathyEventTime && (time - this.lastApathyEventTime < 10.0)) return;

        // APATHY MODE REGULAR INTERVALS
        // If in Apathy Mode (Stationary + Low Paranoia), ensure "regular" intervals for yellow messages
        let currentCooldown = Math.max(13.0, this.baseMessageCooldown - (pFactor * 7.0));

        if (this.player.metrics.stationaryTime > 5.0 && this.paranoiaLevel < 20) {
            // "Keep frequency but more regular"
            // Use a semi-fixed interval (e.g., 12s) instead of random chance
            currentCooldown = 13.0;
        }

        // [LOGIC: Cooldown Halved when Looking Back & Walking Back]
        if (p.isLookingBack && !p.isStationary) {
            currentCooldown *= 0.5;
        }

        if (time - this.lastMessageTime < currentCooldown) return;

        let selectedPool = null;

        // Force selection in Apathy Mode if cooldown met
        if (this.player.metrics.stationaryTime > 5.0 && this.paranoiaLevel < 20) {
            // Prioritize "Instinctive Doubt" or "Stationary"
            // Let's pick from stationary or instinctiveDoubt
            if (Math.random() < 0.5) selectedPool = 'stationary';
            else selectedPool = 'instinctiveDoubt';
        }

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
            if (!selectedPool && p.isLookingBack) {
                // [LONG LOOK BACK] (> 3s)
                if (this.lookBackTimer > 3.0 && Math.random() < 0.4) {
                    selectedPool = "longLookBack";
                }
                // Standard Look Back
                else if (Math.random() < 0.3) {
                    selectedPool = "lookBack";
                }
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

        // OVERRIDE: Instinctive Doubt (Apathy Struggle)
        // If stationary > 25s (Strict Apathy Timer)
        if (this.apathyTimer > 25.0) {
            // Force doubt messages instead of generic stationary/random ones if chosen
            // Or just increase chance of doubt messages appearing randomly
            // Let's force it if a pool was selected OR randomly
            if (selectedPool === 'stationary' || (!selectedPool && Math.random() < 0.3)) {
                selectedPool = 'instinctiveDoubt';
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

        let msg = "";

        // Handle Override
        if (poolName === 'first_look_back_override') {
            msg = "DON'T LOOK BACK";
        } else {
            // Chance of contradiction scales with paranoia (only if not overriding)
            if (Math.random() < (0.01 + pFactor * 0.2)) {
                poolName = "contradiction";
            }

            const pool = this.messagePools[poolName];
            if (pool) {
                let uniqueFound = false;
                // Try 3 times to find a unique message
                for (let i = 0; i < 3; i++) {
                    msg = pool[Math.floor(Math.random() * pool.length)];
                    if (!this.recentMessages.includes(msg)) {
                        uniqueFound = true;
                        break;
                    }
                }
                if (!uniqueFound && pool.length > 0) msg = pool[0];
            }
        }

        if (!msg) return;

        // Update Queue
        this.recentMessages.push(msg);
        if (this.recentMessages.length > 5) {
            this.recentMessages.shift();
        }

        this.logMessage(msg, pFactor);
    }


    playBell() {
        if (!this.bellAudio) {
            this.bellAudio = new Audio('audio/temple_bell.mp3');
            this.bellAudio.volume = 0.48;
        }
        this.bellAudio.currentTime = 0;
        this.bellAudio.play().catch(() => { });
    }

    fadeOutBell() {
        if (this.bellAudio && !this.bellAudio.paused) {
            const fadeInterval = setInterval(() => {
                if (this.bellAudio.volume > 0.02) {
                    this.bellAudio.volume -= 0.02;
                } else {
                    this.bellAudio.volume = 0;
                    this.bellAudio.pause();
                    clearInterval(fadeInterval);
                }
            }, 50); // Fade over ~1s
        }
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

        // [TREMBLE EFFECT]
        // Scale intensity with pFactor
        if (pFactor > 0.1) {
            entry.style.display = 'inline-block';
            entry.style.position = 'relative';

            const intensity = pFactor * 5.0; // Max 5px shuffle

            const trembleId = setInterval(() => {
                const dx = (Math.random() - 0.5) * intensity;
                const dy = (Math.random() - 0.5) * intensity;
                entry.style.transform = `translate(${dx}px, ${dy}px)`;

                // Opacity flicker for high paranoia
                if (pFactor > 0.6 && Math.random() < 0.2) {
                    entry.style.opacity = Math.random();
                } else {
                    entry.style.opacity = 1.0;
                }

                // Cleanup if removed (simplified check, optimized for modern browsers)
                if (!entry.isConnected) clearInterval(trembleId);
            }, 50);
        }



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
        this.paranoiaLevel = 0;
        this.maxParanoiaTimer = 0;
        this.highParanoiaDistance = 0;
        this.endgameTriggered = false;
        this.lastMessageTime = 0;
        this.recentMessages = [];
        this.lastTriggeredBehavior = null;

        // Reset Effects
        this.blackout.active = false;
        this.blackout.timer = 0;
        this.blackoutCooldown = 0;
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
        if (this.player.cameraController) this.player.cameraController.setExternalRoll(0);
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
