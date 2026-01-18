import * as THREE from '../three.module.js';

export class EffectsManager {
    constructor(scene) {
        this.scene = scene;
        this.mirageMesh = null;
        this.texLoader = new THREE.TextureLoader();

        this.mirageTexture = this.texLoader.load('textures/mirage.png');
        this.createMirage();
    }

    createMirage() {
        const mat = new THREE.SpriteMaterial({
            map: this.mirageTexture,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.mirageMesh = new THREE.Sprite(mat);
        this.mirageMesh.scale.set(3, 8, 1);
        this.mirageMesh.position.set(0, 1.5, 0);
        this.scene.add(this.mirageMesh);
    }

    showMirage(playerZ) {
        if (!this.mirageMesh) return;

        const dist = 30 + Math.random() * 20;
        this.mirageMesh.position.z = playerZ - dist;
        this.mirageMesh.position.x = (Math.random() - 0.5) * 4;

        this.mirageMesh.visible = true;
        this.mirageMesh.material.opacity = 0;
    }

    hideMirage() {
        if (this.mirageMesh) {
            this.mirageMesh.visible = false;
            this.mirageMesh.material.opacity = 0;
        }
    }

    updateMirage() {
        if (!this.mirageMesh || !this.mirageMesh.visible) return;

        // Glitch Logic
        if (Math.random() < 0.7) {
            this.mirageMesh.material.opacity = Math.random() * 0.05;
        } else {
            this.mirageMesh.material.opacity = 0.1 + Math.random() * 0.15;
        }

        this.mirageMesh.position.x += (Math.random() - 0.5) * 0.2;
        this.mirageMesh.scale.x = 3 + (Math.random() - 0.5);
    }
}
