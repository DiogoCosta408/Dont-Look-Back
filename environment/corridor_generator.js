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

        this.materials = {
            floor: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0.3 }),
            wall: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 }),
            ceiling: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 })
        };
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
        const width = 6;
        const height = 5 + this.drift.heightOffset; // Apply drift

        // Group to hold this section
        const corridor = new THREE.Group();

        // Floor
        const floorGeo = new THREE.PlaneGeometry(width, length);
        const floor = new THREE.Mesh(floorGeo, this.materials.floor);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        floor.name = "floor"; // ID for Drown Manager
        corridor.add(floor);

        // Ceiling (Split for Drown Ending Effect)
        const ceilingGeo = new THREE.PlaneGeometry(width / 2, length);

        // Left Ceiling
        const ceilingL = new THREE.Mesh(ceilingGeo, this.materials.ceiling);
        ceilingL.position.set(-width / 4, height, 0); // Offset left
        ceilingL.rotation.x = Math.PI / 2;
        ceilingL.receiveShadow = true;
        ceilingL.name = "ceiling_left";
        corridor.add(ceilingL);

        // Right Ceiling
        const ceilingR = new THREE.Mesh(ceilingGeo, this.materials.ceiling);
        ceilingR.position.set(width / 4, height, 0); // Offset right
        ceilingR.rotation.x = Math.PI / 2;
        ceilingR.receiveShadow = true;
        ceilingR.name = "ceiling_right";
        corridor.add(ceilingR);

        // Walls
        const wallGeo = new THREE.BoxGeometry(1, height, length);
        const leftWall = new THREE.Mesh(wallGeo, this.materials.wall);
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
        const pillarGeo = new THREE.BoxGeometry(1.5, roomHeight, 2);
        const pillarMat = this.materials.wall;

        // DRIFT CALCULATION (Random jitter)
        const dX1 = (Math.random() - 0.5) * this.drift.pillarOffset;
        const dRot1 = (Math.random() - 0.5) * (this.drift.pillarOffset * 0.5);

        const dX2 = (Math.random() - 0.5) * this.drift.pillarOffset;
        const dRot2 = (Math.random() - 0.5) * (this.drift.pillarOffset * 0.5);

        // Z-Drift (Paranoia spacing funkiness)
        const dZ1 = (Math.random() - 0.5) * this.drift.pillarOffset;
        const dZ2 = (Math.random() - 0.5) * this.drift.pillarOffset;

        // Left Pillar
        const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
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
        // Ask LightingManager for fixture mesh
        const fixtureData = this.lightingManager.createLightFixture(roomWidth, roomHeight, lightZ, dX2);

        // Position Mesh
        const mesh = fixtureData.mesh;
        mesh.position.set(roomWidth / 2 - 1.3 + dX2, roomHeight - 2, lightZ);
        mesh.name = "light_fixture"; // ID for Drown Manager
        parentGroup.add(mesh);

        // Create Light Source
        let intensity = 1.5 - this.drift.lightDimming;
        intensity = Math.max(0.1, intensity); // Never fully black

        const pointLight = new THREE.PointLight(0xffaa00, intensity, 12);
        pointLight.position.set(roomWidth / 2 - 2 + dX2, roomHeight - 2, lightZ);
        pointLight.name = "light_source"; // ID for Drown Manager

        // Register with Manager
        this.lightingManager.registerLight(pointLight, mesh);

        pointLight.visible = true;
        parentGroup.add(pointLight);
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

    removeChunk(chunk) {
        this.scene.remove(chunk);

        // Notify Lighting Manager to cleanup lights from this chunk
        this.lightingManager.removeLightsInChunk(chunk);

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
