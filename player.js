import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export class Player {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;

        // [CONTROLS]
        this.controls = new PointerLockControls(camera, domElement);
        this.setupEventListeners();

        // [MOVEMENT PARAMETERS]
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();

        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.moveSpeed = 4.0; // Slow, deliberate walk
        this.friction = 5.0; // High friction for "heavy" stop
        this.acceleration = 30.0; // Gradual start

        // [BEHAVIOR METRICS]
        this.metrics = {
            distanceTraveled: 0,
            stationaryTime: 0,
            continuousForwardTime: 0,
            isStationary: false,
            isLookingBack: false,
            zoneHistory: [],
            gazeTarget: null,
            gazeDuration: 0,
            lastPosition: new THREE.Vector3(),
            totalDistance: 0,
            lookBackCount: 0,
            lastYaw: 0,
            lastActionTime: 0,
            rotationSpeed: 0
        };

        this.baseFOV = 75;
        this.swayTime = 0;

        // [RAYCASTER FOR GAZE]
        this.raycaster = new THREE.Raycaster();
        this.center = new THREE.Vector2(0, 0); // Center of screen

        // [STATE]
        this.isFalling = false;
        this.fadedOut = false;
        this.endgameLocked = false;
    }

    setupEventListeners() {
        this.domElement.addEventListener('click', () => {
            this.controls.lock();
        });
    }

    update(delta, interactables = [], pillarPositions = [], pFactor = 0, isEndgame = false, blackHolePos = null, edgeZ = null, isIntro = false) {
        if (!this.controls.isLocked) return;

        this.pillarPositions = pillarPositions;

        // 1. [PHYSICS / MOVEMENT]
        this.updateMovement(delta, isEndgame, blackHolePos, edgeZ, isIntro);

        // 2. [BEHAVIOR TRACKING]
        this.updateMetrics(delta, interactables, blackHolePos);

        // 3. [ENVIRONMENTAL DISTORTIONS]
        this.updateDistortions(delta, pFactor);
    }

    updateDistortions(delta, pFactor) {
        // PER USER REQUEST: No distortions at Stable levels (0-20%)
        // ALSO: No distortions in Endgame/Space
        if (pFactor < 0.2 || this.isFalling) return;

        this.swayTime += delta;

        // 1. FOV BREATHING

        // FOV SURGE STATE (Lazy Init)
        if (!this.fovSurge) {
            this.fovSurge = { active: false, timer: 0 };
        }

        // Trigger Surge at High Paranoia
        if (pFactor > 0.8 && !this.fovSurge.active) {
            if (Math.random() < 0.005) { // Occasional burst
                this.fovSurge.active = true;
                this.fovSurge.timer = 2.0 + Math.random() * 2.0; // 2-4 seconds
                // console.log("PLAYER: FOV SURGE");
            }
        }

        let intensityMult = 1.0;
        if (this.fovSurge.active) {
            this.fovSurge.timer -= delta;
            intensityMult = 1.5; // Max 1.5x requested
            if (this.fovSurge.timer <= 0) this.fovSurge.active = false;
        }

        const pulseSpeed = 0.5 + pFactor * 1.5;
        // Base intensity maxes at 10. With surge, maxes at 15.
        const fovIntensity = pFactor * 10.0 * intensityMult;

        const fovOffset = Math.sin(this.swayTime * pulseSpeed) * fovIntensity;
        this.camera.fov = this.baseFOV + fovOffset;
        this.camera.updateProjectionMatrix();

        // 2. CAMERA SWAY
        const swayAmount = pFactor * 0.05;
        const sway = Math.sin(this.swayTime * 0.8) * swayAmount;

        if (Math.abs(this.camera.rotation.z) < 0.1) {
            this.camera.rotation.z = sway;
        }
    }

    updateMovement(delta, isEndgame, blackHolePos, edgeZ, isIntro = false) {
        // Clamp delta to prevent explosion on lag spikes (max 100ms)
        const timeStep = Math.min(delta, 0.1);

        const playerPos = this.controls.getObject().position;

        // --- 1. STATE MANAGEMENT ---
        if (this.isFalling) {
            this.moveForward = false;
            this.moveBackward = false;
            this.moveLeft = false;
            this.moveRight = false;
        }

        // --- 2. PHYSICS (VELOCITY) ---
        const damping = Math.exp(-this.friction * timeStep);
        this.velocity.x *= damping;
        this.velocity.z *= damping;

        if (!this.isFalling) {
            this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
            this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
            this.direction.normalize();

            if (this.moveForward || this.moveBackward)
                this.velocity.z -= this.direction.z * this.acceleration * timeStep;
            if (this.moveLeft || this.moveRight)
                this.velocity.x -= this.direction.x * this.acceleration * timeStep;

            this.controls.moveRight(-this.velocity.x * timeStep);
            this.controls.moveForward(-this.velocity.z * timeStep);
        }

        // [INTRO ROOM COLLISION]
        if (isIntro) {
            if (playerPos.z > 5.8) playerPos.z = 5.8;
            if (playerPos.x > 1.8) playerPos.x = 1.8;
            if (playerPos.x < -1.8) playerPos.x = -1.8;
            if (playerPos.z < 2.2) {
                if (Math.abs(playerPos.x) > 0.6) playerPos.z = 2.2;
            }
            return;
        }

        // --- 3. AUTO-FALL CHECK ---
        if (isEndgame && !this.isFalling) {
            // "Event Horizon" Pull - Starts ONLY after stepping off the edge
            // edgeZ is the Z coordinate of the border. negative Z is void.
            if (blackHolePos && edgeZ !== null) {
                // Buffer of 2 units past edge to verify intent
                if (playerPos.z < edgeZ - 2.0) {
                    this.isFalling = true;
                    this.velocity.y = 0;
                }
            }
            // B. Wall Glitch
            if (Math.abs(playerPos.x) > 3.0) {
                this.isFalling = true;
                this.velocity.y = 0;
            }
        }

        // --- 4. GRAVITY & FALLING ---
        if (this.isFalling) {
            // Check for Void Attraction (Endgame)
            let beingConsumed = false;

            if (isEndgame && blackHolePos) {
                const dist = playerPos.distanceTo(blackHolePos);
                beingConsumed = true; // We are in the void loop

                // Cinematic Pull Logic
                const pullDir = new THREE.Vector3().subVectors(blackHolePos, playerPos).normalize();

                // User Req: "make it a third of what is now"
                // Previous: 100 + 8000 / ...
                // New: 33 + 2666 / ...
                const attractionStrength = 33.0 + (2666.0 / (dist + 50));

                // Let's use Velocity for smoothness with high lerp
                this.velocity.lerp(pullDir.multiplyScalar(attractionStrength), timeStep * 3.3);

                playerPos.addScaledVector(this.velocity, timeStep);

                // RESET TRIGGER (Contact)
                if (dist < 10) {
                    if (!this.fadedOut) {
                        this.fadedOut = true;
                        console.log("PLAYER: CONSUMED BY VOID");
                        window.dispatchEvent(new CustomEvent('reset-simulation'));
                    }
                }
            }

            // Standard Gravity (if NOT being consumed by void logic, or fallback)
            if (!beingConsumed) {
                this.velocity.y -= 9.8 * timeStep;
                playerPos.y += this.velocity.y * timeStep;

                if (playerPos.y < -100 && !this.fadedOut) {
                    this.fadedOut = true;
                    window.dispatchEvent(new CustomEvent('reset-simulation'));
                }
            }
        }

        // --- 5. COLLISIONS (Walking) ---
        if (!this.isFalling) {
            const xLimit = isIntro ? 1.8 : 2.5;
            if (playerPos.x > xLimit) { playerPos.x = xLimit; this.velocity.x = 0; }
            if (playerPos.x < -xLimit) { playerPos.x = -xLimit; this.velocity.x = 0; }

            if (this.pillarPositions) {
                for (const pillar of this.pillarPositions) {
                    if (!pillar) continue;
                    const dx = Math.abs(playerPos.x - pillar.x);
                    const dz = Math.abs(playerPos.z - pillar.z);
                    const overlapX = 1.05 - dx; // 0.75 + 0.3
                    const overlapZ = 1.3 - dz;  // 1.0 + 0.3

                    if (overlapX > 0 && overlapZ > 0) {
                        if (overlapX < overlapZ) {
                            playerPos.x += (playerPos.x < pillar.x ? -overlapX : overlapX);
                            this.velocity.x = 0;
                        } else {
                            playerPos.z += (playerPos.z < pillar.z ? -overlapZ : overlapZ);
                            this.velocity.z = 0;
                        }
                    }
                }
            }
        }
    }

    updateMetrics(delta, interactables, blackHolePos) {
        const currentPos = this.controls.getObject().position;

        // Distance Tracker
        const dist = currentPos.distanceTo(this.metrics.lastPosition);
        if (dist > 0.001) {
            this.metrics.distanceTraveled += dist;
            this.metrics.totalDistance += dist;
            this.metrics.stationaryTime = 0;
            this.metrics.isStationary = false;
        } else {
            this.metrics.stationaryTime += delta;
            this.metrics.isStationary = true;
        }

        // Copy pos
        this.metrics.lastPosition.copy(currentPos);

        // Dist to Void (For Audio)
        if (blackHolePos) {
            this.metrics.distToVoid = currentPos.distanceTo(blackHolePos);
        } else {
            this.metrics.distToVoid = 99999; // Far away if no black hole
        }

        // GAZE TRACKING
        this.raycaster.setFromCamera(this.center, this.camera);
        // Only check against supplied interactable objects to save perf
        const intersects = this.raycaster.intersectObjects(interactables, false);

        if (intersects.length > 0) {
            const target = intersects[0].object;
            if (this.metrics.gazeTarget === target) {
                this.metrics.gazeDuration += delta;
            } else {
                this.metrics.gazeTarget = target;
                this.metrics.gazeDuration = 0;
            }
        } else {
            this.metrics.gazeTarget = null;
            this.metrics.gazeDuration = 0;
        }

        // [NEW] PSYCHOLOGICAL METRICS IMPLEMENTATION

        // 1. Rotation / Look-Back Tracking
        const currentYaw = this.controls.getObject().rotation.y;
        const deltaYaw = currentYaw - this.metrics.lastYaw;
        this.metrics.rotationSpeed = Math.abs(deltaYaw) / delta;
        this.metrics.lastYaw = currentYaw;

        // Detect rapid turns (Look back)
        if (this.metrics.rotationSpeed > 3.0) { // Threshold for fast turn
            this.metrics.lookBackCount += delta; // Accumulate "spin energy"
            this.metrics.isLookingBack = true;
        } else {
            this.metrics.lookBackCount = Math.max(0, this.metrics.lookBackCount - delta); // Decay
            this.metrics.isLookingBack = false;
        }

        // 2. Continuous Forward Movement
        // Only counting if moving forward AND not moving sideways/back
        if (this.moveForward && !this.moveBackward && !this.moveLeft && !this.moveRight) {
            this.metrics.continuousForwardTime += delta;
        } else {
            this.metrics.continuousForwardTime = 0;
        }

        // 3. Zone Tracking (Re-visitation)
        // Store integer Z position every 1 second
        if (!this._lastZoneCheck) this._lastZoneCheck = 0;
        this._lastZoneCheck += delta;

        if (this._lastZoneCheck > 1.0) {
            this._lastZoneCheck = 0;
            const zZone = Math.round(currentPos.z / 5) * 5; // 5-unit zones

            // Limit history to 20 entries (20 seconds)
            this.metrics.zoneHistory.push(zZone);
            if (this.metrics.zoneHistory.length > 20) {
                this.metrics.zoneHistory.shift();
            }
        }

        // 4. Last Action Timestamp
        if (!this.metrics.isStationary || this.metrics.rotationSpeed > 0.5) {
            this.metrics.lastActionTime = performance.now() / 1000;
        }

        // Bobbing (Head sway)
        if (!this.metrics.isStationary) {
            const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
            this.camera.position.y = 1.6 + Math.sin(this.metrics.totalDistance * 2.5) * 0.05 * (speed / this.moveSpeed);
        }
    }

    // Input handlers (call from Main)
    onKeyDown(event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW': this.moveForward = true; break;
            case 'ArrowLeft':
            case 'KeyA': this.moveLeft = true; break;
            case 'ArrowDown':
            case 'KeyS': this.moveBackward = true; break;
            case 'ArrowRight':
            case 'KeyD': this.moveRight = true; break;
        }
    }

    onKeyUp(event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW': this.moveForward = false; break;
            case 'ArrowLeft':
            case 'KeyA': this.moveLeft = false; break;
            case 'ArrowDown':
            case 'KeyS': this.moveBackward = false; break;
            case 'ArrowRight':
            case 'KeyD': this.moveRight = false; break;
        }
    }
}
