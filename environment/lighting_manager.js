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

// [FLICKER BURST]
// A flicker is a STROBE, not a dip: the affected lamps snap hard off and on
// several times over a fraction of a second, then settle back lit. Intensity is
// set directly (no lerp) while a burst runs, otherwise the smooth restore in
// update() would round the edges off into a fade.
// Timings are deliberately uneven so it reads as bad wiring rather than a clean
// square wave: dropouts are short and sharp, recoveries are longer and ragged,
// and a recovery sometimes comes back at a sagged voltage before catching properly.
const FLICKER_BURST_MIN = 0.12;  // shortest burst, seconds
const FLICKER_BURST_MAX = 0.45;
const FLICKER_OFF_MIN = 0.015;   // a dropout is brief
const FLICKER_OFF_MAX = 0.055;
const FLICKER_ON_MIN = 0.025;    // the recovery between dropouts is longer, and varies more
const FLICKER_ON_MAX = 0.120;
const FLICKER_SAG_CHANCE = 0.35; // chance a mid-burst recovery is a brownout, not full
const FLICKER_SAG_MIN = 0.20;    // brownout level, as a fraction of the lamp's normal output
const FLICKER_SAG_MAX = 0.60;
const FLICKER_LAMP_SHARE = 0.35; // fraction of live lamps caught in a burst
const FLICKER_CHAIN_DECAY = 0.6; // each chained burst is less likely than the last

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

        // Active flicker burst. See flickerLights() / _updateFlicker().
        this.flicker = {
            active: false,
            timer: 0,
            duration: 0,
            toggleTimer: 0,
            lit: true,
            chainChance: 0,
            lamps: []
        };

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

            const lamp = { light, mesh, material, owner: null, flickering: false };
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

        // A chunk can be culled mid-burst; drop the lamp out of it cleanly.
        if (lamp.flickering) {
            lamp.flickering = false;
            const fIdx = this.flicker.lamps.indexOf(lamp);
            if (fIdx > -1) this.flicker.lamps.splice(fIdx, 1);
        }

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
            this.cancelFlicker();
            this.lights.forEach(light => {
                light.intensity = 0;
                if (light.userData.mesh) light.userData.mesh.visible = false;
            });
            return;
        }

        // Continuous restoration of lights.
        // Lamps inside a flicker burst are skipped: the burst drives them directly
        // so the off/on edges stay hard instead of being lerped into a fade.
        this.lights.forEach(light => {
            if (light.userData.lamp && light.userData.lamp.flickering) return;

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

        this._updateFlicker(delta);
    }

    // Start a flicker burst: a handful of lamps cut out and come back several
    // times in quick succession, like a bad connection arcing.
    //
    // chainChance is the probability that another burst fires the instant this one
    // settles, and it decays with each link so a chain always terminates. The caller
    // scales it with paranoia: at low paranoia it is 0, so a flicker happens once
    // and is over; high paranoia is what makes them come one after another.
    flickerLights(chainChance = 0) {
        if (this.forceBlackout) return;

        // Never restart a burst on top of a running one - that would clip the
        // rhythm and, at high paranoia, smear into a continuous strobe.
        if (this.flicker.active) return;

        const burst = this.flicker;
        burst.lamps.length = 0;

        for (const lamp of this.lamps) {
            if (lamp.owner && Math.random() < FLICKER_LAMP_SHARE) {
                lamp.flickering = true;
                burst.lamps.push(lamp);
            }
        }

        if (burst.lamps.length === 0) return;

        burst.active = true;
        burst.timer = 0;
        burst.duration = FLICKER_BURST_MIN + Math.random() * (FLICKER_BURST_MAX - FLICKER_BURST_MIN);
        burst.chainChance = chainChance;

        // Open on a dropout so the burst starts on the noticeable edge.
        this._setBurstLevel(0);
        burst.lit = false;
        burst.toggleTimer = FLICKER_OFF_MIN + Math.random() * (FLICKER_OFF_MAX - FLICKER_OFF_MIN);
    }

    // level is a fraction of each lamp's normal output: 0 = dead, 1 = full.
    _setBurstLevel(level) {
        const on = level > 0.01;

        for (const lamp of this.flicker.lamps) {
            lamp.light.intensity = lamp.light.userData.originalIntensity * level;
            lamp.mesh.visible = on;
            lamp.material.emissiveIntensity = on ? 2.0 * level : 0;
        }
    }

    _updateFlicker(delta) {
        const burst = this.flicker;
        if (!burst.active) return;

        burst.timer += delta;
        burst.toggleTimer -= delta;

        if (burst.toggleTimer <= 0) {
            burst.lit = !burst.lit;

            if (burst.lit) {
                // Coming back - sometimes only partway, as if the voltage is sagging.
                const level = Math.random() < FLICKER_SAG_CHANCE
                    ? FLICKER_SAG_MIN + Math.random() * (FLICKER_SAG_MAX - FLICKER_SAG_MIN)
                    : 1.0;
                this._setBurstLevel(level);
                burst.toggleTimer = FLICKER_ON_MIN + Math.random() * (FLICKER_ON_MAX - FLICKER_ON_MIN);
            } else {
                this._setBurstLevel(0);
                burst.toggleTimer = FLICKER_OFF_MIN + Math.random() * (FLICKER_OFF_MAX - FLICKER_OFF_MIN);
            }
        }

        if (burst.timer < burst.duration) return;

        // Settle: always end fully lit, and hand the lamps back to the smooth
        // restore path in update().
        this._setBurstLevel(1.0);
        for (const lamp of burst.lamps) lamp.flickering = false;
        burst.lamps.length = 0;
        burst.active = false;

        if (Math.random() < burst.chainChance) {
            this.flickerLights(burst.chainChance * FLICKER_CHAIN_DECAY);
        }
    }

    cancelFlicker() {
        const burst = this.flicker;
        if (!burst.active) return;

        for (const lamp of burst.lamps) lamp.flickering = false;
        burst.lamps.length = 0;
        burst.active = false;
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
