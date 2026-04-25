import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const CONFIG = {
    moveSpeed: 4.0,
    caveSize: 60,
    wallHeight: 5,
    fragments: [
        { id: 'red', color: 0xff3333, asset: 'assets/crystal_red.webp' },
        { id: 'green', color: 0x33ff33, asset: 'assets/crystal_green.webp' },
        { id: 'blue', color: 0x3333ff, asset: 'assets/crystal_blue.webp' },
        { id: 'yellow', color: 0xffff33, asset: 'assets/crystal_yellow.webp' }
    ],
    textures: {
        wall: 'assets/cave_wall_texture.webp',
        floor: 'assets/cave_floor_texture.webp',
        hands: 'assets/player_hands_flashlight.webp'
    }
};

class Game {
    constructor() {
        this.container = document.getElementById('renderDiv');
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x020202);
        this.scene.fog = new THREE.FogExp2(0x000000, 0.12);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 1.6, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);

        this.controls = new PointerLockControls(this.camera, document.body);
        this.moveState = { forward: 0, backward: 0, left: 0, right: 0 };
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();

        this.touchLook = { active: false, id: null, startX: 0, startY: 0, euler: new THREE.Euler(0, 0, 0, 'YXZ') };
        this.joystick = { active: false, id: null, container: document.getElementById('joystick-container'), knob: document.getElementById('joystick-knob'), rect: null };

        this.loader = new THREE.TextureLoader();
        this.fragments = [];
        this.collectedCount = 0;

        this.init();
    }

    async init() {
        this.initLights();
        this.initEnvironment();
        this.initHands();
        this.initFragments();
        this.setupEventListeners();
        this.setupMobileControls();
        this.animate();
    }

    initLights() {
        this.scene.add(new THREE.AmbientLight(0x404040, 0.1));
        this.flashlight = new THREE.SpotLight(0xffffff, 45, 25, Math.PI / 6.5, 0.4, 1.2);
        this.flashlight.castShadow = true;
        this.camera.add(this.flashlight);
        this.flashlight.target.position.set(0, 0, -1);
        this.camera.add(this.flashlight.target);
        this.camera.add(new THREE.PointLight(0xffffff, 0.6, 3));
        this.scene.add(this.camera);
    }

    initEnvironment() {
        const wallTex = this.loader.load(CONFIG.textures.wall);
        wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(3, 2);
        const floorTex = this.loader.load(CONFIG.textures.floor);
        floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(12, 12);

        const floor = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.caveSize, CONFIG.caveSize), new THREE.MeshStandardMaterial({ map: floorTex }));
        floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
        this.scene.add(floor);

        const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.caveSize, CONFIG.caveSize), new THREE.MeshStandardMaterial({ map: wallTex, color: 0x444444 }));
        ceiling.rotation.x = Math.PI / 2; ceiling.position.y = CONFIG.wallHeight;
        this.scene.add(ceiling);

        this.generateWalls(wallTex);
    }

    generateWalls(tex) {
        const mat = new THREE.MeshStandardMaterial({ map: tex });
        for (let i = 0; i < 25; i++) {
            const pillar = new THREE.Mesh(new THREE.BoxGeometry(2+Math.random()*6, CONFIG.wallHeight, 2+Math.random()*6), mat);
            let px, pz; do { px = (Math.random()-0.5)*50; pz = (Math.random()-0.5)*50; } while (Math.sqrt(px*px+pz*pz) < 8);
            pillar.position.set(px, CONFIG.wallHeight/2, pz); pillar.castShadow = true; this.scene.add(pillar);
        }
    }

    initHands() {
        const tex = this.loader.load(CONFIG.textures.hands);
        this.handsSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
        this.handsSprite.scale.set(1.4, 0.8, 1); this.handsSprite.position.set(0.1, -0.42, -0.6);
        this.camera.add(this.handsSprite); this.handsSprite.renderOrder = 999;
    }

    initFragments() {
        CONFIG.fragments.forEach(data => {
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.loader.load(data.asset), transparent: true }));
            let px, pz; do { px = (Math.random()-0.5)*50; pz = (Math.random()-0.5)*50; } while (Math.sqrt(px*px+pz*pz) < 15);
            sprite.position.set(px, 0.6, pz); sprite.scale.set(0.7, 0.7, 1);
            sprite.userData = { id: data.id, collected: false, color: data.color };
            sprite.add(new THREE.PointLight(data.color, 1.5, 4));
            this.scene.add(sprite); this.fragments.push(sprite);
        });
    }

    setupMobileControls() {
        this.joystick.rect = this.joystick.container.getBoundingClientRect();
        window.addEventListener('touchstart', (e) => {
            for (let t of e.changedTouches) {
                if (t.clientX < window.innerWidth/2 && !this.joystick.active) {
                    this.joystick.active = true; this.joystick.id = t.identifier; this.updateJoystick(t);
                } else if (!this.touchLook.active) {
                    this.touchLook.active = true; this.touchLook.id = t.identifier;
                    this.touchLook.startX = t.clientX; this.touchLook.startY = t.clientY;
                    this.touchLook.euler.setFromQuaternion(this.camera.quaternion);
                }
            }
        });
        window.addEventListener('touchmove', (e) => {
            for (let t of e.changedTouches) {
                if (this.joystick.active && t.identifier === this.joystick.id) this.updateJoystick(t);
                else if (this.touchLook.active && t.identifier === this.touchLook.id) {
                    this.touchLook.euler.y -= (t.clientX - this.touchLook.startX) * 0.005;
                    this.touchLook.euler.x -= (t.clientY - this.touchLook.startY) * 0.005;
                    this.touchLook.startX = t.clientX; this.touchLook.startY = t.clientY;
                    this.touchLook.euler.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.touchLook.euler.x));
                    this.camera.quaternion.setFromEuler(this.touchLook.euler);
                }
            }
        });
        window.addEventListener('touchend', (e) => {
            for (let t of e.changedTouches) {
                if (this.joystick.active && t.identifier === this.joystick.id) {
                    this.joystick.active = false; this.joystick.knob.style.transform = 'translate(-50%, -50%)';
                    this.moveState.forward = this.moveState.backward = this.moveState.left = this.moveState.right = 0;
                } else if (this.touchLook.active && t.identifier === this.touchLook.id) this.touchLook.active = false;
            }
        });
    }

    updateJoystick(t) {
        const cx = this.joystick.rect.left + 60, cy = this.joystick.rect.top + 60;
        let dx = t.clientX - cx, dy = t.clientY - cy;
        const dist = Math.min(Math.sqrt(dx*dx+dy*dy), 60);
        if (dist === 60) { dx = (dx/Math.sqrt(dx*dx+dy*dy))*60; dy = (dy/Math.sqrt(dx*dx+dy*dy))*60; }
        this.joystick.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        this.moveState.left = dx < -12 ? -dx/60 : 0; this.moveState.right = dx > 12 ? dx/60 : 0;
        this.moveState.forward = dy < -12 ? -dy/60 : 0; this.moveState.backward = dy > 12 ? dy/60 : 0;
    }

    setupEventListeners() {
        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyW') this.moveState.forward = 1; if (e.code === 'KeyS') this.moveState.backward = 1;
            if (e.code === 'KeyA') this.moveState.left = 1; if (e.code === 'KeyD') this.moveState.right = 1;
        });
        window.addEventListener('keyup', (e) => {
            if (e.code === 'KeyW') this.moveState.forward = 0; if (e.code === 'KeyS') this.moveState.backward = 0;
            if (e.code === 'KeyA') this.moveState.left = 0; if (e.code === 'KeyD') this.moveState.right = 0;
        });
        this.renderer.domElement.addEventListener('click', () => { if (!this.joystick.active) this.controls.lock(); });
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const delta = 0.016;
        this.velocity.x -= this.velocity.x * 10 * delta; this.velocity.z -= this.velocity.z * 10 * delta;
        const dz = this.moveState.forward - this.moveState.backward, dx = this.moveState.right - this.moveState.left;
        this.direction.set(dx, 0, dz); if (this.direction.lengthSq() > 0) this.direction.normalize();
        this.velocity.z -= this.direction.z * 400 * delta; this.velocity.x -= this.direction.x * 400 * delta;
        this.controls.moveRight(-this.velocity.x * delta * 0.4); this.controls.moveForward(-this.velocity.z * delta * 0.4);
        
        const time = performance.now() * 0.005;
        this.handsSprite.position.y = -0.42 + (Math.abs(dz)+Math.abs(dx) > 0.1 ? Math.sin(time*2.5)*0.015 : Math.sin(time*0.5)*0.005);
        
        this.fragments.forEach(f => {
            if (!f.userData.collected) {
                f.position.y = 0.6 + Math.sin(time*0.3 + f.position.x)*0.15;
                if (this.camera.position.distanceTo(f.position) < 2) {
                    f.userData.collected = true; f.visible = false; this.collectedCount++;
                    const s = document.getElementById(`slot-${f.userData.id}`);
                    s.classList.add('collected'); s.style.boxShadow = `0 0 20px ${new THREE.Color(f.userData.color).getStyle()}`;
                    document.getElementById('status').innerText = this.collectedCount === 4 ? "MISSION RÉUSSIE !" : `Fragments : ${this.collectedCount}/4`;
                }
            }
        });
        this.renderer.render(this.scene, this.camera);
    }
}
new Game();
