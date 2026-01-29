import * as THREE from '../three.module.js';

export class MovementController {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;

        // Use the controls passed from Player or create them here? 
        // Player.js currently creates new PointerLockControls(camera, domElement)
        // Let's keep controls here if possible, or pass them in. 
        // Better to own controls here for "Movement".

        // WAIT: Player.js logic uses this.controls.getObject().position
        // So we need access to controls.
    }

    init(controls) {
        this.controls = controls;

        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();

        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;

        this.moveSpeed = 4.0;
        this.friction = 5.0;
        this.acceleration = 30.0;

        this.isFalling = false;
        this.enabled = true;
    }

    update(delta, isEndgame, blackHolePos, edgeZ, isIntro = false, pillarPositions = [], mirageZ = null) {
        // Clamp delta
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

        if (!this.isFalling && this.enabled) {
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

        // [MIRAGE ROOM COLLISION]
        if (typeof mirageZ === 'number') {
            // Intro Center is 4.0. Mirage Center is mirageZ. Offset = mirageZ - 4.0.
            // Bounds Map:
            // Back Wall: 5.8 -> 5.8 + (mirageZ - 4.0) = mirageZ + 1.8
            // Side Wall: +/- 1.8 (Unchanged in Width)
            // Door Z: 2.2 -> 2.2 + (mirageZ - 4.0) = mirageZ - 1.8

            const backWallZ = mirageZ + 1.8;
            const doorZ = mirageZ - 1.8;

            if (playerPos.z > backWallZ) playerPos.z = backWallZ;
            if (playerPos.x > 1.8) playerPos.x = 1.8;
            if (playerPos.x < -1.8) playerPos.x = -1.8;

            if (playerPos.z < doorZ) {
                // If trying to walk out the door, constrain X (door frame)
                if (Math.abs(playerPos.x) > 0.6) playerPos.z = doorZ;
            }
            // Do NOT return here if we want standard corridor physics to apply partially? 
            // In Intro we return to skip regular walking limits?
            // "Regular walking" limits x to 2.5 (line 175). Mirage/Intro is narrower (1.8).
            // So we should return to avoid overriding or being overridden.
            // Intro logic returns, so we return too.
            return;
        }

        // --- 3. AUTO-FALL CHECK ---
        if (isEndgame && !this.isFalling) {
            if (blackHolePos && edgeZ !== null) {
                // INCREASED RANGE: Triple the pull distance (User Request: 24 -> 72)
                if (playerPos.z < edgeZ + 72.0) {
                    // EVENT HORIZON: Constant Pull (No escape)
                    if (playerPos.z < edgeZ - 2.0) {
                        this.isFalling = true;
                        this.velocity.y = 0;
                    } else {
                        const pullDir = new THREE.Vector3().subVectors(blackHolePos, playerPos).normalize();

                        // Constant Force (User Req: "Constant speed", "Cannot run from it")
                        // Friction is 5.0. Need force > 20 to overpower walking (accel 30).
                        // Let's set a dominant constant pull.
                        const constantPull = 25.0;

                        this.velocity.addScaledVector(pullDir, constantPull * timeStep);
                    }
                }
            }
            if (Math.abs(playerPos.x) > 3.0) {
                this.isFalling = true;
                this.velocity.y = 0;
            }
        }

        // --- 4. GRAVITY & FALLING ---
        if (this.isFalling) {
            let beingConsumed = false;

            if (isEndgame && blackHolePos) {
                const dist = playerPos.distanceTo(blackHolePos);
                beingConsumed = true;

                const pullDir = new THREE.Vector3().subVectors(blackHolePos, playerPos).normalize();
                const attractionStrength = 33.0 + (2666.0 / (dist + 50));

                this.velocity.lerp(pullDir.multiplyScalar(attractionStrength), timeStep * 3.3);
                playerPos.addScaledVector(this.velocity, timeStep);

                // [BLACK HOLE TRANSITION]
                // Radius is 45. Start fade at 100. Solid black at 50.
                const fadeStart = 100;
                const fadeEnd = 50;

                if (dist < fadeStart) {
                    const overlay = document.getElementById('fade-overlay');
                    if (overlay) {
                        // Map dist [100 -> 50] to opacity [0 -> 1]
                        let opacity = 1.0 - ((dist - fadeEnd) / (fadeStart - fadeEnd));
                        opacity = Math.max(0, Math.min(1, opacity));
                        overlay.style.opacity = opacity;
                        overlay.style.transition = 'none'; // Instant update based on distance
                    }
                }

                if (dist < 48 && !this.fadedOut) { // Trigger just before hitting the 45 radius shell
                    this.fadedOut = true;
                    console.log("PLAYER: CONSUMED BY VOID (10s Wait)");

                    // Show "DON'T" after 2s
                    setTimeout(() => {
                        const msg = document.getElementById('death-message');
                        if (msg) {
                            msg.innerText = "DON'T";
                            msg.classList.add('active');
                        }
                    }, 2000);

                    // Delayed Reset -> Trigger Ending
                    setTimeout(() => {
                        const msg = document.getElementById('death-message');
                        if (msg) {
                            msg.classList.remove('active');
                            setTimeout(() => msg.innerText = "", 2000);
                        }
                        // Trigger DON'T Ending
                        window.dispatchEvent(new CustomEvent('ending-triggered', { detail: { type: 'DON\'T' } }));
                    }, 10000);
                }
            }

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

            if (pillarPositions) {
                for (const pillar of pillarPositions) {
                    if (!pillar) continue;
                    const dx = Math.abs(playerPos.x - pillar.x);
                    const dz = Math.abs(playerPos.z - pillar.z);
                    const overlapX = 1.05 - dx;
                    const overlapZ = 1.3 - dz;

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

    onKeyDown(code) {
        switch (code) {
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

    onKeyUp(code) {
        switch (code) {
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

    // Accessors
    getObject() {
        return this.controls.getObject();
    }
}
