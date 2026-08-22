import * as THREE from '../three.module.js';

// [LAMP POOL]
// Point lights are pooled. After init they are NEVER added to the scene, removed
// from it, or had `.visible` toggled - only repositioned and re-intensified.
//
// Why this matters: three.js bakes the point-light count into the shader source as
// a #define (NUM_POINT_LIGHTS) and folds it into the program cache key. Changing
// the count bumps lights.state.version, which sets needsProgramChange on every lit
// material, so the renderer compiles and links a brand new program for each one -
// synchronously, mid-frame. The corridor used to create 2-3 PointLights per chunk
// and drop 2-3 more on cleanup, so every corridor spawn paid a full shader rebuild
// of the whole scene. That was the half-second freeze.
//
// Hiding a light is no cheaper: WebGLRenderer.projectObject returns early on
// `object.visible === false`, so an invisible light leaves the count too. Unused
// lamps are therefore parked at intensity 0 and left visible.
//
// Size: chunks alive = (renderDistance 80 + cleanup margin 40) / chunkSize 20 = 6,
// plus one transient chunk during a spawn = 7; at most 3 pillars (spacing 8 across
// a 20-long chunk) carry a lamp = 21. 24 leaves headroom.
const LAMP_POOL_SIZE = 24;

export class LightingManager {
    constructor(scene) {
        this.scene = scene;
        this.forceBlackout = false;

        // Active lamp lights only. Public API - environment.js exposes this.
        this.lights = [];

        const texLoader = new THREE.TextureLoader();
        const glassTex = texLoader.load('textures/corridor_lamp.png');

        this.materials = {
            lightEmissive: new THREE.MeshStandardMaterial({
                map: glassTex,
                emissiveMap: glassTex,
                color: 0xffaa00,
                emissive: 0xffaa00,
                emissiveIntensity: 2.0,
                roughness: 0.2,
                metalness: 0.5,
                transparent: true,
                opacity: 0.6,
                side: THREE.FrontSide
            })
        };

        // One shared fixture geometry for every lamp.
        this.fixtureGeometry = new THREE.BoxGeometry(0.2, 1.5, 0.2);

        this.lamps = [];
        this.freeLamps = [];
        this._warnedExhausted = false;

        this.initPool();
    }

    initPool() {
        for (let i = 0; i < LAMP_POOL_SIZE; i++) {
            // Per-lamp material clone so a single lamp can flicker on its own.
            // Cloned once here rather than once per chunk, as it used to be.
            const material = this.materials.lightEmissive.clone();

            const mesh = new THREE.Mesh(this.fixtureGeometry, material);
            mesh.name = 'light_fixture';
            mesh.visible = false;
            this.scene.add(mesh);

            const light = new THREE.PointLight(0xffaa00, 0, 12);
            light.name = 'light_source';
            light.userData.mesh = mesh;
            light.userData.originalIntensity = 0;
            this.scene.add(light); // added once, never removed, never hidden

            const lamp = { light, mesh, material, owner: null };
            light.userData.lamp = lamp;

            this.lamps.push(lamp);
            this.freeLamps.push(lamp);
        }
    }

    // Claim a parked lamp for `owner` (the chunk group it belongs to).
    // Positions are WORLD space: lamps live on the scene, not inside the chunk,
    // so that removing a chunk cannot change the light count.
    acquire(owner, lightPos, meshPos, intensity) {
        const lamp = this.freeLamps.pop();

        if (!lamp) {
            if (!this._warnedExhausted) {
                console.warn('LIGHTING: lamp pool exhausted (' + LAMP_POOL_SIZE + ') - raise LAMP_POOL_SIZE.');
                this._warnedExhausted = true;
            }
            return null;
        }

        lamp.owner = owner;

        lamp.light.position.copy(lightPos);
        lamp.light.intensity = intensity;
        lamp.light.userData.originalIntensity = intensity;

        lamp.mesh.position.copy(meshPos);
        lamp.mesh.visible = true;
        lamp.material.emissiveIntensity = 2.0;
        lamp.material.color.setHex(0xffaa00);
        lamp.material.emissive.setHex(0xffaa00);

        this.lights.push(lamp.light);
        return lamp;
    }

    release(lamp) {
        if (!lamp.owner) return;

        lamp.owner = null;
        lamp.light.intensity = 0;
        lamp.light.userData.originalIntensity = 0;
        lamp.mesh.visible = false;

        const idx = this.lights.indexOf(lamp.light);
        if (idx > -1) this.lights.splice(idx, 1);

        this.freeLamps.push(lamp);
    }

    releaseChunk(owner) {
        for (const lamp of this.lamps) {
            if (lamp.owner === owner) this.release(lamp);
        }
    }

    releaseAll() {
        for (const lamp of this.lamps) this.release(lamp);
    }

    // Drown ending: lamps are no longer children of the chunk groups, so the
    // DrownManager sinks them through here instead of by child name.
    descend(distance) {
        for (const lamp of this.lamps) {
            if (!lamp.owner) continue;
            lamp.light.position.y -= distance;
            lamp.mesh.position.y -= distance;
        }
    }

    update(delta) {
        if (this.forceBlackout) {
            this.lights.forEach(light => {
                light.intensity = 0;
                if (light.userData.mesh) light.userData.mesh.visible = false;
            });
            return;
        }

        // Continuous restoration of lights
        this.lights.forEach(light => {
            if (light.userData.originalIntensity) {
                // Smoothly return to original intensity
                light.intensity = THREE.MathUtils.lerp(light.intensity, light.userData.originalIntensity, delta * 5.0);

                // Restore Mesh Emissive
                if (light.userData.mesh) {
                    const mesh = light.userData.mesh;
                    const mat = mesh.material;

                    if (light.intensity > 0.05) mesh.visible = true;

                    // target emissive intensity 2, color 0xffaa00
                    mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, 2.0, delta * 5.0);
                    mat.color.lerp(new THREE.Color(0xffaa00), delta * 5.0);
                    mat.emissive.lerp(new THREE.Color(0xffaa00), delta * 5.0);
                }
            }
        });
    }

    flickerLights() {
        if (this.forceBlackout) return;

        // Aggressively dim or boost lights
        this.lights.forEach(light => {
            if (Math.random() < 0.3) { // 30% of lights affected per call
                // Random intensity
                const mult = Math.random() < 0.5 ? 0.0 : (0.1 + Math.random() * 1.1); // 50% chance of FULL BLACK

                light.intensity = light.userData.originalIntensity * mult;

                // Update Mesh
                if (light.userData.mesh) {
                    const mesh = light.userData.mesh;
                    const mat = mesh.material;
                    if (mult < 0.05) {
                        // TURN BLACK - HIDE MESH
                        mesh.visible = false;
                        mat.emissiveIntensity = 0;
                    } else {
                        // Dim
                        mesh.visible = true;
                        mat.emissiveIntensity = 2.0 * mult;
                    }
                }
            }
        });
    }

    toggleBackLights(playerPositionZ, state) {
        // Intensity, never `.visible` - see the pool note at the top of this file.
        for (const lamp of this.lamps) {
            if (!lamp.owner) continue;

            const isBehind = lamp.light.position.z > playerPositionZ + 5;
            const off = isBehind && state;

            lamp.light.intensity = off ? 0 : lamp.light.userData.originalIntensity;
            lamp.mesh.visible = !off;
        }
    }
}
