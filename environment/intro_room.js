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

    create(positionOffset = new THREE.Vector3(0, 0, 4), autoStartClock = true, isMirage = false) {
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

        // (Rest of geometry creation omitted for brevity, logic continues below)
        // ...

        // Wait, replace_file_content replaces the WHOLE block targetted.
        // I need to be careful not to delete the walls/floor code if I target a large chunk without providing it back.
        // But the instruction says "Update create signature".
        // Use a smaller chunk target for just the top of functions if possible, or provide full content for safety.
        // Given I need to inject `this.clockRunning`... I will target the top of `create`.


        // Floor
        const floorTexName = isMirage ? 'textures/floor_tile2.png' : 'textures/floor_tile.png';
        const floorTex = texLoader.load(floorTexName);
        floorTex.wrapS = THREE.RepeatWrapping;
        floorTex.wrapT = THREE.RepeatWrapping;
        floorTex.repeat.set(2, 2);

        const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8 });
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), floorMat);
        floor.rotation.x = -Math.PI / 2;
        this.roomGroup.add(floor);

        // Ceiling
        const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
        const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), ceilingMat);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.y = height;
        this.roomGroup.add(ceiling);

        // Walls
        const wallTex = texLoader.load('textures/intro_room_walls.png');
        wallTex.wrapS = THREE.RepeatWrapping;
        wallTex.wrapT = THREE.RepeatWrapping;
        wallTex.repeat.set(2, 2);
        const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.5, color: 0xcccccc });

        // Back Wall
        const backWall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), wallMat);
        backWall.position.set(0, height / 2, depth / 2);
        backWall.rotation.y = Math.PI;
        this.roomGroup.add(backWall);

        // Side Walls
        const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), wallMat);
        leftWall.position.set(-width / 2, height / 2, 0);
        leftWall.rotation.y = Math.PI / 2;
        this.roomGroup.add(leftWall);

        const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), wallMat);
        rightWall.position.set(width / 2, height / 2, 0);
        rightWall.rotation.y = -Math.PI / 2;
        this.roomGroup.add(rightWall);

        // Front Wall (Doorway)
        const doorMat = wallMat.clone();
        doorMat.side = THREE.DoubleSide;

        const dOffset = 0.6;
        const wTopW = (width / 2) - dOffset;

        const wLeft = new THREE.Mesh(new THREE.PlaneGeometry(wTopW, height), doorMat);
        wLeft.position.set(-(dOffset + wTopW / 2), height / 2, -depth / 2);
        this.roomGroup.add(wLeft);

        const wRight = new THREE.Mesh(new THREE.PlaneGeometry(wTopW, height), doorMat);
        wRight.position.set((dOffset + wTopW / 2), height / 2, -depth / 2);
        this.roomGroup.add(wRight);

        const wHeader = new THREE.Mesh(new THREE.PlaneGeometry(dOffset * 2, height - 2.2), doorMat);
        wHeader.position.set(0, 2.2 + (height - 2.2) / 2, -depth / 2);
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
        this.createFurnishings(texLoader, dFrameTex, dFrameMat);

        this.createLighting(texLoader, height);

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

    createFurnishings(texLoader, frameTex, frameMat) {
        // Since frameEx was a typo in arg list just above, fixing:
        // Re-load if needed or use existing.
        // Actually I passed dFrameMat but also need dFrameTex reference maybe?
        // Let's just re-use texLoader.

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
        const portrait = new THREE.Mesh(
            new THREE.PlaneGeometry(1.5, 2.0),
            new THREE.MeshBasicMaterial({ map: texLoader.load('textures/fractal.png'), color: 0x999999 })
        );
        portrait.position.set(2.0 - 0.06, 1.5, 0);
        portrait.rotation.y = -Math.PI / 2;
        this.roomGroup.add(portrait);
        this.interactables.push(portrait);

        // --- CLOCK ---
        this.createDigitalClock();
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
        // dx = 0.3, dy = 0.25.
        // Length = sqrt(0.3^2 + 0.25^2) = 0.39
        // Midpoint = (0.15, 1.525, 0)
        // Angle = atan2(0.3, 0.25) -> Rotation Z.
        // Actually, just visual approximation:
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

    createLighting(texLoader, height) {
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

    createDigitalClock() {
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

        const frame = new THREE.Mesh(
            new THREE.BoxGeometry(0.9, 0.5, 0.1),
            new THREE.MeshStandardMaterial({ color: 0x111111 })
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
        if (!this.clockCtx) return;
        const ctx = this.clockCtx;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, 256, 128); // Background

        let timeStr = "00:00";

        if (this.clockRunning) {
            const now = Date.now();
            const start = this.clockStartTime;
            const elapsed = now - start;

            const totalSeconds = Math.floor(elapsed / 1000);
            const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
            const seconds = (totalSeconds % 60).toString().padStart(2, '0');
            timeStr = `${minutes}:${seconds}`;
        }

        ctx.fillStyle = '#ff0000'; // Red LED
        ctx.font = 'bold 80px monospace';
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
