import * as THREE from '../three.module.js';

export class MetricsManager {
    constructor(camera) {
        this.camera = camera;

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
            rotationSpeed: 0,
            distToVoid: 99999
        };

        this.raycaster = new THREE.Raycaster();
        this.center = new THREE.Vector2(0, 0);
        this._lastZoneCheck = 0;
    }

    update(delta, currentPos, interactables, blackHolePos, inputs) {
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

        // Dist to Void
        if (blackHolePos) {
            this.metrics.distToVoid = currentPos.distanceTo(blackHolePos);
        } else {
            this.metrics.distToVoid = 99999;
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

        // PSYCHOLOGICAL METRICS

        // 1. Rotation / Look-Back Tracking
        // We need the rotation Y from the camera (or controller object)
        // Since we don't own the object, we assume camera.rotation.y is synced or use camera parent.
        // Actually, Player.js used: this.controls.getObject().rotation.y
        // We don't have controls here. But the camera IS the object being rotated if controls are PointerLockControls attached to camera? 
        // PointerLockControls usually rotates the camera directly.
        // So camera.rotation.y SHOULD be correct? 
        // Wait, PointerLockControls rotates the CAMERA if passed as first arg. 
        // Let's verify if Player.js passed (camera, domElement). Yes.
        // So camera.rotation is valid Y? 
        // PointerLockControls uses Euler order YXZ.
        // Player.js used `this.controls.getObject().rotation.y`. 
        // `controls.getObject()` usually returns the camera.

        const currentYaw = this.camera.rotation.y;
        // Note: Check if rotation.y has accumulated or if it's quaternion based. 
        // PointerLockControls accumulation is usually safe to read from .rotation.

        const deltaYaw = currentYaw - this.metrics.lastYaw;
        this.metrics.rotationSpeed = Math.abs(deltaYaw) / delta;
        this.metrics.lastYaw = currentYaw;

        // Detect rapid turns (Look back)
        if (this.metrics.rotationSpeed > 3.0) {
            this.metrics.lookBackCount += delta;
            this.metrics.isLookingBack = true;
        } else {
            this.metrics.lookBackCount = Math.max(0, this.metrics.lookBackCount - delta);
            this.metrics.isLookingBack = false;
        }

        // 2. Continuous Forward Movement
        // Allow strafing (Left/Right) provided Forward is held and Back is not.
        if (inputs.moveForward && !inputs.moveBackward) {
            this.metrics.continuousForwardTime += delta;
        } else {
            this.metrics.continuousForwardTime = 0;
        }

        // 3. Zone Tracking
        this._lastZoneCheck += delta;

        if (this._lastZoneCheck > 1.0) {
            this._lastZoneCheck = 0;
            const zZone = Math.round(currentPos.z / 5) * 5;

            this.metrics.zoneHistory.push(zZone);
            if (this.metrics.zoneHistory.length > 20) {
                this.metrics.zoneHistory.shift();
            }
        }

        // 4. Last Action Timestamp
        if (!this.metrics.isStationary || this.metrics.rotationSpeed > 0.5) {
            this.metrics.lastActionTime = performance.now() / 1000;
        }
    }
}
