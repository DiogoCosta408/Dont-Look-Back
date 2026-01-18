import * as THREE from '../three.module.js';

export class LightingManager {
    constructor(scene) {
        this.scene = scene;
        this.lights = [];
        this.forceBlackout = false;

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
    }

    registerLight(light, mesh = null) {
        if (mesh) {
            light.userData.mesh = mesh;
        }
        // Ensure starting intensity is saved
        if (light.userData.originalIntensity === undefined) {
            light.userData.originalIntensity = light.intensity;
        }

        this.lights.push(light);
        if (light.parent === null) {
            this.scene.add(light);
        }
    }

    createLightFixture(roomWidth, roomHeight, zPos, dX2) {
        // Light fixture on pillar (Right Side, Right Pillar)
        const lightGeo = new THREE.BoxGeometry(0.2, 1.5, 0.2);
        // CLONE material so we can flicker this specific light box without affecting others
        const uniqueMaterial = this.materials.lightEmissive.clone();
        const lightMesh = new THREE.Mesh(lightGeo, uniqueMaterial);

        // Return mesh and relative position data for the caller to add to scene/group
        // Caller (Corridor) handles positioning relative to parent, but we can return the expected world offset or local
        // Actually, the original code added it to the `parentGroup` which was the chunk corridor.

        // Let's return the objects to be added
        return { mesh: lightMesh, material: uniqueMaterial };
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
        this.lights.forEach(light => {
            // Check if light is actively in scene (or child of active chunk)
            // The original checked (!light.parent) but `removeLightsInChunk` filtered the list.
            // Here `lights` should only contain active lights.

            const lightWorldPos = new THREE.Vector3();
            light.getWorldPosition(lightWorldPos);

            if (lightWorldPos.z > playerPositionZ + 5) {
                // Light is behind player
                light.visible = !state;
            } else {
                // Light is ahead/near player - ALWAYS ON
                light.visible = true;
            }
        });
    }

    removeLightsInChunk(chunk) {
        // We need to remove lights that belong to this chunk.
        // The lights were added to the chunk group in generating.
        // So checking if light.parent is the chunk or a child of chunk.

        // Actually, in `generateCorridorChunk`, `pointLight` is added to `parentGroup` (the chunk).

        this.lights = this.lights.filter(l => {
            // If the light's parent involves the removed chunk, discard it.
            // Since we just removed the chunk from scene, light.parent might still be the chunk object
            // but validation is tricky.

            // Easier: Check if l.parent is null (if removed from scene?)
            // Or check if l is a descendant of chunk.

            let isDescendant = false;
            chunk.traverse(c => {
                if (c === l) isDescendant = true;
            });
            return !isDescendant;
        });
    }
}
