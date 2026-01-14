import * as THREE from 'three';

export class FacilityGenerator {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        const texLoader = new THREE.TextureLoader();
        const glassTex = texLoader.load('textures/corridor_lamp.png');

        this.materials = {
            floor: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0.3 }),
            wall: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 }),
            ceiling: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }),
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

        this.chunks = []; // Track active environment chunks
        this.lights = [];
        this.interactables = []; // Objects interaction can target
        this.pillarPositions = []; // Track pillar world positions for collision

        this.chunkSize = 20; // Smaller chunks for more granular updates
        this.renderDistance = 80; // How far ahead to generate
        this.zOffset = 0; // Tracks the "front" of the world

        // [MICRO-ENVIRONMENTAL DRIFT STATE]
        this.forceBlackout = false;
        this.drift = {
            loopCount: 0,
            heightOffset: 0,
            lightDimming: 0,
            pillarOffset: 0
        };

        // [MIRAGE]
        this.mirageTexture = texLoader.load('textures/mirage.png');
        this.mirageMesh = null;
        this.createMirage();

        console.log("ENV: Generator v2 Initialized. ChunkSize:", this.chunkSize);
    }

    setDriftIntensity(intensity) {
        // 0.0 to 1.0
        this.drift.pillarOffset = intensity * 1.5; // Up to 1.5 units drift
    }

    createMirage() {
        const mat = new THREE.SpriteMaterial({
            map: this.mirageTexture,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending, // Glowy, ghost-like
            depthWrite: false
        });

        this.mirageMesh = new THREE.Sprite(mat);
        this.mirageMesh.scale.set(3, 8, 1); // Tall, imposing
        this.mirageMesh.position.set(0, 1.5, 0); // Center
        this.scene.add(this.mirageMesh);
    }

    showMirage(playerZ) {
        if (!this.mirageMesh) return;

        // Position far ahead in the dark
        const dist = 30 + Math.random() * 20;
        this.mirageMesh.position.z = playerZ - dist;
        this.mirageMesh.position.x = (Math.random() - 0.5) * 4;

        this.mirageMesh.visible = true;
        this.mirageMesh.material.opacity = 0; // Glitch loop handles this
    }

    hideMirage() {
        if (this.mirageMesh) {
            this.mirageMesh.visible = false;
            this.mirageMesh.material.opacity = 0;
        }
    }

    updateMirageEffect() {
        if (!this.mirageMesh || !this.mirageMesh.visible) return;

        // GLITCH: Random opacity flickering
        if (Math.random() < 0.7) {
            // Mostly very faint or invisible
            this.mirageMesh.material.opacity = Math.random() * 0.05;
        } else {
            // Brief clear flash (Max ~25% opacity to stay ghost-like/transparent)
            this.mirageMesh.material.opacity = 0.1 + Math.random() * 0.15;
        }

        // Jitter Position X
        this.mirageMesh.position.x += (Math.random() - 0.5) * 0.2;
        // Jitter Scale slightly
        this.mirageMesh.scale.x = 3 + (Math.random() - 0.5);
    }

    createIntroRoom() {
        // [PHASE 0: INTRO ROOM]
        // Small, oppressive room.
        this.clockStartTime = Date.now(); // Start Timer

        const width = 4;
        const depth = 4;
        const height = 3;

        this.introRoom = new THREE.Group();
        this.introRoom.position.set(0, 0, 4);

        // Floor
        const floorTexLoader = new THREE.TextureLoader();
        const floorTex = floorTexLoader.load('textures/floor_tile.png');
        floorTex.wrapS = THREE.RepeatWrapping;
        floorTex.wrapT = THREE.RepeatWrapping;
        floorTex.repeat.set(2, 2); // Tile 2x2 for this room size

        const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8 });
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), floorMat);
        floor.rotation.x = -Math.PI / 2;
        this.introRoom.add(floor);

        // Ceiling
        const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), this.materials.ceiling);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.y = height;
        this.introRoom.add(ceiling);

        // Walls (Front, Back, Left, Right)
        // const wallMat = this.materials.wall; // OLD

        const wallTex = floorTexLoader.load('textures/intro_room_walls.png'); // Reuse loader
        wallTex.wrapS = THREE.RepeatWrapping;
        wallTex.wrapT = THREE.RepeatWrapping;
        wallTex.repeat.set(2, 2);

        // Tinted slightly grey (0xcccccc) for atmosphere
        const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.5, color: 0xcccccc });

        // Back Wall (The "Start" side)
        const backWall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), wallMat);
        backWall.position.set(0, height / 2, depth / 2);
        backWall.rotation.y = Math.PI;
        this.introRoom.add(backWall);

        // --- FRONT WALL (DOORWAY) ---
        // We need an opening.
        // Wall Left
        // [FIX] Culling issue: Door disappears from outside. Use DoubleSide.
        const doorMat = wallMat.clone();
        doorMat.side = THREE.DoubleSide;
        doorMat.side = THREE.DoubleSide;

        const dOffset = 0.6; // Half door width
        const wTopW = (width / 2) - dOffset;

        const wLeft = new THREE.Mesh(new THREE.PlaneGeometry(wTopW, height), doorMat);
        wLeft.position.set(-(dOffset + wTopW / 2), height / 2, -depth / 2);
        this.introRoom.add(wLeft);

        const wRight = new THREE.Mesh(new THREE.PlaneGeometry(wTopW, height), doorMat);
        wRight.position.set((dOffset + wTopW / 2), height / 2, -depth / 2);
        this.introRoom.add(wRight);

        const wHeader = new THREE.Mesh(new THREE.PlaneGeometry(dOffset * 2, height - 2.2), doorMat);
        wHeader.position.set(0, 2.2 + (height - 2.2) / 2, -depth / 2);
        this.introRoom.add(wHeader);

        // --- DOOR FRAME (Wooden) ---
        const dLoader = new THREE.TextureLoader();
        const dFrameTex = dLoader.load('textures/painting_border.png');
        const dFrameMat = new THREE.MeshStandardMaterial({ map: dFrameTex, roughness: 0.6, color: 0x885533 }); // Wood tint

        // Jambs (Sides)
        const jambGeo = new THREE.BoxGeometry(0.1, 2.2, 0.15); // Slightly thicker than wall(0)

        const jambLeft = new THREE.Mesh(jambGeo, dFrameMat);
        jambLeft.position.set(-0.65, 1.1, -depth / 2); // -0.6 is edge, so -0.65 center
        this.introRoom.add(jambLeft);

        const jambRight = new THREE.Mesh(jambGeo, dFrameMat);
        jambRight.position.set(0.65, 1.1, -depth / 2);
        this.introRoom.add(jambRight);

        // Header (Top)
        const headGeo = new THREE.BoxGeometry(1.4, 0.1, 0.15);
        const headBeam = new THREE.Mesh(headGeo, dFrameMat);
        headBeam.position.set(0, 2.25, -depth / 2);
        this.introRoom.add(headBeam);

        // Left Wall
        const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), doorMat);
        leftWall.position.set(-width / 2, height / 2, 0);
        leftWall.rotation.y = Math.PI / 2;
        this.introRoom.add(leftWall);

        // Right Wall
        const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), doorMat);
        rightWall.position.set(width / 2, height / 2, 0);
        rightWall.rotation.y = -Math.PI / 2;
        this.introRoom.add(rightWall);

        // --- ASSETS ---

        // Texture Loading
        const texLoader = new THREE.TextureLoader();
        const sofaTex = texLoader.load('textures/sofa_texture.png');
        const tableTex = texLoader.load('textures/table_texture.png');

        // 1. Sofa (Converted Bed) - "Futon Style" with Legs
        const sofaMat = new THREE.MeshStandardMaterial({ map: sofaTex, color: 0x888888, roughness: 0.8 });
        const legMat = new THREE.MeshStandardMaterial({ map: dFrameTex, color: 0x5c4033, roughness: 0.9 }); // Dark wood

        // Dimensions
        const seatHeight = 0.25; // Slimmer base
        const legHeight = 0.2;
        const totalSeatH = legHeight + seatHeight; // 0.45 top
        const seatDepth = 0.64; // Reduced width (depth from wall) by 20%
        const seatWidth = 2.0;

        // A. Sofa Legs (x4)
        const lg = new THREE.BoxGeometry(0.08, legHeight, 0.08);
        const legOffsets = [
            { x: -0.3, z: 0.8 },  // Front Left (Local to sofa center)
            { x: -0.3, z: -0.8 }, // Back Left
            { x: 0.3, z: 0.8 },   // Front Right
            { x: 0.3, z: -0.8 }   // Back Right
        ];

        // Group for Sofa to keep things organized
        const sofaGroup = new THREE.Group();
        // Position entire group where the sofa "center base" used to be roughly
        // Old X=-1.4. Center of seat is roughly there.
        sofaGroup.position.set(-1.4, 0, 0.5);
        this.introRoom.add(sofaGroup);

        legOffsets.forEach(off => {
            const l = new THREE.Mesh(lg, legMat);
            // Pos Y: legHeight/2 (sitting on floor 0)
            // Pos X/Z: relative to group center
            // Seat is 0.8 deep (X axis in previous logic, wait. 
            // Previous: Box(0.8, 0.5, 2.0).
            // Width(X) = 0.8 (It was rotated? No, looking at walls)
            // Wall Left is -2, Wall Right is 2.
            // Sofa Pos: -1.4. (Near Left Wall).
            // Dim 0.8 is likely depth from wall.
            // Dim 2.0 is likely width along wall.

            // Adjust offsets for 0.8 depth (x) and 2.0 width (z)
            // X range: -0.4 to 0.4. Z range: -1.0 to 1.0.
            // Let's inset legs slightly.
            const lx = (off.x > 0 ? 0.25 : -0.25);
            const lz = (off.z > 0 ? 0.85 : -0.85);

            l.position.set(lx, legHeight / 2, lz);
            sofaGroup.add(l);
        });

        // B. Seat Base (Floating on legs)
        const sofaBaseGeo = new THREE.BoxGeometry(seatDepth, seatHeight, seatWidth);
        const sofaBase = new THREE.Mesh(sofaBaseGeo, sofaMat);
        sofaBase.position.set(0, legHeight + seatHeight / 2, 0);
        sofaGroup.add(sofaBase);

        // C. Backrest (1/3 size -> 0.4 height)
        const backH = 0.4;
        const sofaBackGeo = new THREE.BoxGeometry(0.15, backH, seatWidth);
        const sofaBack = new THREE.Mesh(sofaBackGeo, sofaMat);
        // Position: At back edge of seat. Seat is 0.64 wide (-0.32 to 0.32).
        // Back edge is -0.32. Center of backrest needs to be around -0.32 + 0.075 = -0.245.
        // Tilted slightly.
        sofaBack.position.set(-0.25, legHeight + seatHeight + (backH / 2) - 0.05, 0);
        sofaBack.rotation.z = 0.1; // Slight Tilt
        sofaGroup.add(sofaBack);

        // D. Arm Rests (Rounded)
        const armH = 0.15;
        const armW = 0.15;
        const armL = seatDepth + 0.05;

        // Create Arm Geometry (Box + Cylinder on top for "Rounding")
        const armBoxGeo = new THREE.BoxGeometry(armL, armH, armW);
        const armCylGeo = new THREE.CylinderGeometry(armW / 2, armW / 2, armL, 16);

        const createArm = (zPos) => {
            const arm = new THREE.Group();

            // Box Part
            const box = new THREE.Mesh(armBoxGeo, sofaMat);
            arm.add(box);

            // Round Top
            const round = new THREE.Mesh(armCylGeo, sofaMat);
            round.rotation.z = Math.PI / 2; // Lay horizontal along X
            round.position.y = armH / 2;
            arm.add(round);

            // Pos: Side of seat (Z = +/- (seatWidth/2 - armW/2))
            // Height: On top of seat base
            arm.position.set(0, legHeight + seatHeight + armH / 2, zPos);
            return arm;
        };

        const leftArm = createArm(seatWidth / 2 - armW / 2);
        sofaGroup.add(leftArm);

        const rightArm = createArm(-seatWidth / 2 + armW / 2);
        sofaGroup.add(rightArm);


        // 2. Side Table with Drawers
        const tableMat = new THREE.MeshStandardMaterial({ map: tableTex, color: 0x888888, roughness: 0.5, metalness: 0.1 });
        const drawerMat = new THREE.MeshStandardMaterial({ map: tableTex, color: 0x777777, roughness: 0.5 }); // Slightly dark for contrast
        const handleMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5 });

        // Main Carcass
        // Dims: 0.5(W) x 0.6(H) x 0.5(D)
        // Pos: -1.6, 0.3, -0.9
        const tableGroup = new THREE.Group();
        tableGroup.position.set(-1.6, 0.3, -0.9);
        this.introRoom.add(tableGroup);

        const tableBodyGeo = new THREE.BoxGeometry(0.5, 0.6, 0.48); // Slightly shallower to fit drawer fronts?
        // Actually let's just make the main box the structure
        const table = new THREE.Mesh(tableBodyGeo, tableMat);
        tableGroup.add(table);

        // Drawers (visual only - boxes on front)
        // "Front" facing towards room center? 
        // Table X=-1.6. Room Center X=0. Front face is +X side.
        const numDrawers = 3;
        const dHeight = 0.55 / numDrawers; // slightly less than full height
        const dWidth = 0.45;

        for (let i = 0; i < numDrawers; i++) {
            // Face
            const dGeo = new THREE.BoxGeometry(0.02, dHeight - 0.02, 0.45); // Thickness 0.02
            const dMesh = new THREE.Mesh(dGeo, drawerMat);

            // Y position: Start top, go down.
            // Top of table is 0.3 (relative 0.3). Bottom -0.3.
            // Let's space them.
            const yPos = 0.2 - (i * 0.19);

            dMesh.position.set(0.26, yPos, 0); // On +X face
            tableGroup.add(dMesh);

            // Handle (Simple line/pull)
            const hGeo = new THREE.BoxGeometry(0.01, 0.01, 0.1);
            const hMesh = new THREE.Mesh(hGeo, handleMat);
            hMesh.position.set(0.28, yPos, 0);
            tableGroup.add(hMesh);
        }

        // 2a. Paper (Note)
        const paperTex = texLoader.load('textures/paper.png');
        const paperGeo = new THREE.PlaneGeometry(0.2, 0.3);
        const paperMat = new THREE.MeshStandardMaterial({ map: paperTex, roughness: 0.9, side: THREE.DoubleSide });
        const paper = new THREE.Mesh(paperGeo, paperMat);
        // Relative to table group which is at Y=0.3 centered. Top is 0.3 + 0.3 = 0.6.
        paper.position.set(0, 0.305, 0);
        paper.rotation.x = -Math.PI / 2;
        paper.rotation.z = Math.random() * 0.5 - 0.25;
        tableGroup.add(paper);

        // 3. Portrait (Fractal with Frame)
        const portraitLoader = new THREE.TextureLoader();
        const portraitTex = portraitLoader.load('textures/fractal.png');
        const frameTex = portraitLoader.load('textures/painting_border.png');

        // A. Frame (Solid Backing)
        // Wall is at X = 2. We place frame slightly off wall.
        // Dims: Thickness 0.05, Height 2.2, Width 1.7 (relative to wall orientation)
        const frameGeo = new THREE.BoxGeometry(0.05, 2.2, 1.7);
        const frameMat = new THREE.MeshStandardMaterial({ map: frameTex, roughness: 0.5 });
        const frame = new THREE.Mesh(frameGeo, frameMat);
        frame.position.set(width / 2 - 0.03, 1.5, 0); // X ~ 1.97
        this.introRoom.add(frame);
        this.interactables.push(frame);

        // B. Canvas (The Paint)
        const portraitGeo = new THREE.PlaneGeometry(1.5, 2.0);
        const portraitMat = new THREE.MeshBasicMaterial({ map: portraitTex, color: 0x999999 }); // Darkened (40%)
        const portrait = new THREE.Mesh(portraitGeo, portraitMat);
        // Place slightly in front of frame (X ~ 1.94)
        portrait.position.set(width / 2 - 0.06, 1.5, 0);
        portrait.rotation.y = -Math.PI / 2;
        this.introRoom.add(portrait);
        this.interactables.push(portrait);

        // 4. Door REMOVED - Open Frame

        // 5. Digital Clock (Wall)
        this.createDigitalClock();
        this.clockMesh.position.set(0, 2.2, depth / 2 - 0.1);
        this.clockMesh.rotation.y = Math.PI;
        this.introRoom.add(this.clockMesh);

        // 5. Carpet (Centered)
        const carpetTex = texLoader.load('textures/carpet.png');
        const carpetGeo = new THREE.BoxGeometry(1.6, 0.01, 2.2);
        const carpetMat = new THREE.MeshStandardMaterial({ map: carpetTex, roughness: 1.0 });
        const carpet = new THREE.Mesh(carpetGeo, carpetMat);
        carpet.position.set(0, 0.006, 0.5); // Centered in room
        this.introRoom.add(carpet);

        // 6. Floor Lamp (Right of Table)
        const lampGroup = new THREE.Group();
        lampGroup.position.set(-1.6, 0.0, -1.4); // Right of table (Table X=-1.6, Width=0.5 -> Edge ~ -1.35)
        this.introRoom.add(lampGroup);

        const lBlack = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
        const lGold = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.2, metalness: 0.8 });

        // Base
        const lBase = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 32), lBlack);
        lBase.position.y = 0.01;
        lampGroup.add(lBase);

        // Stem (Vertical)
        const lStem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.4, 16), lBlack);
        lStem.position.y = 0.7;
        lampGroup.add(lStem);

        // Joint (Gold)
        const lJoint = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 16), lGold);
        lJoint.position.y = 1.4;
        lampGroup.add(lJoint);

        // Arm (Angled)
        const lArm = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 16), lBlack);
        lArm.position.set(0.15, 1.55, 0);
        lArm.rotation.z = -Math.PI / 4; // 45 deg
        lampGroup.add(lArm);

        // Shade (Cone/Bell)
        const lShade = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.12, 0.25, 32, 1, true), lBlack);
        lShade.position.set(0.3, 1.65, 0);
        lShade.rotation.z = Math.PI / 10; // Tilted slightly Left (Other way)
        lShade.material.side = THREE.DoubleSide;
        lampGroup.add(lShade);

        // Bulb
        const lBulb = new THREE.Mesh(new THREE.SphereGeometry(0.03), new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
        lBulb.position.set(0.3, 1.63, 0);
        lampGroup.add(lBulb);

        const lSpot = new THREE.SpotLight(0xffaa00, 5.0, 5.0, Math.PI / 4, 0.5, 1);
        lSpot.position.set(0.3, 1.63, 0);
        lSpot.target.position.set(0.2, 0, 0); // Point inward/left
        lampGroup.add(lSpot);
        lampGroup.add(lSpot.target);

        // --- LIGHTING ---
        // 6. Fixture
        const fixtureGeo = new THREE.BoxGeometry(0.6, 0.1, 1.2);
        const fixtureMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
        const fixture = new THREE.Mesh(fixtureGeo, fixtureMat);
        fixture.position.set(0, height - 0.05, 0);
        this.introRoom.add(fixture);

        const lampTex = texLoader.load('textures/room_lamp.png');
        const panelGeo = new THREE.PlaneGeometry(0.5, 1.0);
        // 60% Transparent = 0.4 Opacity. Tinted Yellow.
        const panelMat = new THREE.MeshBasicMaterial({
            map: lampTex,
            color: 0xffaa55,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide
        });
        this.introLightPanel = new THREE.Mesh(panelGeo, panelMat);
        this.introLightPanel.position.set(0, -0.06, 0);
        this.introLightPanel.rotation.x = Math.PI / 2;
        fixture.add(this.introLightPanel);

        // Source
        this.introLight = new THREE.PointLight(0xffaa55, 3.0, 15);
        this.introLight.position.set(0, height - 0.5, 0);
        this.introRoom.add(this.introLight);

        this.scene.add(this.introRoom);
    }

    createDigitalClock() {
        // Dynamic Canvas Texture
        this.clockCanvas = document.createElement('canvas');
        this.clockCanvas.width = 256;
        this.clockCanvas.height = 128;
        this.clockCtx = this.clockCanvas.getContext('2d');

        const tex = new THREE.CanvasTexture(this.clockCanvas);
        this.clockTexture = tex;

        const geo = new THREE.PlaneGeometry(0.8, 0.4);
        const mat = new THREE.MeshBasicMaterial({ map: tex });
        const displayMesh = new THREE.Mesh(geo, mat);
        displayMesh.position.z = 0.06; // In front of frame

        // Border / Frame
        const frameGeo = new THREE.BoxGeometry(0.9, 0.5, 0.1);
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
        const frameMesh = new THREE.Mesh(frameGeo, frameMat);

        this.clockMesh = new THREE.Group();
        this.clockMesh.add(frameMesh);
        this.clockMesh.add(displayMesh);

        this.updateClockTime();
    }

    updateClockTime() {
        if (!this.clockCtx) return;

        // Draw Digital Clock style
        const ctx = this.clockCtx;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, 256, 128); // Background

        // Mission Time
        const now = Date.now();
        const start = this.clockStartTime || now;
        const elapsed = now - start;

        const totalSeconds = Math.floor(elapsed / 1000);
        const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const seconds = (totalSeconds % 60).toString().padStart(2, '0');
        const timeStr = `${minutes}:${seconds}`;

        ctx.fillStyle = '#ff0000'; // Red LED
        ctx.font = 'bold 80px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Slight randomization gives "segment" feel or glitch?
        ctx.fillText(timeStr, 128, 64);

        if (this.clockTexture) this.clockTexture.needsUpdate = true;
    }

    destroyIntroRoom() {
        if (this.introRoom) {
            this.scene.remove(this.introRoom);
            this.introRoom = null;
        }
    }

    createInitialCorridor() {
        // Initial set of chunks
        this.chunkLength = this.chunkSize; // Align with new chunkSize
        this.generateCorridorChunk(0);
        this.zOffset -= this.chunkSize; // Move 'forward' in negative Z
        this.generateCorridorChunk(this.zOffset);
        this.zOffset -= this.chunkSize; // Prepare for next chunk
    }

    update(playerZ, delta) {
        // Safety check for delta
        if (delta === undefined || isNaN(delta)) delta = 0.016;

        // Restore Lights (Flicker recovery) - ALWAYS RUN
        if (this.updateLights) {
            this.updateLights(delta);
        }

        // [ENDGAME LOGIC]
        if (this.stopGeneration || this.isEndgame) {
            // Stop generating new corridor chunks
            this.updateEndgame({ z: playerZ }); // Ensure assets spawn
            this.cleanupChunks(playerZ);

            // Update Shader Uniform for Star
            if (this.starGlowMat && this.blackHole) {
                this.starGlowMat.uniforms.viewVector.value.subVectors(this.camera.position, this.blackHole.position);
            }
            return;
        }

        // Standard Generation
        const distToEdge = Math.abs(playerZ - this.zOffset);

        if (distToEdge < this.renderDistance) {
            this.generateCorridorChunk(this.zOffset);
            this.zOffset -= this.chunkSize;

            // Cleanup very old chunks
            this.cleanupChunks(playerZ);
        }
    }

    cleanupChunks(playerZ) {
        // Remove chunks that are far behind the player (e.g. player is at -100, remove -20)
        // Actually, "behind" means > playerZ + buffer
        const cleanThreshold = playerZ + 40; // e.g., if player is at -100, remove chunks > -60

        // Filter mutable array
        for (let i = this.chunks.length - 1; i >= 0; i--) {
            const chunk = this.chunks[i];
            // If chunk Z (its center) is significantly greater (more positive) than player
            // This means the chunk is behind the player
            if (chunk.position.z > cleanThreshold) {
                this.removeChunk(chunk);
                this.chunks.splice(i, 1);
            }
        }
    }

    generateCorridorChunk(zStart) {
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
        corridor.add(floor);

        // Ceiling
        const ceiling = floor.clone();
        ceiling.material = this.materials.ceiling;
        ceiling.position.y = height;
        ceiling.rotation.x = Math.PI / 2;
        corridor.add(ceiling);

        // Walls
        const wallGeo = new THREE.BoxGeometry(1, height, length);
        const leftWall = new THREE.Mesh(wallGeo, this.materials.wall);
        leftWall.position.set(-width / 2 - 0.5, height / 2, 0);
        leftWall.receiveShadow = true;
        corridor.add(leftWall);

        const rightWall = leftWall.clone();
        rightWall.position.set(width / 2 + 0.5, height / 2, 0);
        corridor.add(rightWall);

        // Pillars/Supports (Repetitive elements)
        const chunkWorldZ = zStart - length / 2; // Chunk center world position

        // Vary pillar spacing slightly
        // FIXED: Rigid grid alignment (Spacing 8)
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
        parentGroup.add(leftPillar);
        this.interactables.push(leftPillar);

        // Right Pillar
        const rightPillar = leftPillar.clone();
        rightPillar.position.set(roomWidth / 2 - 0.5 + dX2, roomHeight / 2, zPos + dZ2);
        rightPillar.rotation.y = dRot2;
        parentGroup.add(rightPillar);
        this.interactables.push(rightPillar);

        // Store world positions for collision (local Z + chunk world Z)
        // Note: Using average Z or separate? Collision system checks independently?
        // Current uses 'pillarPositions' which stores {x, z}. I should use the jittered Z.
        // But `light positions` use `zPos`. Lights should follow pillars.
        const lightZ = zPos + dZ2; // Follow right pillar

        const worldZ1 = (zPos + dZ1) + chunkWorldZ;
        const worldZ2 = (zPos + dZ2) + chunkWorldZ;

        this.pillarPositions.push(
            { x: -roomWidth / 2 + 0.5 + dX1, z: worldZ1 },
            { x: roomWidth / 2 - 0.5 + dX2, z: worldZ2 }
        );

        // Light fixture on pillar (Right Side, Right Pillar)
        const lightGeo = new THREE.BoxGeometry(0.2, 1.5, 0.2);
        // CLONE material so we can flicker this specific light box without affecting others
        const uniqueMaterial = this.materials.lightEmissive.clone();
        const lightMesh = new THREE.Mesh(lightGeo, uniqueMaterial);
        // Attach to right pillar position (approx)
        lightMesh.position.set(roomWidth / 2 - 1.3 + dX2, roomHeight - 2, lightZ);
        parentGroup.add(lightMesh);

        // Actual light
        // Apply drift to intensity (1.5 base)
        let intensity = 1.5 - this.drift.lightDimming;
        intensity = Math.max(0.1, intensity); // Never fully black

        const pointLight = new THREE.PointLight(0xffaa00, intensity, 12);
        pointLight.position.set(roomWidth / 2 - 2 + dX2, roomHeight - 2, lightZ);

        // Link mesh to light for flickering
        pointLight.userData = {
            originalIntensity: intensity,
            mesh: lightMesh
        };

        pointLight.visible = true; // Force visible
        parentGroup.add(pointLight);
        this.lights.push(pointLight);
    }

    // [ARCHITECTURAL CORRECTION METHODS]

    removeChunk(chunk) {
        this.scene.remove(chunk);
        this.removeLightsInChunk(chunk);

        // Remove from interactables
        chunk.children.forEach(child => {
            const idx = this.interactables.indexOf(child);
            if (idx > -1) this.interactables.splice(idx, 1);
        });

        // Clean up old pillar positions (behind player - positive Z relative to chunk)
        const chunkZ = chunk.position.z;
        this.pillarPositions = this.pillarPositions.filter(p => p.z < chunkZ + 20);
    }

    updateIntroTick(delta) {
        if (!this.introRoom) return;
        if (delta === undefined || isNaN(delta)) delta = 0.016;

        // 1. Flicker Light (Sync Panel and Source)
        if (this.introLight && this.introLightPanel) {
            let intensity = 1.5;
            let panelOpacity = 1.0;

            if (Math.random() < 0.05) { // Occasional flicker
                const noise = Math.random();
                intensity = 0.5 + noise * 1.0;
                panelOpacity = 0.3 + noise * 0.7;
            } else {
                // Return to stable-ish
                this.introLight.intensity = THREE.MathUtils.lerp(this.introLight.intensity, 1.5, delta * 5);
                // Panel simple logic (it's MeshBasic, so we effectively dim it by color or if transparent)
                // Let's just assume stable. For flicker, we set it directly.
            }

            // Apply Flicker
            if (this.introLight.intensity !== 1.5) {
                this.introLight.intensity = intensity;
                // Dim color to simulate emissive drop
                const dimFactor = intensity / 1.5;
                this.introLightPanel.material.color.setHSL(0.08, 1.0, 0.5 * dimFactor);
            } else {
                this.introLightPanel.material.color.setHex(0xffaa55);
            }
        }

        // 2. Update Clock every second
        if (!this.clockTimer) this.clockTimer = 0;
        this.clockTimer += delta;
        if (this.clockTimer > 1.0) {
            this.updateClockTime();
            this.clockTimer = 0;
        }
    }

    updateLights(delta) {
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

        // Called by FacilitySystem events
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
        // If state is true (horror mode), turn off lights behind.
        // If state is false (safe mode), turn them back on.
        this.lights.forEach(light => {
            if (!light.parent) return; // Skip removed lights

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
        this.lights = this.lights.filter(l => l.parent !== null);
    }

    // [ENDGAME: COSMIC DISSOLUTION]

    enterEndgame() {
        if (this.isEndgame) return;
        this.isEndgame = true;
        this.stopGeneration = true;

        // Clear fog for the void completely
        this.scene.fog = null;

        console.log("ENV: Entering Endgame Sequence... Corridor ending.");
        this.createDistantSun();
    }

    createDistantSun() {
        // Distant yellow/orange "sun" to give scale
        const geometry = new THREE.SphereGeometry(20, 32, 32);
        const material = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
        const sun = new THREE.Mesh(geometry, material);
        this.scene.add(sun);
        this.distantSun = sun;
    }

    updateEndgame(playerPos) {
        try {
            if (!this.blackHole && !this.endgameTargetZ) {
                let startZ = playerPos.z; // Default to current pos if no chunks

                if (this.chunks.length > 0) {
                    const lastChunk = this.chunks[this.chunks.length - 1];
                    startZ = lastChunk.position.z - (this.chunkSize / 2);
                    this.endgameTargetZ = startZ - 200; // Reduced Gap to 200 for visibility safety
                } else {
                    this.endgameTargetZ = playerPos.z - 200;
                }

                this.corridorEndZ = startZ; // SAVE FOR PLAYER VALIDLY

                // DEBUG BEACON REMOVED

                this.createBlackHole();
                this.blackHole.position.set(0, 0, this.endgameTargetZ);

                // Create Border at VALID startZ
                this.createCorridorBorder(startZ);
                this.createStarTunnel(startZ, this.endgameTargetZ);

                if (this.distantSun) {
                    this.distantSun.position.set(2000, 500, this.endgameTargetZ - 4000);
                }

                console.log(`ENV: Assets Spawned. EdgeZ: ${startZ}, VoidZ: ${this.endgameTargetZ}`);
            }

            // Rotate sprite or pulse?
            // Sprites generally face camera, so rotation doesn't do much unless we rotate UVs.
            // For a simple glow, pulsing scale is better.
            if (this.halo) {
                // Subtle pulse
                const time = performance.now() / 1000;
                const scale = 160 + Math.sin(time) * 5;
                this.halo.scale.set(scale, scale, 1);
            }
        } catch (e) {
            console.error("ENV: CRITICAL ENDGAME FAILURE", e);
        }
    }

    createGlowTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);

        // Soft White Glow
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)'); // Center bright
        gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.4)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); // Outer transparent

        context.fillStyle = gradient;
        context.fillRect(0, 0, 64, 64);

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    createStarTunnel(startZ, endZ) {
        // 0. COSMOS BACKGROUND
        const bgLoader = new THREE.TextureLoader();
        const cosmosTex = bgLoader.load('textures/cosmos.jpg');
        // Huge Sky Sphere
        const bgGeo = new THREE.SphereGeometry(4000, 32, 32);
        const bgMat = new THREE.MeshBasicMaterial({
            map: cosmosTex,
            side: THREE.BackSide,
            color: 0xaaaaaa, // Brightened (was 0x555555)
            fog: false
        });
        const bgSphere = new THREE.Mesh(bgGeo, bgMat);
        bgSphere.position.set(0, 0, endZ); // Center on Void
        this.scene.add(bgSphere);

        // SCATTER STARS IN TORUS / CYLINDER SHELL
        // Ensure NO stars in the central path (Player -> Black Hole line)
        const geometry = new THREE.BufferGeometry();
        const vertices = [];

        // 50k stars
        for (let i = 0; i < 50000; i++) {
            // Cylindrical Coordinates
            const theta = Math.random() * Math.PI * 2;
            // Radius: Don't spawn within 80 units of center (Tunnel clear)
            const r = 80 + Math.random() * 800;

            const x = r * Math.cos(theta);
            const y = r * Math.sin(theta);

            // Z Distribution: From Corridor End to deep behind Black Hole
            // endZ is negative (e.g. -2000). startZ is 0-ish.
            // Spread: startZ down to (endZ - 2000)
            const zMin = endZ - 2000;
            const zMax = startZ - 5; // Start just AFTER the edge to avoid overlap artifact

            const z = zMin + Math.random() * (zMax - zMin);

            vertices.push(x, y, z);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

        // Tiny, bright white sparks
        const material = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.6, // 80% of 0.8
            transparent: true,
            opacity: 1.0,
            sizeAttenuation: true,
            fog: false
        });

        const stars = new THREE.Points(geometry, material);
        stars.frustumCulled = false;
        this.scene.add(stars);
        this.starfield = stars;
    }

    createCorridorBorder(zPos) {
        // Full Rectangular Frame at the Edge
        const width = 6;
        const height = 5;
        const thickness = 0.5;
        const color = 0xffffff;
        const material = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide });

        // 1. Bottom (Floor)
        const bottom = new THREE.Mesh(new THREE.PlaneGeometry(width, thickness), material);
        bottom.position.set(0, 0.05, zPos);
        bottom.rotation.x = -Math.PI / 2;
        this.scene.add(bottom);

        // 2. Top (Ceiling)
        const top = new THREE.Mesh(new THREE.PlaneGeometry(width, thickness), material);
        top.position.set(0, height - 0.05, zPos);
        top.rotation.x = Math.PI / 2;
        this.scene.add(top);

        // 3. Left (Wall)
        const left = new THREE.Mesh(new THREE.PlaneGeometry(thickness, height), material);
        left.position.set(-width / 2 + 0.05, height / 2, zPos);
        left.rotation.y = Math.PI / 2;
        this.scene.add(left);

        // 4. Right (Wall)
        const right = new THREE.Mesh(new THREE.PlaneGeometry(thickness, height), material);
        right.position.set(width / 2 - 0.05, height / 2, zPos);
        right.rotation.y = -Math.PI / 2;
        this.scene.add(right);
    }

    createBlackHole() {
        try {
            console.log("ENV: Creating BH Geometries...");
            const geometry = new THREE.SphereGeometry(45, 64, 64);
            const material = new THREE.MeshBasicMaterial({ color: 0x000000 });
            const blackHole = new THREE.Mesh(geometry, material);
            this.scene.add(blackHole);
            this.blackHole = blackHole;

            // [A. GLOW HALO (Sprite)]
            console.log("ENV: Creating BH Glow...");
            const glowTex = this.createGlowTexture();
            const spriteMat = new THREE.SpriteMaterial({
                map: glowTex,
                color: 0xffffff,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                fog: false // Ignore fog
            });
            const glow = new THREE.Sprite(spriteMat);
            glow.scale.set(120, 120, 1.0);
            this.blackHole.add(glow);
            this.halo = glow;

            // [B. ECLIPSE STAR REMOVED] - Redundant and confusing

            // [C. ADDED: MASSIVE BACKLIGHT STAR]
            console.log("ENV: Creating Black Hole Shader...");
            // Use a custom shader to create the "Solar Eclipse" rim effect
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

            // Simple additive glow mesh behind
            // REDUCED SIZE: 60 * 0.8 = 48
            const starGlowGeo = new THREE.SphereGeometry(48, 64, 64);
            const starGlowMat = new THREE.ShaderMaterial({
                uniforms: {
                    viewVector: { value: new THREE.Vector3(0, 0, 0) }
                },
                vertexShader: vertexShader,
                fragmentShader: fragmentShader,
                side: THREE.BackSide,
                blending: THREE.AdditiveBlending,
                transparent: true
            });
            this.starGlowMat = starGlowMat; // Save for updates

            const starGlow = new THREE.Mesh(starGlowGeo, starGlowMat);
            starGlow.position.set(0, 0, -1); // Centered relative to BH
            this.blackHole.add(starGlow);

            // Add a massive separate glow sprite for the "Star" that is being eaten
            // REDUCED SCALE: 350 * 0.8 = 280
            const sunSpriteMat = new THREE.SpriteMaterial({
                map: glowTex,
                color: 0xffaa00,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                fog: false
            });
            const sunSprite = new THREE.Sprite(sunSpriteMat);
            sunSprite.scale.set(280, 280, 1.0);
            starGlow.add(sunSprite);

            console.log("ENV: BH Creation Complete.");
        } catch (e) {
            console.error("ENV: BH CREATION FAILED", e);
        }
        this.blackHole.visible = true;
    }


}
