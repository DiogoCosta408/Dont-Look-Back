import * as THREE from './three.module.js';

import { LightingManager } from './environment/lighting_manager.js';
import { CorridorGenerator } from './environment/corridor_generator.js';
import { IntroRoom } from './environment/intro_room.js';
import { EndgameManager } from './environment/endgame_manager.js';
import { EffectsManager } from './environment/effects_manager.js';

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

        // State Flags
        this.stopGeneration = false;
        this.isEndgame = false;

        // Initialize (Intro only)
        // Main.js calls startIntro -> createIntroRoom
        // But constructor runs before startIntro.
        // Original code: createIntroRoom call NOT in constructor.
        // so we don't call it here.
        // BUT we created drift/mirage?
        // Mirage is created in EffectsManager constructor.

        console.log("ENV: Modular Generator Initialized.");
    }

    // --- PROXY PROPERTIES (Compatibility) ---

    // Player needs these for collision/interaction
    get pillarPositions() {
        return this.corridor.pillarPositions;
    }

    get lights() {
        return this.lighting.lights;
    }

    // Aggregates interactables from all sources
    get interactables() {
        return [
            ...this.corridor.interactables,
            ...this.intro.interactables
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
            this.intro.create();
        }
    }

    destroyIntroRoom() {
        this.intro.destroy();
    }

    setDriftIntensity(intensity) {
        this.corridor.setDriftIntensity(intensity);
    }

    flickerLights() {
        this.lighting.flickerLights();
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
    }

    // --- MAIN UPDATE LOOP ---

    update(playerZ, delta) {
        if (delta === undefined || isNaN(delta)) delta = 0.016;

        // 1. Lighting (Always update)
        this.lighting.update(delta);

        // 2. Intro Room (Mainly clock & flicker)
        this.intro.update(delta);

        // 3. Effects (Mirage)
        // Explicitly called by system via updateMirageEffect

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

            this.endgame.update({ z: playerZ }, lastZ);
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
