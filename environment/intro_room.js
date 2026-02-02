import * as THREE from '../three.module.js';

export class IntroRoom {
    constructor(scene) {
        this.scene = scene;
        this.roomGroup = null;
        this.interactables = [];
        this.clockCanvas = null;
        this.clockCtx = null;
        this.clockTexture = null;
        this.clockStartTime = Date.now();
        this.clockTimer = 0;

        // Light references for flicker
        this.introLight = null;
        this.introLightPanel = null;
    }

    create(positionOffset = new THREE.Vector3(0, 0, 4), autoStartClock = true, isMirage = false, backEndingCount = 0) {
        this.clockRunning = autoStartClock;
        if (this.clockRunning) {
            this.clockStartTime = Date.now();
        } else {
            this.clockStartTime = 0; // Stopped
        }

        const width = 4;
        const depth = 4;
        const height = 3;

        this.roomGroup = new THREE.Group();
        this.roomGroup.position.copy(positionOffset);

        const texLoader = new THREE.TextureLoader();

        // [VARIANT LOGIC]
        // Level 0: Standard Mirage
        // Level 1: Checkered (Back=1)
        // Level 2: Concrete / Empty (Back>=2)

        let variantLevel = 0;
        if (isMirage) {
            if (backEndingCount === 1) variantLevel = 1;
            else if (backEndingCount >= 2) variantLevel = 2;
        }

        // --- FLOOR ---
        let floorTexName;
        if (variantLevel === 2) floorTexName = 'textures/concrete_worn.jpg';
        else if (variantLevel === 1) floorTexName = 'textures/checkered_floor.jpg';
        else floorTexName = isMirage ? 'textures/floor_tile2.png' : 'textures/floor_tile.png';

        const floorTex = texLoader.load(floorTexName);
        floorTex.wrapS = THREE.RepeatWrapping;
        floorTex.wrapT = THREE.RepeatWrapping;
        floorTex.repeat.set(2, 2);

        const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8 });
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), floorMat);
        floor.rotation.x = -Math.PI / 2;
        this.roomGroup.add(floor);

        // --- CEILING ---
        let ceilingMat;
        if (variantLevel >= 1) {
            const cName = (variantLevel === 2) ? 'textures/concrete_worn.jpg' : 'textures/checkered_floor.jpg';
            const ceilTex = texLoader.load(cName);
            ceilTex.wrapS = THREE.RepeatWrapping;
            ceilTex.wrapT = THREE.RepeatWrapping;
            ceilTex.repeat.set(2, 2);
            ceilingMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.9 });
        } else {
            ceilingMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
        }

        const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), ceilingMat);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.y = height;
        this.roomGroup.add(ceiling);

        // --- WALLS ---
        let wallTexName;
        if (variantLevel === 2) wallTexName = 'textures/concrete_worn.jpg';
        else if (variantLevel === 1) wallTexName = 'textures/checkered_floor.jpg';
        else wallTexName = 'textures/intro_room_walls.png';

        const baseWallTex = texLoader.load(wallTexName);
        baseWallTex.wrapS = THREE.RepeatWrapping;
        baseWallTex.wrapT = THREE.RepeatWrapping;

        // Helper to get material with scaled repeat
        const getWallMat = (w, h) => {
            if (variantLevel === 0) {
                // Standard Behavior: Fixed (2, 2)
                const tex = baseWallTex.clone();
                tex.repeat.set(2, 2);
                tex.needsUpdate = true;
                return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, color: 0xcccccc });
            } else {
                // Variant Behavior: Scaled (0.5 repeats per unit)
                const density = 0.5;
                const tex = baseWallTex.clone();
                tex.repeat.set(w * density, h * density);
                tex.needsUpdate = true;
                return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, color: 0xcccccc });
            }
        };

        // Back Wall (4 x 3)
        const backMat = getWallMat(width, height);
        const backWall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), backMat);
        backWall.position.set(0, height / 2, depth / 2);
        backWall.rotation.y = Math.PI;
        this.roomGroup.add(backWall);

        // Side Walls (4 x 3)
        const sideMat = getWallMat(depth, height);

        const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), sideMat);
        leftWall.position.set(-width / 2, height / 2, 0);
        leftWall.rotation.y = Math.PI / 2;
        this.roomGroup.add(leftWall);

        const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), sideMat);
        rightWall.position.set(width / 2, height / 2, 0);
        rightWall.rotation.y = -Math.PI / 2;
        this.roomGroup.add(rightWall);

        // Front Wall (Doorway)
        const dOffset = 0.6;
        const wTopW = (width / 2) - dOffset; // 1.4

        const leftDoorMat = getWallMat(wTopW, height);
        leftDoorMat.side = THREE.DoubleSide; // Keep DoubleSide for door parts? Original doorMat had it.

        const wLeft = new THREE.Mesh(new THREE.PlaneGeometry(wTopW, height), leftDoorMat);
        wLeft.position.set(-(dOffset + wTopW / 2), height / 2, -depth / 2);
        this.roomGroup.add(wLeft);

        const rightDoorMat = getWallMat(wTopW, height);
        rightDoorMat.side = THREE.DoubleSide;

        const wRight = new THREE.Mesh(new THREE.PlaneGeometry(wTopW, height), rightDoorMat);
        wRight.position.set((dOffset + wTopW / 2), height / 2, -depth / 2);
        this.roomGroup.add(wRight);

        const headerW = dOffset * 2;
        const headerH = height - 2.2;
        const headerMat = getWallMat(headerW, headerH);
        headerMat.side = THREE.DoubleSide;

        const wHeader = new THREE.Mesh(new THREE.PlaneGeometry(headerW, headerH), headerMat);
        wHeader.position.set(0, 2.2 + headerH / 2, -depth / 2);
        this.roomGroup.add(wHeader);

        // Door Frame
        const dFrameTex = texLoader.load('textures/painting_border.png');
        const dFrameMat = new THREE.MeshStandardMaterial({ map: dFrameTex, roughness: 0.6, color: 0x885533 });

        const jambGeo = new THREE.BoxGeometry(0.1, 2.2, 0.15);
        const jambLeft = new THREE.Mesh(jambGeo, dFrameMat);
        jambLeft.position.set(-0.65, 1.1, -depth / 2);
        this.roomGroup.add(jambLeft);

        const jambRight = new THREE.Mesh(jambGeo, dFrameMat);
        jambRight.position.set(0.65, 1.1, -depth / 2);
        this.roomGroup.add(jambRight);

        const headBeam = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.15), dFrameMat);
        headBeam.position.set(0, 2.25, -depth / 2);
        this.roomGroup.add(headBeam);

        // ASSETS
        // FIX: Pass variantLevel. isVariant is deprecated/refactored out.
        this.createFurnishings(texLoader, dFrameTex, dFrameMat, isMirage, variantLevel);

        this.createLighting(texLoader, height, variantLevel);

        // [OUTER SHELL]
        // Disabled to debug "Ceiling/Floor" confusion
        /*
        if (isMirage) {
            this.createOuterShell(width, height, depth);
        }
        */

        this.scene.add(this.roomGroup);
    }

    createOuterShell(width, height, depth) {
        const shellMat = new THREE.MeshBasicMaterial({ color: 0x000000 }); // Pitch black

        // Make it slightly larger to prevent z-fighting
        const eps = 0.05;

        // Back
        const back = new THREE.Mesh(new THREE.PlaneGeometry(width + eps, height + eps), shellMat);
        back.position.set(0, height / 2, depth / 2 + 0.01);
        // Normal points +Z, which is OUTWARD from back wall
        this.roomGroup.add(back);

        // Left (Normal -X)
        const left = new THREE.Mesh(new THREE.PlaneGeometry(depth + eps, height + eps), shellMat);
        left.position.set(-width / 2 - 0.01, height / 2, 0);
        left.rotation.y = -Math.PI / 2;
        this.roomGroup.add(left);

        // Right (Normal +X)
        const right = new THREE.Mesh(new THREE.PlaneGeometry(depth + eps, height + eps), shellMat);
        right.position.set(width / 2 + 0.01, height / 2, 0);
        right.rotation.y = Math.PI / 2;
        this.roomGroup.add(right);

        // Top
        const top = new THREE.Mesh(new THREE.PlaneGeometry(width + eps, depth + eps), shellMat);
        top.position.set(0, height + 0.01, 0);
        top.rotation.x = -Math.PI / 2;
        this.roomGroup.add(top);

        // Bottom not needed (under floor), but Front?
        // Front has door, so maybe just blocking the wall parts.
        // For simplicity, let's just do full black box on front too, but with hole?
        // Or just let the front be open?
        // User said "walls of this second room are all black seen from outside"
        // Primarily side/back/top. Front is where you enter.
    }

    createFurnishings(texLoader, frameTex, frameMat, isMirage = false, variantLevel = 0) {

        // VARIANT 2: Simple Wooden Chair ONLY
        if (variantLevel === 2) {
            const chairGroup = new THREE.Group();
            chairGroup.position.set(0, 0, 0.5); // Centered in room, slightly back
            chairGroup.rotation.y = Math.PI; // Face Back Wall (where painting is)
            this.roomGroup.add(chairGroup);

            const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });

            // Legs
            const legGeo = new THREE.BoxGeometry(0.05, 0.45, 0.05);
            const positions = [
                [-0.2, 0.225, -0.2], [0.2, 0.225, -0.2], // Front
                [-0.2, 0.225, 0.2], [0.2, 0.225, 0.2]    // Back
            ];
            positions.forEach(p => {
                const leg = new THREE.Mesh(legGeo, woodMat);
                leg.position.set(...p);
                chairGroup.add(leg);
            });

            // Seat
            const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.5), woodMat);
            seat.position.set(0, 0.45, 0);
            chairGroup.add(seat);

            // Backrest
            // Two posts
            const postGeo = new THREE.BoxGeometry(0.05, 0.5, 0.05);
            const p1 = new THREE.Mesh(postGeo, woodMat);
            p1.position.set(-0.2, 0.7, 0.2);
            chairGroup.add(p1);
            const p2 = new THREE.Mesh(postGeo, woodMat);
            p2.position.set(0.2, 0.7, 0.2);
            chairGroup.add(p2);

            // Slats
            const slatGeo = new THREE.BoxGeometry(0.4, 0.1, 0.02);
            const s1 = new THREE.Mesh(slatGeo, woodMat);
            s1.position.set(0, 0.65, 0.2);
            chairGroup.add(s1);
            const s2 = new THREE.Mesh(slatGeo, woodMat);
            s2.position.set(0, 0.85, 0.2);
            chairGroup.add(s2);

            return; // EXIT early, no sofa/table
        }

        // VARIANT 0/1: Sofa & Table
        const sofaTex = texLoader.load('textures/sofa_texture.png');
        const sofaMat = new THREE.MeshStandardMaterial({ map: sofaTex, color: 0x888888, roughness: 0.8 });

        // --- SOFA ---
        const sofaGroup = new THREE.Group();
        sofaGroup.position.set(-1.4, 0, 0.5);
        this.roomGroup.add(sofaGroup);

        // Legs
        const legMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
        const lg = new THREE.BoxGeometry(0.08, 0.2, 0.08);
        const legOffsets = [
            { x: -0.3, z: 0.8 }, { x: -0.3, z: -0.8 },
            { x: 0.3, z: 0.8 }, { x: 0.3, z: -0.8 }
        ];

        legOffsets.forEach(off => {
            const l = new THREE.Mesh(lg, legMat);
            const lx = (off.x > 0 ? 0.25 : -0.25);
            const lz = (off.z > 0 ? 0.85 : -0.85);
            l.position.set(lx, 0.1, lz);
            sofaGroup.add(l);
        });

        // Base
        const sofaBase = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.25, 2.0), sofaMat);
        sofaBase.position.set(0, 0.2 + 0.125, 0);
        sofaGroup.add(sofaBase);

        // Back
        const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 2.0), sofaMat);
        sofaBack.position.set(-0.25, 0.2 + 0.25 + 0.2 - 0.05, 0);
        sofaBack.rotation.z = 0.1;
        sofaGroup.add(sofaBack);

        // Arms
        const armGeo = new THREE.BoxGeometry(0.69, 0.15, 0.15); // L=seatDepth+0.05
        const armCyl = new THREE.CylinderGeometry(0.075, 0.075, 0.69, 16);

        [-0.925, 0.925].forEach(zPos => {
            const arm = new THREE.Group();
            arm.add(new THREE.Mesh(armGeo, sofaMat));
            const round = new THREE.Mesh(armCyl, sofaMat);
            round.rotation.z = Math.PI / 2;
            round.position.y = 0.075;
            arm.add(round);

            arm.position.set(0, 0.2 + 0.25 + 0.075, zPos);
            sofaGroup.add(arm);
        });

        // --- TABLE ---
        const tableTex = texLoader.load('textures/table_texture.png');
        const tableMat = new THREE.MeshStandardMaterial({ map: tableTex, color: 0x888888, roughness: 0.5, metalness: 0.1 });
        const drawerMat = new THREE.MeshStandardMaterial({ map: tableTex, color: 0x777777, roughness: 0.5 });

        const tableGroup = new THREE.Group();
        tableGroup.position.set(-1.6, 0.3, -0.9);
        this.roomGroup.add(tableGroup);

        const table = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.48), tableMat);
        tableGroup.add(table);

        // Drawers
        for (let i = 0; i < 3; i++) {
            const yPos = 0.2 - (i * 0.19);
            const dMesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.45), drawerMat);
            dMesh.position.set(0.26, yPos, 0);
            tableGroup.add(dMesh);

            const hMesh = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.1), new THREE.MeshStandardMaterial({ color: 0x222222 }));
            hMesh.position.set(0.28, yPos, 0);
            tableGroup.add(hMesh);
        }

        // Note
        const paper = new THREE.Mesh(
            new THREE.PlaneGeometry(0.2, 0.3),
            new THREE.MeshStandardMaterial({ map: texLoader.load('textures/paper.png'), side: THREE.DoubleSide })
        );
        paper.position.set(0, 0.305, 0);
        paper.rotation.x = -Math.PI / 2;
        paper.rotation.z = Math.random() * 0.5 - 0.25;
        tableGroup.add(paper);

        // --- PORTRAIT ---
        // Frame
        const pFrameMat = frameMat || new THREE.MeshStandardMaterial({ color: 0x885533 });
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.2, 1.7), pFrameMat);
        frame.position.set(2.0 - 0.03, 1.5, 0);
        this.roomGroup.add(frame);
        this.interactables.push(frame);

        // Canvas
        let portraitTex;
        if (variantLevel === 2) portraitTex = 'textures/mirage_3.jpg';
        else if (variantLevel === 1) portraitTex = 'textures/time_transfixed.webp';
        else portraitTex = isMirage ? 'textures/nottobereproduced.jpg' : 'textures/fractal.png';

        const portrait = new THREE.Mesh(
            new THREE.PlaneGeometry(1.5, 2.0),
            new THREE.MeshBasicMaterial({ map: texLoader.load(portraitTex), color: 0x999999 })
        );
        portrait.position.set(2.0 - 0.06, 1.5, 0);
        portrait.rotation.y = -Math.PI / 2;
        this.roomGroup.add(portrait);
        this.interactables.push(portrait);

        // --- CLOCK ---
        this.createClock(variantLevel);
        this.clockMesh.position.set(0, 2.2, 2.0 - 0.1);
        this.clockMesh.rotation.y = Math.PI;
        this.roomGroup.add(this.clockMesh);

        // --- CARPET ---
        const carpet = new THREE.Mesh(
            new THREE.BoxGeometry(1.6, 0.01, 2.2),
            new THREE.MeshStandardMaterial({ map: texLoader.load('textures/carpet.png'), roughness: 1.0 })
        );
        carpet.position.set(0, 0.006, 0.5);
        this.roomGroup.add(carpet);

        // --- LAMP (Right of Table) ---
        // VARIANT 3 (Level 2): Ceiling Lamp ONLY. No table lamp.
        if (variantLevel < 2) {
            const lBlack = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
            const lampGroup = new THREE.Group();
            lampGroup.position.set(-1.6, 0.0, -1.4);

            // 1. Stem
            const lStem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.4), lBlack);
            lStem.position.y = 0.7;
            lampGroup.add(lStem);

            // 2. Shade (Re-elevated, connected by bar)
            // Previous Floating height: 1.65
            const lShade = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.12, 0.25, 32, 1, true), lBlack);
            lShade.position.set(0.3, 1.65, 0); // Back to offset
            lShade.rotation.z = Math.PI / 10;
            lShade.material.side = THREE.DoubleSide;
            lampGroup.add(lShade);

            // 3. Diagonal Bar Connector
            // Connects Top of Stem (0, 1.4, 0) to Shade Center (0.3, 1.65, 0)
            const connector = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.4), lBlack);
            connector.position.set(0.15, 1.52, 0);
            connector.rotation.z = -0.85; // Roughly connects them
            lampGroup.add(connector);

            // Spot
            const lSpot = new THREE.SpotLight(0xffaa00, 5.0, 5.0, Math.PI / 4, 0.5, 1);
            lSpot.position.set(0.3, 1.63, 0);
            lSpot.target.position.set(0.2, 0, 0);
            lampGroup.add(lSpot);
            lampGroup.add(lSpot.target);

            this.roomGroup.add(lampGroup);
        }
    }

    createLighting(texLoader, height, variantLevel = 0) {
        if (variantLevel >= 1) {
            // [VARIANT: Conical Spring Lamp]
            const lampGroup = new THREE.Group();
            lampGroup.position.set(0, height, 0); // Base at ceiling center
            this.roomGroup.add(lampGroup);

            const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7, metalness: 0.2 });

            // 1. Ceiling Rose (Box/Cylinder)
            const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 16), blackMat);
            rose.position.y = -0.05;
            lampGroup.add(rose);

            // 2. Chain Cord (Interlocking)
            const chainLength = 0.6;
            const links = 14;
            const linkRadius = 0.02;
            const linkTube = 0.006;
            const linkSpacing = chainLength / links;
            const cordMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 });

            for (let i = 0; i < links; i++) {
                const y = -0.1 - (i * linkSpacing * 0.85); // 0.85 for overlap
                const ring = new THREE.Mesh(new THREE.TorusGeometry(linkRadius, linkTube, 8, 16), cordMat);

                if (i % 2 === 0) {
                    ring.rotation.y = 0; // Face Z
                } else {
                    ring.rotation.y = Math.PI / 2; // Face X
                }

                ring.position.y = y;
                lampGroup.add(ring);
            }

            const totalChainDrop = 0.1 + (links * linkSpacing * 0.85);

            // 3. Conical Shade
            // Wide cone, open bottom
            const shadeGeo = new THREE.ConeGeometry(0.5, 0.3, 32, 1, true);
            const shade = new THREE.Mesh(shadeGeo, blackMat);
            shade.position.y = -totalChainDrop - 0.15;
            shade.material.side = THREE.DoubleSide;
            lampGroup.add(shade);

            // 4. Black "Cap" on top of shade
            const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.1, 0.1, 16), blackMat);
            cap.position.y = -totalChainDrop - 0.05;
            lampGroup.add(cap);

            // 5. Light Source (Bulb inside shade)
            this.introLight = new THREE.PointLight(0xffaa55, 2.5, 12);
            this.introLight.position.set(0, -totalChainDrop - 0.2, 0); // Inside shade
            lampGroup.add(this.introLight);

            // Handle removed as per request.

        } else {
            // [STANDARD: Panel Light]
            const fixture = new THREE.Mesh(
                new THREE.BoxGeometry(0.6, 0.1, 1.2),
                new THREE.MeshStandardMaterial({ color: 0x222222 })
            );
            fixture.position.set(0, height - 0.05, 0);
            this.roomGroup.add(fixture);

            const lampTex = texLoader.load('textures/room_lamp.png');
            const panelMat = new THREE.MeshBasicMaterial({
                map: lampTex, color: 0xffaa55, transparent: true, opacity: 0.4, side: THREE.DoubleSide
            });
            this.introLightPanel = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.0), panelMat);
            this.introLightPanel.position.set(0, -0.06, 0);
            this.introLightPanel.rotation.x = Math.PI / 2;
            fixture.add(this.introLightPanel);

            this.introLight = new THREE.PointLight(0xffaa55, 3.0, 15);
            this.introLight.position.set(0, height - 0.5, 0);
            this.roomGroup.add(this.introLight);
        }
    }

    createClock(variantLevel = 0) {
        this.clockVariant = variantLevel;

        // VARIANT 2: Analog Clock (Ancient)
        if (this.clockVariant === 2) {
            const clockGroup = new THREE.Group();

            // Frame/Body
            // Round worn casing
            const caseGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.05, 32);
            const caseMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 }); // Old wood/copper?
            const casing = new THREE.Mesh(caseGeo, caseMat);
            casing.rotation.x = Math.PI / 2;
            clockGroup.add(casing);

            // Face (Textured)
            const faceGeo = new THREE.CircleGeometry(0.35, 32);
            const clockTex = new THREE.TextureLoader().load('textures/clock_face_analog.jpg');
            // Rotate texture if needed, or rotate mesh. The image is likely upright.
            const faceMat = new THREE.MeshBasicMaterial({ map: clockTex });
            const face = new THREE.Mesh(faceGeo, faceMat);
            face.position.z = 0.031; // Slightly above casing
            // face.rotation.z = -Math.PI / 2; // Adjust if texture is rotated
            clockGroup.add(face);

            // Hands container
            this.analogHands = new THREE.Group();
            this.analogHands.position.z = 0.04;
            clockGroup.add(this.analogHands);

            // Minute Hand (Longer)
            const mHand = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.28, 0.01), new THREE.MeshBasicMaterial({ color: 0x000000 }));
            mHand.position.y = 0.14;
            this.minuteHandContainer = new THREE.Group();
            this.minuteHandContainer.add(mHand);
            this.analogHands.add(this.minuteHandContainer);

            // Second Hand (Think red)
            const sHand = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.32, 0.01), new THREE.MeshBasicMaterial({ color: 0xaa0000 }));
            sHand.position.y = 0.1; // Extends back a bit? No just centered.
            sHand.position.y = 0.16;
            this.secondHandContainer = new THREE.Group();
            this.secondHandContainer.add(sHand);
            this.analogHands.add(this.secondHandContainer);

            // Central Pin
            const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 16), new THREE.MeshStandardMaterial({ color: 0x222222 }));
            pin.rotation.x = Math.PI / 2;
            pin.position.z = 0.05;
            clockGroup.add(pin);

            this.clockMesh = clockGroup;
            this.updateClockTime();
            return;
        }

        // VARIANT 0/1: Digital Clock
        this.clockCanvas = document.createElement('canvas');
        this.clockCanvas.width = 256;
        this.clockCanvas.height = 128;
        this.clockCtx = this.clockCanvas.getContext('2d');
        this.clockTexture = new THREE.CanvasTexture(this.clockCanvas);

        const display = new THREE.Mesh(
            new THREE.PlaneGeometry(0.8, 0.4),
            new THREE.MeshBasicMaterial({ map: this.clockTexture })
        );
        display.position.z = 0.06;

        let frameColor = 0x111111;
        if (this.clockVariant === 1) frameColor = 0x5c4033; // Vintage Wood/Plastic Brown

        const frame = new THREE.Mesh(
            new THREE.BoxGeometry(0.9, 0.5, 0.1),
            new THREE.MeshStandardMaterial({ color: frameColor })
        );

        this.clockMesh = new THREE.Group();
        this.clockMesh.add(frame);
        this.clockMesh.add(display);

        this.updateClockTime();
    }

    startClock() {
        this.clockRunning = true;
        this.clockStartTime = Date.now();
        this.updateClockTime();
    }

    updateClockTime() {
        const now = Date.now();
        let totalSeconds = 0;

        if (this.clockRunning) {
            const start = this.clockStartTime;
            const elapsed = now - start;
            totalSeconds = Math.floor(elapsed / 1000);
        }

        if (this.clockVariant === 2) {
            // Analog Update
            if (this.minuteHandContainer && this.secondHandContainer) {
                const sec = totalSeconds % 60;
                const min = Math.floor(totalSeconds / 60) % 60;

                // -2PI * (sec / 60)
                this.secondHandContainer.rotation.z = - (sec / 60) * Math.PI * 2;
                this.minuteHandContainer.rotation.z = - (min / 60) * Math.PI * 2;
                // Note: Smooth movement for seconds? 'elapsed' has ms.
                // If precise 'tick' needed: use floor logic.
                // Analog clocks usually sweep or tick. Let's stick to floor for ticks.
            }
            return;
        }

        // Digital Update
        if (!this.clockCtx) return;
        const ctx = this.clockCtx;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, 256, 128); // Background

        const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const seconds = (totalSeconds % 60).toString().padStart(2, '0');
        const timeStr = `${minutes}:${seconds}`;

        if (this.clockVariant === 1) {
            // Vintage 80s Style
            ctx.fillStyle = '#00ff00'; // Green phosphor
            // Or 'Amber' #ffb000
            // User requested "Vintage like 80s": Often Red or Green.
            // Let's go with Green to contrast the Red standard.
            ctx.font = 'bold 80px "Courier New", monospace';
            // Scanlines?
            ctx.fillStyle = '#55ff55';
        } else {
            // Modern Red
            ctx.fillStyle = '#ff0000';
            ctx.font = 'bold 80px monospace';
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(timeStr, 128, 64);

        if (this.clockTexture) this.clockTexture.needsUpdate = true;
    }

    destroy() {
        if (this.roomGroup) {
            this.scene.remove(this.roomGroup);
            this.roomGroup = null;
        }
    }

    update(delta) {
        if (!this.roomGroup) return;

        // Clock Update
        this.clockTimer += delta;
        if (this.clockTimer > 1.0) {
            this.updateClockTime();
            this.clockTimer = 0;
        }

        // Flicker Logic
        if (this.introLight && this.introLightPanel) {
            let intensity = 1.5;
            if (Math.random() < 0.05) {
                const noise = Math.random();
                intensity = 0.5 + noise * 1.0;
                // panelOpacity logic simplified
            } else {
                intensity = THREE.MathUtils.lerp(this.introLight.intensity, 1.5, delta * 5);
            }

            this.introLight.intensity = intensity;
            if (intensity < 1.4) {
                const dimFactor = intensity / 1.5;
                this.introLightPanel.material.color.setHSL(0.08, 1.0, 0.5 * dimFactor);
            } else {
                this.introLightPanel.material.color.setHex(0xffaa55);
            }
        }
    }
}
