import * as THREE from '../three.module.js';

export class CameraController {
    constructor(camera) {
        this.camera = camera;
        this.baseFOV = 75;
        this.swayTime = 0;

        this.fovSurge = { active: false, timer: 0 };
        this.externalShake = 0;

        // Roll (radians) requested by other systems (e.g. FacilitySystem's camera
        // inversion). Routed through here so this class is the ONLY writer of
        // camera.rotation.z - two writers per frame used to fight each other.
        this.externalRoll = 0;
    }

    reset() {
        this.swayTime = 0;
        this.fovSurge.active = false;
        this.fovSurge.timer = 0;
        this.externalShake = 0;
        this.externalRoll = 0;

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
        // Roll jitter only. The old code also nudged camera.position.x/y here and
        // never subtracted the nudge again, so the camera random-walked sideways
        // for as long as the shake lasted (invisible per frame, ~25cm over 20s).
        if (this.externalShake > 0) {
            totalRotZ += (Math.random() - 0.5) * this.externalShake * 0.5;
        }

        // 4. EXTERNAL ROLL (Camera Inversion / Twist events)
        totalRotZ += this.externalRoll;

        // Written unconditionally. camera.rotation uses YXZ order (set in Player),
        // so .z is a pure local roll that cannot bleed into yaw/pitch. The old
        // `Math.abs(camera.rotation.z) < 0.5` guard existed to paper over the
        // default XYZ order, where .z held a decomposition artifact rather than roll.
        this.camera.rotation.z = totalRotZ;
    }

    setShake(intensity) {
        this.externalShake = intensity;
    }

    setExternalRoll(angle) {
        this.externalRoll = angle;
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
