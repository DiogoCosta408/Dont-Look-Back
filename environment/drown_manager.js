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
    }

    createWater() {
        // ... (unchanged)
        const textureLoader = new THREE.TextureLoader();
        const waterTexture = textureLoader.load('textures/water.jpg');
        waterTexture.wrapS = THREE.RepeatWrapping;
        waterTexture.wrapT = THREE.RepeatWrapping;
        waterTexture.repeat.set(20, 20);

        // Large plane for infinite water
        const geo = new THREE.PlaneGeometry(2000, 2000);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x051022,
            map: waterTexture,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide
        });

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

        // 2. Walls Descending (Immediate)
        // Access chunks via corridor generator
        this.corridor.chunks.forEach(chunk => {
            chunk.children.forEach(child => {
                if (child.name === "ceiling_left") {
                    // Split Left (Disappear after 3s)
                    if (this.timer < 3.0) {
                        child.position.y += 0.264 * delta; // 0.66 * 0.4
                        child.position.x -= 0.664 * delta; // 1.66 * 0.4
                        child.rotation.z += 0.0132 * delta; // 0.033 * 0.4
                    } else {
                        child.visible = false;
                    }
                } else if (child.name === "ceiling_right") {
                    // Split Right (Disappear after 3s)
                    if (this.timer < 3.0) {
                        child.position.y += 0.264 * delta;
                        child.position.x += 0.664 * delta;
                        child.rotation.z -= 0.0132 * delta;
                    } else {
                        child.visible = false;
                    }
                } else if (child.name === "wall" || child.name === "pillar" || child.name === "light_fixture" || child.name === "light_source") {
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

        if (this.isUnderwater) {
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

    enterUnderwater() {
        this.isUnderwater = true;
        console.log("SYS: Player Submerged");

        // Change fog to underwater color (Deep Foggy Blue)
        this.scene.fog.color.setHex(0x000510); // Very deep blue, almost black but blue tinted
        // Trigger sound effect via system if possible, or just visual focus here
    }

    triggerReset() {
        // Reload page to reset game (Hard Reset as requested for "Game Over")
        location.reload();
    }

    reset() {
        this.active = false;
        this.timer = 0;
        this.isUnderwater = false;

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
