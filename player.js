import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { MovementController } from './player_modules/MovementController.js';
import { CameraController } from './player_modules/CameraController.js';
import { MetricsManager } from './player_modules/MetricsManager.js';

export class Player {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;

        // [EULER ORDER - IMPORTANT]
        // PointerLockControls composes and decomposes orientation with a YXZ Euler,
        // but Object3D defaults to XYZ. Under XYZ, camera.rotation.z is NOT roll once
        // you are yawed away from forward: it holds atan2(-sin(yaw)*sin(pitch), cos(yaw)),
        // a decomposition artifact. Our roll effects (sway / shake / inversion) wrote
        // small values into that slot, which does not tilt the camera by that amount -
        // it REPLACES the artifact, tilting the horizon by however far the artifact had
        // drifted. Yaw and pitch survive; the horizon does not. With 12 deg of pitch the
        // real roll reached 13 deg at a quarter turn, 40 deg at 75 deg, and a full flip
        // past 90 deg - i.e. the view rolled further the further you turned back, which
        // is why running backwards to the mirage door was the worst case.
        // Matching the order makes .z an honest local roll.
        camera.rotation.order = 'YXZ';

        // [CONTROLS]
        this.controls = new PointerLockControls(camera, domElement);

        // Keep pitch a hair off the poles. YXZ decomposition is degenerate at exactly
        // +/-90 deg pitch (yaw and roll collapse), which would snap the view sideways
        // if a roll effect was active while looking straight up or down.
        this.controls.minPolarAngle = 0.01;
        this.controls.maxPolarAngle = Math.PI - 0.01;

        this.setupEventListeners();

        // [MODULES]
        this.movement = new MovementController(camera, domElement);
        this.movement.init(this.controls);

        this.cameraController = new CameraController(camera);
        this.metricsManager = new MetricsManager(camera);
    }

    get metrics() {
        return this.metricsManager.metrics;
    }

    setupEventListeners() {
        this.domElement.addEventListener('click', () => {
            this.controls.lock();
        });
    }

    update(delta, interactables = [], pillarPositions = [], pFactor = 0, isEndgame = false, blackHolePos = null, edgeZ = null, isIntro = false, mirageZ = null, roomColliders = null) {
        if (!this.controls.isLocked) return;

        // [VIEW LOCK Constraint]
        if (this.viewLocked) {
            // Restrict Yaw (Rotation Y) to narrow forward window or Lock entirely
            // Corridor direction is -Z. Player should face -Z.
            // Yaw of 0 is -Z. PI is +Z (Back).
            // Let's Clamp rotation.y between -PI/2 and PI/2 (-90 to +90 deg)
            // Object rotation is accumulated from mouse movement.

            const obj = this.controls.getObject();
            // Normalize angle
            let y = obj.rotation.y;

            // Clamp to Front 180 degrees (-PI/2 to PI/2)
            if (y > Math.PI / 2) y = Math.PI / 2;
            if (y < -Math.PI / 2) y = -Math.PI / 2;

            obj.rotation.y = y;
        }

        // 1. Movement & Physics
        this.movement.update(delta, isEndgame, blackHolePos, edgeZ, isIntro, pillarPositions, mirageZ, roomColliders);

        // 2. Behavior Tracking
        const inputs = {
            moveForward: this.movement.moveForward,
            moveBackward: this.movement.moveBackward,
            moveLeft: this.movement.moveLeft,
            moveRight: this.movement.moveRight
        };

        this.metricsManager.update(
            delta,
            this.controls.getObject().position,
            interactables,
            blackHolePos,
            inputs
        );

        // 3. Environment & Camera Effects
        // Update Distortions
        this.cameraController.update(
            delta,
            pFactor,
            this.movement.isFalling,
            this.movement.velocity,
            this.movement.moveSpeed,
            this.metrics.totalDistance
        );

        // Apply Head Bobbing
        this.cameraController.applyBobbing(
            this.movement.velocity,
            this.movement.moveSpeed,
            this.metrics.totalDistance,
            this.metrics.isStationary
        );
    }

    // Input handlers (call from Main)
    onKeyDown(event) {
        this.movement.onKeyDown(event.code);
    }

    onKeyUp(event) {
        this.movement.onKeyUp(event.code);
    }

    setMobilized(state) {
        this.movement.enabled = state;
    }

    setViewLocked(state) {
        this.viewLocked = state;
    }
}
