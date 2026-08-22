import * as THREE from '../three.module.js';

export class DrownManager {
    constructor(scene, camera, corridorGenerator, lightingManager) {
        this.scene = scene;
        this.camera = camera;
        this.corridor = corridorGenerator;
        this.lighting = lightingManager;

        // Configuration
        this.waterYStart = -3.0;
        this.waterRiseSpeed = 0.8 * 0.15; // Halved again (0.3 -> 0.15)
        this.wallDescendSpeed = 2.0 * 0.15 * 0.85; // Slowed by 15%
        this.floorSinkSpeed = 0.5 * 0.15; // Halved again (0.3 -> 0.15)
        this.floorSinkDelay = 10.0;

        // State
        this.active = false;
        this.timer = 0;
        this.waterMesh = null;
        this.isUnderwater = false;
        this.resetTriggered = false;
    }

    createWater() {
        // [WATER SURFACE]
        // Was a single flat quad with water.jpg tiled 20x. Two problems: the photo
        // is 6747x4460 and does not tile, and because the plane is centred on the
        // camera an even repeat count put a tile boundary exactly underneath the
        // player - the seam splitting the ocean down the middle of the screen.
        // A flat quad also cannot move, so the surface read as painted-on.
        //
        // It is now a subdivided plane displaced by summed sine waves in the vertex
        // shader, and shaded from that wave height rather than from a texture. No
        // texture means no seam and no tiling to hide, and the swell gives it motion.
        //
        // Size: drown fog is FogExp2 at 0.05, which is effectively opaque past ~40
        // units, so a 400-unit plane is far larger than anything that can be seen and
        // 200 segments still puts a vertex every 2 units where it matters.
        const geo = new THREE.PlaneGeometry(400, 400, 200, 200);

        const mat = new THREE.MeshBasicMaterial({
            color: 0xffffff, // colour comes from the shader below
            side: THREE.DoubleSide
        });

        this.waterUniforms = {
            uTime: { value: 0 },
            // Wave terms sum to ~1.34, so this is the peak-to-trough scale in world
            // units. Kept low deliberately: a dead-calm sheet with a slow swell.
            uAmp: { value: 0.25 }
        };

        mat.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = this.waterUniforms.uTime;
            shader.uniforms.uAmp = this.waterUniforms.uAmp;

            shader.vertexShader = `
                uniform float uTime;
                uniform float uAmp;
                varying float vWaveH;
                varying vec2 vSurf;

                // Plane is authored in XY and rotated -90deg about X, so local XY are
                // the horizontal axes and local Z becomes world up.
                //
                // Every wave travels along its own oblique direction. Axis-aligned
                // components (sin(x), sin(y)) line their crests up with the grid and
                // read as a lattice rather than as water.
                // Weighted toward long, slow swell: the low-frequency terms carry
                // nearly all the amplitude and the short ones are barely present, so
                // the surface breathes rather than chops. Overall scale is uAmp.
                float waveHeight(vec2 p, float t) {
                    float h = 0.0;
                    h += sin(dot(p, vec2( 0.98,  0.17)) * 0.055 + t * 0.28) * 0.55;
                    h += sin(dot(p, vec2(-0.28,  0.96)) * 0.042 - t * 0.22) * 0.48;
                    h += sin(dot(p, vec2( 0.71,  0.70)) * 0.090 + t * 0.35) * 0.20;
                    h += sin(dot(p, vec2( 0.60, -0.80)) * 0.150 - t * 0.45) * 0.075;
                    h += sin(dot(p, vec2(-0.87, -0.49)) * 0.240 + t * 0.60) * 0.035;
                    return h;
                }
            ` + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
                 vSurf = transformed.xy;
                 vWaveH = waveHeight(transformed.xy, uTime);
                 transformed.z += vWaveH * uAmp;`
            );

            shader.fragmentShader = `
                uniform float uTime;
                varying float vWaveH;
                varying vec2 vSurf;
            ` + shader.fragmentShader;

            // No map on this material, so map_fragment resolves to nothing - we use
            // its slot to author the surface colour directly.
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <map_fragment>',
                `// Near-black navy. The scene is lit only by a distant pyramid, so the
                 // surface should sit barely above the fog rather than glow.
                 vec3 deepCol  = vec3(0.0012, 0.0032, 0.0080);
                 vec3 crestCol = vec3(0.0045, 0.0105, 0.0210);

                 // Biased low: vWaveH is the raw wave sum (~ -1.34..1.34), and mapping
                 // the midpoint well below halfway keeps most of the sheet at deepCol
                 // with only the true crests lifting toward crestCol.
                 float crest = smoothstep(-0.5, 1.25, vWaveH);
                 vec3 surf = mix(deepCol, crestCol, crest);

                 // Fine detail between vertices. Summed oblique waves, never a product
                 // of sin(x) and sin(y) - that separates into an exact checkerboard.
                 float chop = sin(dot(vSurf, vec2( 0.87,  0.49)) * 0.85 + uTime * 0.75)
                            + sin(dot(vSurf, vec2(-0.42,  0.91)) * 1.30 - uTime * 0.55)
                            + sin(dot(vSurf, vec2( 0.63, -0.78)) * 1.90 + uTime * 0.95);
                 surf += chop * 0.0007;

                 // A faint lift on the highest crests - the only light left out here.
                 surf += smoothstep(1.05, 1.32, vWaveH) * 0.005;

                 diffuseColor.rgb *= surf;`
            );
        };

        // onBeforeCompile is not part of the program cache key, so give this material
        // its own key - otherwise it could share a compiled program with an ordinary
        // unlit material and silently lose the wave code.
        mat.customProgramCacheKey = () => 'drown-water-v1';

        this.waterMesh = new THREE.Mesh(geo, mat);
        this.waterMesh.rotation.x = -Math.PI / 2;
        this.waterMesh.position.y = this.waterYStart;
        this.waterMesh.visible = false;

        this.scene.add(this.waterMesh);
    }

    setAudio(bgMusic) {
        this.bgMusic = bgMusic;
    }

    createSun() {
        const tex = new THREE.TextureLoader().load('textures/pyramid.jpg');
        // Pyramid: Radius 120, Height 250, 4 Radial Segments (Square base)
        const geo = new THREE.ConeGeometry(120, 250, 4);
        const mat = new THREE.MeshBasicMaterial({
            map: tex,
            color: 0xffffff,
            fog: false // Bright star, not affected by fog
        });
        this.sunMesh = new THREE.Mesh(geo, mat);

        this.scene.add(this.sunMesh);
        this.sunMesh.visible = false;
    }

    start() {
        if (this.active) return;
        this.active = true;
        this.timer = 0;
        this.isUnderwater = false;
        this.shakeActive = true;
        this.lastShakeOffset = null;

        this.handleMusicStart();

        if (!this.waterMesh) this.createWater();
        if (!this.sunMesh) this.createSun();

        // Position water
        this.waterMesh.position.x = this.camera.position.x;
        this.waterMesh.position.z = this.camera.position.z;
        this.waterMesh.position.y = this.waterYStart;
        this.waterMesh.visible = true;

        // Position Sun (High up, far away)
        this.sunMesh.position.x = this.camera.position.x;
        this.sunMesh.position.z = this.camera.position.z - 500; // Far ahead
        this.sunMesh.position.y = 200; // High in sky
        this.sunMesh.visible = true;

        // No longer hiding immediately. Handled in Update for animation.


        // Adjust Fog to "Tight Fog" requested by user
        if (this.scene.fog) {
            this._originalFog = this.scene.fog.clone();
            this.scene.fog.color.setHex(0x050510);
            this.scene.fog.density = 0.05;
        }

        console.log("SYS: Drown Ending Started");
    }

    handleMusicStart() {
        // ... (unchanged logic, just ensuring context)
        // 1. Fade OUT BG Music
        if (this.bgMusic) {
            this._fadeOutInterval = setInterval(() => {
                if (this.bgMusic.volume > 0.01) {
                    this.bgMusic.volume -= 0.01;
                } else {
                    this.bgMusic.volume = 0;
                    this.bgMusic.pause();
                    clearInterval(this._fadeOutInterval);
                }
            }, 100);
        }

        // 2. Start Kyrie
        if (!this.drownMusic) {
            this.drownMusic = new Audio('audio/Kyrie Eleyson- Ukrainian Orthodox Chant of the XV Century by Kyiv Chamber Choir.mp3');
            this.drownMusic.loop = false;
        }

        this.drownMusic.volume = 0;
        this.drownMusic.currentTime = 0;
        this.drownMusic.play().catch(e => console.warn("Drown music blocked", e));

        // Fade IN Miserere
        this._fadeInInterval = setInterval(() => {
            if (this.drownMusic.volume < 0.5) {
                this.drownMusic.volume = Math.min(0.5, this.drownMusic.volume + 0.005);
            } else {
                clearInterval(this._fadeInInterval);
            }
        }, 100);
    }

    update(delta) {
        if (!this.active) return;
        this.timer += delta;

        // 1. Water Rising
        this.waterMesh.position.y += this.waterRiseSpeed * delta;

        // Drive the swell
        if (this.waterUniforms) this.waterUniforms.uTime.value += delta;

        // 2. Walls Descending (Immediate)
        // Access chunks via corridor generator
        this.corridor.chunks.forEach(chunk => {
            chunk.children.forEach(child => {
                if (child.name === "ceiling_left") {
                    // Split Left (Persist indefinitely)
                    child.position.y += 0.264 * delta; // 0.66 * 0.4
                    child.position.x -= 0.664 * delta; // 1.66 * 0.4
                    child.rotation.z += 0.0132 * delta; // 0.033 * 0.4
                } else if (child.name === "ceiling_right") {
                    // Split Right (Persist indefinitely)
                    child.position.y += 0.264 * delta;
                    child.position.x += 0.664 * delta;
                    child.rotation.z -= 0.0132 * delta;
                } else if (child.name === "wall" || child.name === "pillar") {
                    child.position.y -= this.wallDescendSpeed * delta;
                }
                // Floor Sinking (Delayed)
                if (this.timer > this.floorSinkDelay) {
                    if (child.name === "floor") {
                        child.position.y -= this.floorSinkSpeed * delta;
                    }
                }
            });
        });

        // Lamps are pooled on the scene rather than parented to the chunks, so they
        // are no longer reachable by child name above - sink them explicitly.
        if (this.lighting && this.lighting.descend) {
            this.lighting.descend(this.wallDescendSpeed * delta);
        }

        // 3. Screen Shake (Crumbling Columns)
        if (this.shakeActive) {
            // Remove previous frame's offset first to reset base position
            if (this.lastShakeOffset) {
                this.camera.position.sub(this.lastShakeOffset);
                this.lastShakeOffset = null;
            }

            // Duration check (Extended to 30s per User Request for slower columns)
            if (this.timer < 30.0) {
                const intensity = 0.02; // Softer Shake
                const shakeX = (Math.random() - 0.5) * intensity;
                const shakeY = (Math.random() - 0.5) * intensity;
                const shakeZ = (Math.random() - 0.5) * intensity;

                this.lastShakeOffset = new THREE.Vector3(shakeX, shakeY, shakeZ);
                this.camera.position.add(this.lastShakeOffset);
            } else {
                this.shakeActive = false; // Stop shaking
            }
        }

        // 4. Underwater Check
        const camY = this.camera.position.y;
        const waterY = this.waterMesh.position.y;

        if (camY < waterY && !this.isUnderwater) {
            this.enterUnderwater();
        }

        if (this.isUnderwater && this.points) {
            // Animate Bubbles
            // Since they are children of camera, Y+ is 'Up' relative to camera view.
            // Player view is locked horizontal-ish, so Y+ is screen up.
            const positions = this.points.geometry.attributes.position.array;
            const speeds = this.points.geometry.attributes.speed.array;

            for (let i = 0; i < positions.length / 3; i++) {
                // Y is index + 1
                positions[i * 3 + 1] += speeds[i] * delta; // Move Up

                // Reset if too high (camera Y view space is approx -10 to +10)
                if (positions[i * 3 + 1] > 10) {
                    positions[i * 3 + 1] = -10;
                    // Randomize X/Z again
                    positions[i * 3] = (Math.random() - 0.5) * 20;
                    positions[i * 3 + 2] = (Math.random() - 0.5) * 20 - 5;
                }
            }
            this.points.geometry.attributes.position.needsUpdate = true;

            // Darken fog rapidly until pitch black
            const densityRate = 0.5 * delta;
            this.scene.fog.density += densityRate;

            // Optional: Fade out ambient light
            if (this.lighting.ambientLight) {
                this.lighting.ambientLight.intensity = Math.max(0, this.lighting.ambientLight.intensity - delta);
            }

            // CHECK DEATH
            if (this.scene.fog.density > 2.0) { // Very thick fog = blind
                this.triggerReset();
            }
        }
    }

    createBubbles() {
        // Particles moving Up relative to Camera
        const count = 200;
        const geo = new THREE.BufferGeometry();
        const pos = [];
        const speeds = [];

        for (let i = 0; i < count; i++) {
            // Random box around camera
            const x = (Math.random() - 0.5) * 20;
            const y = (Math.random() - 0.5) * 20;
            const z = (Math.random() - 0.5) * 20 - 5; // Mostly in front
            pos.push(x, y, z);
            speeds.push(1.0 + Math.random() * 2.0); // Upward speed
        }

        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('speed', new THREE.Float32BufferAttribute(speeds, 1));

        // Simple Circle Texture via Canvas (No external file needed)
        const canvas = document.createElement('canvas');
        canvas.width = 32; canvas.height = 32;
        const ctx = canvas.getContext('2d');
        ctx.beginPath();
        ctx.arc(16, 16, 14, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fill();
        const tex = new THREE.CanvasTexture(canvas);

        const mat = new THREE.PointsMaterial({
            color: 0xaaccff,
            size: 0.2,
            map: tex,
            transparent: true,
            opacity: 0.6,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.points = new THREE.Points(geo, mat);
        this.camera.add(this.points); // Attach to camera so they travel with us (relative motion simulated)
        // Actually, if we attach to camera, 'up' is relative to camera rotation.
        // Better: Attach to scene, but keep respawning them near camera.
        // Let's try camera attachment for simple effect first, but player is locked looking forward so it works.
        this.points.visible = false;
    }

    enterUnderwater() {
        this.isUnderwater = true;
        console.log("SYS: Player Submerged");

        // 1. Fog
        this.scene.fog.color.setHex(0x000510);

        // 2. HTML Overlay
        const overlay = document.getElementById('underwater-overlay');
        if (overlay) overlay.classList.add('active');

        // 3. Bubbles
        if (!this.points) this.createBubbles();
        if (this.points) this.points.visible = true;
    }

    triggerReset() {
        if (this.resetTriggered) return;
        this.resetTriggered = true;

        console.log("SYS: Drown Ending - Fading to Black (10s)");

        // Transition Layer (Use existing fade-overlay)
        const overlay = document.getElementById('fade-overlay');
        if (overlay) {
            overlay.style.transition = "opacity 10s ease-in";
            overlay.style.opacity = "1";
            overlay.classList.add('active'); // Just in case class has props
        }

        // HIDDEN MESSAGE: "LOOK"
        setTimeout(() => {
            const msg = document.getElementById('death-message');
            if (msg) {
                msg.innerText = "LOOK";
                msg.classList.add('active');
            }
        }, 2000);

        setTimeout(() => {
            const msg = document.getElementById('death-message');
            if (msg) {
                msg.classList.remove('active');
            }
        }, 9000);

        // Trigger Ending Event instead of direct reload (Delayed)
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('ending-triggered', { detail: { type: 'LOOK' } }));
        }, 10000);

        // Fallback reload is handled by Main.js listener if not True Ending

        // Fade Out Drown Music (if playing)
        if (this.drownMusic && !this.drownMusic.paused) {
            const fadeStep = this.drownMusic.volume / 80; // Fade over ~8s (80 * 100ms)
            const fadeInterval = setInterval(() => {
                if (this.drownMusic.volume > fadeStep) {
                    this.drownMusic.volume -= fadeStep;
                } else {
                    this.drownMusic.volume = 0;
                    this.drownMusic.pause();
                    clearInterval(fadeInterval);
                }
            }, 100);
        }
    }

    reset() {
        this.active = false;
        this.timer = 0;
        this.isUnderwater = false;
        this.resetTriggered = false;

        // Clean up shake
        if (this.shakeActive && this.lastShakeOffset) {
            this.camera.position.sub(this.lastShakeOffset);
        }
        this.shakeActive = false;
        this.lastShakeOffset = null;

        if (this.waterMesh) {
            this.waterMesh.visible = false;
            this.waterMesh.position.y = this.waterYStart;
        }

        if (this.sunMesh) {
            this.sunMesh.visible = false;
        }

        // Restore Fog
        if (this.scene.fog && this._originalFog) {
            this.scene.fog.color.copy(this._originalFog.color);
            this.scene.fog.density = this._originalFog.density;
        }

        // Stop music intervals
        if (this._fadeOutInterval) clearInterval(this._fadeOutInterval);
        if (this._fadeInInterval) clearInterval(this._fadeInInterval);

        // Stop Drown Music
        if (this.drownMusic) {
            this.drownMusic.pause();
            this.drownMusic.currentTime = 0;
        }

        // Note: Main.js logic handles restarting BG music
    }
}
