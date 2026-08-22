import * as THREE from './three.module.js';

import { LightingManager } from './environment/lighting_manager.js';
import { CorridorGenerator } from './environment/corridor_generator.js';
import { IntroRoom } from './environment/intro_room.js';
import { EndgameManager } from './environment/endgame_manager.js';
import { EffectsManager } from './environment/effects_manager.js';
import { DrownManager } from './environment/drown_manager.js';

export class FacilityGenerator {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        // Sub-Managers
        this.lighting = new LightingManager(scene);
        this.corridor = new CorridorGenerator(scene, this.lighting);
        this.intro = new IntroRoom(scene);
        this.endgame = new EndgameManager(scene, camera);
        this.effects = new EffectsManager(scene);
        this.drownManager = new DrownManager(scene, camera, this.corridor, this.lighting);

        // State Flags
        this.stopGeneration = false;
        this.isEndgame = false;

        this.bgMusic = null;

        // Initialize (Intro only)
        // Main.js calls startIntro -> createIntroRoom
        // But constructor runs before startIntro.
        // Original code: createIntroRoom call NOT in constructor.
        // so we don't call it here.
        // BUT we created drift/mirage?
        // Mirage is created in EffectsManager constructor.

        // [DARKNESS LOOP]
        this.mirage = new IntroRoom(scene); // Secondary Intro Room

        console.log("ENV: Modular Generator Initialized.");
    }

    setAudio(bgMusic) {
        this.bgMusic = bgMusic;
        if (this.drownManager) {
            this.drownManager.setAudio(bgMusic);
        }
    }

    // --- PROXY PROPERTIES (Compatibility) ---

    // Player needs these for collision/interaction
    get pillarPositions() {
        return this.corridor.pillarPositions;
    }

    get lights() {
        return this.lighting.lights;
    }

    // Furniture colliders for whichever room the player is standing in. Intro and
    // mirage are never both live, so the first one with a built room wins.
    getRoomColliders() {
        if (this.intro && this.intro.roomGroup) return this.intro.getColliders();
        if (this.mirage && this.mirage.roomGroup) return this.mirage.getColliders();
        return null;
    }

    // Aggregates interactables from all sources
    get interactables() {
        return [
            ...this.corridor.interactables,
            ...this.intro.interactables,
            ...this.mirage.interactables // Include Mirage interactables
        ];
    }

    // FacilitySystem controls this
    set forceBlackout(value) {
        this.lighting.forceBlackout = value;
    }
    get forceBlackout() {
        return this.lighting.forceBlackout;
    }

    get blackHole() {
        return this.endgame.blackHole;
    }

    get corridorEndZ() {
        return this.endgame.corridorEndZ;
    }

    // --- API METHODS ---

    createInitialCorridor() {
        this.corridor.createInitialCorridor();
    }

    createIntroRoom() {
        if (!this.intro.roomGroup) {
            this.intro.create(new THREE.Vector3(0, 0, 4));
        }
    }

    destroyIntroRoom() {
        this.intro.destroy();
    }

    // [DARKNESS LOOP API]
    createMirageRoom(z, backEndingCount = 0) {
        if (!this.mirage.roomGroup) {
            // Updated to pass false for autoStartClock, true for isMirage
            this.mirage.create(new THREE.Vector3(0, 0, z), false, true, backEndingCount);
            console.log(`ENV: Created Mirage Room at Z=${z} (Clock Paused, Black Shell, BackCount=${backEndingCount})`);
        }
    }

    startMirageClock() {
        if (this.mirage.roomGroup) {
            this.mirage.startClock();
        }
    }

    promoteMirageToIntro() {
        if (this.mirage.roomGroup) {
            // Destroy old intro
            this.intro.destroy();

            // Promote Mirage
            this.intro = this.mirage;
            console.log("ENV: Promoted Mirage to Intro Room");

            // Reset Mirage slot
            this.mirage = new IntroRoom(this.scene);
        }
    }

    destroyMirageRoom() {
        this.mirage.destroy();
    }

    setDriftIntensity(intensity) {
        this.corridor.setDriftIntensity(intensity);
    }

    flickerLights(chainChance = 0) {
        this.lighting.flickerLights(chainChance);
    }

    toggleBackLights(z, state) {
        this.lighting.toggleBackLights(z, state);
    }

    updateLights(delta) {
        this.lighting.update(delta);
    }

    updateIntroTick(delta) {
        this.intro.update(delta);
    }

    // Events (Effects mirror)
    showMirage(z) { this.effects.showMirage(z); }
    hideMirage() { this.effects.hideMirage(); }
    updateMirageEffect() { this.effects.updateMirage(); }

    enterEndgame() {
        if (this.isEndgame) return;
        this.isEndgame = true;
        this.stopGeneration = true;
        this.endgame.enter();

        // Cleanup Intro if still exists (usually gone by now but safe to ensure)
        this.intro.destroy();
        this.mirage.destroy();
    }

    enterDrownEnding() {
        this.stopGeneration = true; // Prevent new chunks appearing from sky
        this.drownManager.start();
    }

    reset() {
        this.stopGeneration = false;
        this.isEndgame = false;
        this.drownManager.reset();
        // Add other environment resets if needed
    }

    // --- MAIN UPDATE LOOP ---

    update(playerZ, delta) {
        if (delta === undefined || isNaN(delta)) delta = 0.016;

        // 1. Lighting (Always update)
        this.lighting.update(delta);

        // 2. Intro Room (Mainly clock & flicker)
        this.intro.update(delta);
        this.mirage.update(delta); // Update Mirage Room too

        // 3. Effects (Mirage)
        // Explicitly called by system via updateMirageEffect

        // 3B. Drown Ending
        this.drownManager.update(delta);

        // [FIX] If Drown Ending active, DO NOT run Void/Endgame logic (prevents Void Shield overlap)
        // REVERT: This blocked Black Hole/Stars too. We need to pass a context flag instead.
        const drownActive = (this.drownManager.active);

        // 4. Endgame Logic
        if (this.stopGeneration || this.isEndgame) {
            let lastZ = 0;
            if (this.corridor.chunks.length > 0) {
                // lastZ should be the EDGE (End) of the chunk, not the center.
                // Chunk is at center `position.z`. extends +/- chunkSize/2
                // Since we are moving into negative Z, the "End" is position.z - (chunkSize/2)
                const lastChunk = this.corridor.chunks[this.corridor.chunks.length - 1];
                lastZ = lastChunk.position.z - (this.corridor.chunkSize / 2);
            }

            // Pass drownActive context to prevent Void Shield but allow Background
            this.endgame.update({ z: playerZ }, lastZ, drownActive);
            this.corridor.cleanupChunks(playerZ);
            return;
        }

        // 5. Corridor Generation
        if (!this.stopGeneration) {
            this.corridor.update(playerZ);

            // Check if we should destroy Intro Room (if player moved far enough)
            if (playerZ < -10 && this.intro.roomGroup) {
                this.intro.destroy();
            }
        }
    }
}
