import * as THREE from '../three.module.js';

export class CorridorGenerator {
    constructor(scene, lightingManager) {
        this.scene = scene;
        this.lightingManager = lightingManager;

        this.chunks = [];
        this.interactables = [];
        this.pillarPositions = [];

        this.chunkSize = 20;
        this.renderDistance = 80;
        this.zOffset = 0; // Tracks the "front" of the world

        this.drift = {
            loopCount: 0,
            heightOffset: 0,
            lightDimming: 0,
            pillarOffset: 0
        };

        this.corridorWidth = 6;

        this.materials = {
            floor: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0.3 }),
            wall: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 }),
            ceiling: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 })
        };

        // [SHARED GEOMETRY]
        // Built once and reused by every chunk. Previously each chunk allocated its
        // own floor, ceiling, wall and pillar geometry, so every spawn pushed fresh
        // buffers to the GPU and left the old ones undisposed. Chunk height drifts,
        // so the two height-dependent shapes are unit-height and scaled per mesh -
        // scaling costs nothing and keeps a single buffer on the GPU.
        this.geometries = {
            floor: new THREE.PlaneGeometry(this.corridorWidth, this.chunkSize),
            ceilingHalf: new THREE.PlaneGeometry(this.corridorWidth / 2, this.chunkSize),
            wall: new THREE.BoxGeometry(1, 1, this.chunkSize),
            pillar: new THREE.BoxGeometry(1.5, 1, 2)
        };

        // Scratch vectors so lamp placement does not allocate per pillar.
        this._lampLightPos = new THREE.Vector3();
        this._lampMeshPos = new THREE.Vector3();
    }

    setDriftIntensity(intensity) {
        // 0.0 to 1.0
        this.drift.pillarOffset = intensity * 1.5;
    }

    createInitialCorridor() {
        this.chunkLength = this.chunkSize;
        this.generateChunk(0);
        this.zOffset -= this.chunkSize;
        this.generateChunk(this.zOffset);
        this.zOffset -= this.chunkSize;
    }

    update(playerZ) {
        const distToEdge = Math.abs(playerZ - this.zOffset);

        if (distToEdge < this.renderDistance) {
            this.generateChunk(this.zOffset);
            this.zOffset -= this.chunkSize;
            this.cleanupChunks(playerZ);
        }
    }

    generateChunk(zStart) {
        // UPDATE DRIFT (Cumulative)
        this.drift.loopCount++;
        // Slight randomness added to drift each chunk
        this.drift.heightOffset += (Math.random() - 0.5) * 0.1; // +/- 0.05 per chunk
        this.drift.heightOffset = THREE.MathUtils.clamp(this.drift.heightOffset, -1.0, 1.5); // Clamp

        this.drift.lightDimming += (Math.random() - 0.3) * 0.1; // Bias towards dimming
        this.drift.lightDimming = THREE.MathUtils.clamp(this.drift.lightDimming, -0.5, 0.8);

        this.drift.pillarOffset += (Math.random() - 0.5) * 0.2;
        this.drift.pillarOffset = THREE.MathUtils.clamp(this.drift.pillarOffset, -1.0, 1.0);

        const length = this.chunkSize;
        const width = this.corridorWidth;
        const height = 5 + this.drift.heightOffset; // Apply drift

        // Group to hold this section
        const corridor = new THREE.Group();

        // Floor
        const floor = new THREE.Mesh(this.geometries.floor, this.materials.floor);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        floor.name = "floor"; // ID for Drown Manager
        corridor.add(floor);

        // Ceiling (Split for Drown Ending Effect)

        // Left Ceiling
        const ceilingL = new THREE.Mesh(this.geometries.ceilingHalf, this.materials.ceiling);
        ceilingL.position.set(-width / 4, height, 0); // Offset left
        ceilingL.rotation.x = Math.PI / 2;
        ceilingL.receiveShadow = true;
        ceilingL.name = "ceiling_left";
        corridor.add(ceilingL);

        // Right Ceiling
        const ceilingR = new THREE.Mesh(this.geometries.ceilingHalf, this.materials.ceiling);
        ceilingR.position.set(width / 4, height, 0); // Offset right
        ceilingR.rotation.x = Math.PI / 2;
        ceilingR.receiveShadow = true;
        ceilingR.name = "ceiling_right";
        corridor.add(ceilingR);

        // Walls (unit-height geometry, scaled to this chunk's drifted height)
        const leftWall = new THREE.Mesh(this.geometries.wall, this.materials.wall);
        leftWall.scale.y = height;
        leftWall.position.set(-width / 2 - 0.5, height / 2, 0);
        leftWall.receiveShadow = true;
        leftWall.name = "wall";
        corridor.add(leftWall);

        const rightWall = leftWall.clone();
        rightWall.position.set(width / 2 + 0.5, height / 2, 0);
        rightWall.name = "wall";
        corridor.add(rightWall);

        // Pillars/Supports (Repetitive elements)
        const chunkWorldZ = zStart - length / 2; // Chunk center world position

        // Fixed: Rigid grid alignment (Spacing 8)
        const spacing = 8;
        const chunkStartWorld = chunkWorldZ - length / 2;

        let alignBase = Math.ceil(chunkStartWorld / spacing) * spacing;

        // Loop through global Zs
        for (let gZ = alignBase; gZ < chunkStartWorld + length; gZ += spacing) {
            const localZ = gZ - chunkWorldZ;
            this.createPillar(corridor, width, height, localZ, chunkWorldZ);
        }

        // Position
        corridor.position.z = zStart - length / 2; // centered
        this.scene.add(corridor);
        this.chunks.push(corridor);

        // Add to interactables for gaze tracking
        this.interactables.push(leftWall, rightWall);
    }

    createPillar(parentGroup, roomWidth, roomHeight, zPos, chunkWorldZ) {
        const pillarMat = this.materials.wall;

        // DRIFT CALCULATION (Random jitter)
        const dX1 = (Math.random() - 0.5) * this.drift.pillarOffset;
        const dRot1 = (Math.random() - 0.5) * (this.drift.pillarOffset * 0.5);

        const dX2 = (Math.random() - 0.5) * this.drift.pillarOffset;
        const dRot2 = (Math.random() - 0.5) * (this.drift.pillarOffset * 0.5);

        // Z-Drift (Paranoia spacing funkiness)
        const dZ1 = (Math.random() - 0.5) * this.drift.pillarOffset;
        const dZ2 = (Math.random() - 0.5) * this.drift.pillarOffset;

        // Left Pillar (unit-height geometry, scaled to this chunk's drifted height)
        const leftPillar = new THREE.Mesh(this.geometries.pillar, pillarMat);
        leftPillar.scale.y = roomHeight;
        leftPillar.position.set(-roomWidth / 2 + 0.5 + dX1, roomHeight / 2, zPos + dZ1);
        leftPillar.rotation.y = dRot1;
        leftPillar.name = "pillar";
        parentGroup.add(leftPillar);
        this.interactables.push(leftPillar);

        // Right Pillar
        const rightPillar = leftPillar.clone();
        rightPillar.position.set(roomWidth / 2 - 0.5 + dX2, roomHeight / 2, zPos + dZ2);
        rightPillar.rotation.y = dRot2;
        rightPillar.name = "pillar";
        parentGroup.add(rightPillar);
        this.interactables.push(rightPillar);

        // Store world positions for collision
        const worldZ1 = (zPos + dZ1) + chunkWorldZ;
        const worldZ2 = (zPos + dZ2) + chunkWorldZ;
        const lightZ = zPos + dZ2;

        this.pillarPositions.push(
            { x: -roomWidth / 2 + 0.5 + dX1, z: worldZ1 },
            { x: roomWidth / 2 - 0.5 + dX2, z: worldZ2 }
        );

        // LIGHTING INTEGRATION
        // Borrow a lamp from the pool rather than building a PointLight per pillar.
        // Pooled lamps live on the scene (never inside the chunk) so that adding or
        // removing a chunk cannot change the scene's point-light count - see the
        // note at the top of lighting_manager.js for why that mattered so much.
        // Positions are therefore world space: the chunk group is only offset in Z,
        // so world X/Y equal local X/Y and world Z is local Z + chunkWorldZ.
        let intensity = 1.5 - this.drift.lightDimming;
        intensity = Math.max(0.1, intensity); // Never fully black

        const lightWorldZ = lightZ + chunkWorldZ;

        this._lampLightPos.set(roomWidth / 2 - 2 + dX2, roomHeight - 2, lightWorldZ);
        this._lampMeshPos.set(roomWidth / 2 - 1.3 + dX2, roomHeight - 2, lightWorldZ);

        this.lightingManager.acquire(parentGroup, this._lampLightPos, this._lampMeshPos, intensity);
    }

    cleanupChunks(playerZ) {
        const cleanThreshold = playerZ + 40;

        for (let i = this.chunks.length - 1; i >= 0; i--) {
            const chunk = this.chunks[i];

            if (chunk.position.z > cleanThreshold) {
                this.removeChunk(chunk);
                this.chunks.splice(i, 1);
            }
        }
    }

    // Tear the whole corridor down at once (mirage transition, endgame).
    // Goes through removeChunk so pooled lamps are returned instead of orphaned
    // still-lit in mid-air.
    clearAll() {
        for (let i = this.chunks.length - 1; i >= 0; i--) {
            this.removeChunk(this.chunks[i]);
        }
        this.chunks.length = 0;
        this.pillarPositions.length = 0;
        this.lightingManager.releaseAll();
    }

    removeChunk(chunk) {
        this.scene.remove(chunk);

        // Hand this chunk's lamps back to the pool
        this.lightingManager.releaseChunk(chunk);

        // Remove from interactables
        chunk.children.forEach(child => {
            const idx = this.interactables.indexOf(child);
            if (idx > -1) this.interactables.splice(idx, 1);
        });

        // Clean up old pillar positions
        const chunkZ = chunk.position.z;
        this.pillarPositions = this.pillarPositions.filter(p => p.z < chunkZ + 20);
    }
}
