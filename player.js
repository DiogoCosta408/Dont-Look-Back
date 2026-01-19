import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { MovementController } from './player_modules/MovementController.js';
import { CameraController } from './player_modules/CameraController.js';
import { MetricsManager } from './player_modules/MetricsManager.js';

export class Player {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;

        // [CONTROLS]
        this.controls = new PointerLockControls(camera, domElement);
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

    update(delta, interactables = [], pillarPositions = [], pFactor = 0, isEndgame = false, blackHolePos = null, edgeZ = null, isIntro = false) {
        if (!this.controls.isLocked) return;

        // 1. Movement & Physics
        this.movement.update(delta, isEndgame, blackHolePos, edgeZ, isIntro, pillarPositions);

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
}
