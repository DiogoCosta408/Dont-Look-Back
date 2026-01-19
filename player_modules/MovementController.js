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

    update(delta, isEndgame, blackHolePos, edgeZ, isIntro = false, pillarPositions = []) {
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

        // --- 3. AUTO-FALL CHECK ---
        if (isEndgame && !this.isFalling) {
            if (blackHolePos && edgeZ !== null) {
                // INCREASED RANGE: Triple the pull distance (User Request: 24 -> 72)
                if (playerPos.z < edgeZ + 72.0) {
                    const distToEdge = Math.max(0, playerPos.z - edgeZ);
                    if (playerPos.z < edgeZ - 2.0) {
                        this.isFalling = true;
                        this.velocity.y = 0;
                    } else {
                        const pullDir = new THREE.Vector3().subVectors(blackHolePos, playerPos).normalize();
                        // Scale proximity: 0 at 72 units away, 1 at edge
                        const proximityFactor = 1.0 - (distToEdge / 72.0);
                        if (proximityFactor > 0) {
                            const dragForce = 15.0 * proximityFactor;
                            this.velocity.addScaledVector(pullDir, dragForce * timeStep);
                        }
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

                if (dist < 10 && !this.fadedOut) {
                    this.fadedOut = true;
                    console.log("PLAYER: CONSUMED BY VOID");
                    window.dispatchEvent(new CustomEvent('reset-simulation'));
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
