import * as THREE from '../three.module.js';

export class EndgameManager {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.active = false;

        this.blackHole = null;
        this.halo = null;
        this.starGlowMat = null;
        this.distantSun = null;

        this.endgameTargetZ = null;
        this.corridorEndZ = null;
    }

    enter() {
        if (this.active) return;
        this.active = true;
        this.scene.fog = null; // Clear fog
        this.createDistantSun();
    }

    createDistantSun() {
        const geometry = new THREE.SphereGeometry(20, 32, 32);
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff }); // Fully White
        const sun = new THREE.Mesh(geometry, material);
        this.scene.add(sun);
        this.distantSun = sun;
    }

    update(playerPos, lastChunkZ = 0, suppressShield = false) {
        // Initialization if not ready
        if (!this.blackHole && !this.endgameTargetZ) {

            // Determine setup positions
            // If passed lastChunkZ, usage:
            let startZ = lastChunkZ;
            // In original code it checked chunks list. We rely on caller to pass valid startZ or fallback to playerPos.z
            if (lastChunkZ === 0) startZ = playerPos.z;

            this.endgameTargetZ = startZ - 200;
            this.corridorEndZ = startZ;

            this.createBlackHole();
            this.blackHole.position.set(0, 0, this.endgameTargetZ);

            this.createCorridorBorder(startZ);
            this.createStarTunnel(startZ, this.endgameTargetZ);

            if (this.distantSun) {
                this.distantSun.position.set(2000, 500, this.endgameTargetZ - 4000);
            }

            // [VOID SAFEGUARD]
            // Only create shield if NOT suppressed (i.e. not Drown Ending)
            if (!suppressShield) {
                this.createVoidShield(startZ, this.endgameTargetZ);
            }
        }

        // Pulse Halo
        if (this.halo) {
            const time = performance.now() / 1000;
            const scale = 160 + Math.sin(time) * 5;
            this.halo.scale.set(scale, scale, 1);
        }

        // Update Shader Uniform
        if (this.starGlowMat && this.blackHole) {
            this.starGlowMat.uniforms.viewVector.value.subVectors(this.camera.position, this.blackHole.position);
        }
    }

    createCorridorBorder(zPos) {
        const width = 6;
        const height = 5;
        const thickness = 0.5;
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });

        const bottom = new THREE.Mesh(new THREE.PlaneGeometry(width, thickness), material);
        bottom.position.set(0, 0.05, zPos);
        bottom.rotation.x = -Math.PI / 2;
        this.scene.add(bottom);

        const top = new THREE.Mesh(new THREE.PlaneGeometry(width, thickness), material);
        top.position.set(0, height - 0.05, zPos);
        top.rotation.x = Math.PI / 2;
        this.scene.add(top);

        const left = new THREE.Mesh(new THREE.PlaneGeometry(thickness, height), material);
        left.position.set(-width / 2 + 0.05, height / 2, zPos);
        left.rotation.y = Math.PI / 2;
        this.scene.add(left);

        const right = new THREE.Mesh(new THREE.PlaneGeometry(thickness, height), material);
        right.position.set(width / 2 - 0.05, height / 2, zPos);
        right.rotation.y = -Math.PI / 2;
        this.scene.add(right);
    }

    createStarTunnel(startZ, endZ) {
        // Cosmos Background
        const cosmosTex = new THREE.TextureLoader().load('textures/cosmos.jpg');
        const bgSphere = new THREE.Mesh(
            new THREE.SphereGeometry(4000, 32, 32),
            new THREE.MeshBasicMaterial({ map: cosmosTex, side: THREE.BackSide, color: 0xaaaaaa, fog: false })
        );
        bgSphere.position.set(0, 0, endZ);
        this.scene.add(bgSphere);

        // Tunnel Stars
        const vertices = [];
        for (let i = 0; i < 50000; i++) {
            const theta = Math.random() * Math.PI * 2;
            const r = 80 + Math.random() * 800; // Tunnel clear radius > 80
            const x = r * Math.cos(theta);
            const y = r * Math.sin(theta);

            const zMin = endZ - 2000;
            const zMax = startZ - 5;
            const z = zMin + Math.random() * (zMax - zMin);

            vertices.push(x, y, z);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const material = new THREE.PointsMaterial({
            color: 0xffffff, size: 0.6, transparent: true, opacity: 1.0, sizeAttenuation: true, fog: false
        });
        const stars = new THREE.Points(geometry, material);
        stars.frustumCulled = false;
        this.scene.add(stars);
    }

    createVoidShield(starStartZ, farEndZ) {
        // 1. The "Mask" at the start of the Void (corridorEndZ)
        // Solid black wall with a hole for the corridor path.
        const shape = new THREE.Shape();
        const size = 5000;
        // Outer Square
        shape.moveTo(-size, -size);
        shape.lineTo(size, -size);
        shape.lineTo(size, size);
        shape.lineTo(-size, size);
        shape.lineTo(-size, -size);

        // Inner Hole (The Corridor / Tunnel entry)
        // Corridor is roughly 6x5.
        // Let's do a square hole 8x8 to be safe.
        const hole = new THREE.Path();
        const hSize = 5;
        hole.moveTo(-hSize, -hSize);
        hole.lineTo(hSize, -hSize);
        hole.lineTo(hSize, hSize);
        hole.lineTo(-hSize, hSize);
        hole.lineTo(-hSize, -hSize);
        shape.holes.push(hole);

        const maskGeo = new THREE.ShapeGeometry(shape);
        const blackMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });

        const mask = new THREE.Mesh(maskGeo, blackMat);
        mask.position.set(0, 0, starStartZ - 1.0); // Just behind the transition line
        this.scene.add(mask);
    }

    createBlackHole() {
        const geometry = new THREE.SphereGeometry(45, 64, 64);
        const material = new THREE.MeshBasicMaterial({ color: 0x000000 });
        this.blackHole = new THREE.Mesh(geometry, material);
        this.blackHole.position.set(0, 0, 0);
        this.scene.add(this.blackHole);

        // Halo/Accretion Disk attached to black hole
        const diskGeo = new THREE.RingGeometry(48, 60, 64);
        const diskMat = new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.1
        });
        const disk = new THREE.Mesh(diskGeo, diskMat);
        // disk.rotation.x = Math.PI / 2; // Keep it flat or facing? Facing camera
        this.blackHole.add(disk);

        // --- RESTORED SUN/STAR VISUALS ---

        const vertexShader = `
            varying vec3 vNormal;
            varying vec3 vWorldPosition;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
        `;
        const fragmentShader = `
            uniform vec3 viewVector;
            varying vec3 vNormal;
            varying vec3 vWorldPosition;
            void main() {
                float intensity = pow(0.6 - dot(vNormal, vec3(0, 0, 1.0)), 4.0);
                gl_FragColor = vec4(1.0, 0.8, 0.6, 1.0) * intensity * 2.0;
            }
        `;

        this.starGlowMat = new THREE.ShaderMaterial({
            uniforms: { viewVector: { value: new THREE.Vector3(0, 0, 0) } },
            vertexShader, fragmentShader,
            side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true
        });

        // Create Glow Mesh (The Big Star Halo)
        // Was 48 radius, let's keep it or adjust if "Big Star" means the sprite
        const starGlow = new THREE.Mesh(new THREE.SphereGeometry(48, 64, 64), this.starGlowMat);
        starGlow.position.set(0, 0, -1);
        this.blackHole.add(starGlow);

        // Sun Sprite (The bright core)
        const glowTex = this.createGlowTexture();

        const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowTex, color: 0xffaa00, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
        }));
        sunSprite.scale.set(280, 280, 1);
        starGlow.add(sunSprite);
    }
    // The closing brace below was misplaced in the original code, it should not be here.
    // It seems to have been intended to close createBlackHole, but was after the commented out code.
    // Removing it to fix the class structure.
    // }

    createGlowTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(255, 255, 255, 1)');
        g.addColorStop(0.3, 'rgba(255, 255, 255, 0.4)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(canvas);
    }
}
