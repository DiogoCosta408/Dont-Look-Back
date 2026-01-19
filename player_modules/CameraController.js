import * as THREE from '../three.module.js';

export class CameraController {
    constructor(camera) {
        this.camera = camera;
        this.baseFOV = 75;
        this.swayTime = 0;

        this.fovSurge = { active: false, timer: 0 };
        this.externalShake = 0;
    }

    reset() {
        this.swayTime = 0;
        this.fovSurge.active = false;
        this.fovSurge.timer = 0;
        this.externalShake = 0;

        // Force Camera Reset
        this.camera.rotation.z = 0;
        this.camera.fov = this.baseFOV;
        this.camera.updateProjectionMatrix();
    }

    update(delta, pFactor, isFalling, velocity, moveSpeed, totalDistance) {
        // PER USER REQUEST: No distortions in Endgame/Space
        if (isFalling) return;

        // Note: Even at pFactor 0, we run to ensure we reset rotations/FOV to base.

        this.swayTime += delta;

        // 1. FOV BREATHING

        // Trigger Surge at High Paranoia
        if (pFactor > 0.8 && !this.fovSurge.active) {
            if (Math.random() < 0.005) { // Occasional burst
                this.fovSurge.active = true;
                this.fovSurge.timer = 2.0 + Math.random() * 2.0; // 2-4 seconds
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

        // Base Sway
        let totalRotZ = sway;

        // 3. EXTERNAL SHAKE (Look Back / Trauma)
        if (this.externalShake > 0) {
            const s = this.externalShake;
            // Random jitter
            totalRotZ += (Math.random() - 0.5) * s * 0.5;
            // Also apply slight XY offset for violent shake?
            this.camera.position.x += (Math.random() - 0.5) * s * 0.05;
            this.camera.position.y += (Math.random() - 0.5) * s * 0.05;
        }

        // Only apply if there's actual paranoia/sway (Allows free cam otherwise)
        if ((pFactor > 0.01 || this.externalShake > 0) && Math.abs(this.camera.rotation.z) < 0.5) {
            this.camera.rotation.z = totalRotZ;
        }
    }

    setShake(intensity) {
        this.externalShake = intensity;
    }

    // Moved Bobbing Logic here as well? 
    // In Player.js it was inside updateMetrics?? 
    // "Bobbing (Head sway)" comment was at the end of updateMetrics in Player.js
    // Let's adhere to "visuals -> CameraController".

    applyBobbing(velocity, moveSpeed, totalDistance, isStationary) {
        if (!isStationary) {
            // Speed magnitude (X/Z only)
            const speed = Math.sqrt(velocity.x ** 2 + velocity.z ** 2);
            this.camera.position.y = 1.6 + Math.sin(totalDistance * 2.5) * 0.05 * (speed / moveSpeed);
        }
    }
}
