import * as THREE from 'three';

// Procedural background for the title screen: no external assets, very light on GPU.
// Instanced trees (3 draw calls), a handful of houses, sprite clouds, drifting motes.

const SUN_DIR = new THREE.Vector3(-0.5, 0.32, -0.8).normalize();

// Terrain height: gentle rolling hills, flattened toward the centre (the clearing).
function terrainHeight(x, z) {
  const base = 3.0 * Math.sin(x * 0.03) * Math.cos(z * 0.025)
             + 1.5 * Math.sin(x * 0.09 + z * 0.07)
             + 0.6 * Math.sin(x * 0.2) * Math.sin(z * 0.17);
  const r = Math.hypot(x, z);
  const k = THREE.MathUtils.smoothstep(r, 8, 50);
  return base * (0.12 + 0.88 * k);
}

function softTexture(size, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => grad.addColorStop(o, col));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

export class TitleScene {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.running = false;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xaeb9b5, 0.013);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.5, 1000);

    this._buildSky();
    this._buildLights();
    this._buildTerrain();
    this._buildTrees();
    this._buildHouses();
    this._buildClouds();
    this._buildMotes();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  setShadows(on) {
    this.renderer.shadowMap.enabled = on;
    this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  }

  _buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x5a83b4) },
        horizon: { value: new THREE.Color(0xc4ccc4) },
        sunDir: { value: SUN_DIR },
      },
      vertexShader: `varying vec3 vDir;
        void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 col = mix(horizon, top, pow(h, 0.55));
          float s = max(dot(normalize(vDir), sunDir), 0.0);
          col += vec3(1.0, 0.85, 0.6) * (pow(s, 8.0) * 0.22 + pow(s, 256.0) * 0.8);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 12), mat);
    this.scene.add(this.sky);
  }

  _buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x4a5a3a, 0.9));
    this.sun = new THREE.DirectionalLight(0xffe2b8, 2.6);
    this.sun.position.copy(SUN_DIR).multiplyScalar(100);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const s = this.sun.shadow.camera;
    s.left = -70; s.right = 70; s.top = 70; s.bottom = -70; s.near = 1; s.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun);
  }

  _buildTerrain() {
    const geo = new THREE.PlaneGeometry(420, 420, 84, 84);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const a = new THREE.Color(0x5b7a3a), b = new THREE.Color(0x3f5a2b), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = terrainHeight(x, z);
      pos.setY(i, h);
      const n = 0.5 + 0.5 * Math.sin(x * 0.11) * Math.cos(z * 0.13);
      c.copy(b).lerp(a, THREE.MathUtils.clamp(n * 0.8 + h * 0.06, 0, 1));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  _buildTrees() {
    // Origins at the base so each tree can sway around its root.
    const trunkG = new THREE.CylinderGeometry(0.16, 0.28, 2.6, 6).translate(0, 1.3, 0);
    const lowG = new THREE.ConeGeometry(1.7, 3.6, 7).translate(0, 3.4, 0);
    const highG = new THREE.ConeGeometry(1.2, 3.0, 7).translate(0, 5.3, 0);
    const trunkM = new THREE.MeshLambertMaterial({ color: 0x4a3626 });
    const leafM = new THREE.MeshLambertMaterial({ color: 0x2f4a2a });

    const N = 110;
    this.trees = [];
    const rand = mulberry32(7);
    while (this.trees.length < N) {
      const angle = rand() * Math.PI * 2;
      const r = 16 + rand() * 120;
      const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
      // keep the central clearing and camera lane open
      if (Math.abs(x) < 7 && z > -12) continue;
      this.trees.push({ x, z, y: terrainHeight(x, z), s: 0.8 + rand() * 0.9, ry: rand() * 6.28, ph: rand() * 6.28 });
    }
    this.trunks = new THREE.InstancedMesh(trunkG, trunkM, N);
    this.leavesLow = new THREE.InstancedMesh(lowG, leafM, N);
    this.leavesHigh = new THREE.InstancedMesh(highG, leafM, N);
    for (const m of [this.trunks, this.leavesLow, this.leavesHigh]) {
      m.castShadow = true; m.receiveShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      this.scene.add(m);
    }
    this._dummy = new THREE.Object3D();
    this._updateTrees(0);
  }

  _updateTrees(t) {
    const d = this._dummy;
    this.trees.forEach((tr, i) => {
      d.position.set(tr.x, tr.y - 0.1, tr.z);
      d.rotation.set(Math.sin(t * 0.7 + tr.ph) * 0.018, tr.ry, Math.sin(t * 0.55 + tr.ph * 1.7) * 0.018);
      d.scale.setScalar(tr.s);
      d.updateMatrix();
      this.trunks.setMatrixAt(i, d.matrix);
      this.leavesLow.setMatrixAt(i, d.matrix);
      this.leavesHigh.setMatrixAt(i, d.matrix);
    });
    this.trunks.instanceMatrix.needsUpdate = true;
    this.leavesLow.instanceMatrix.needsUpdate = true;
    this.leavesHigh.instanceMatrix.needsUpdate = true;
  }

  _buildHouses() {
    // Simple placeholder cottages in the distance to hint at the village.
    const wallM = new THREE.MeshLambertMaterial({ color: 0xcdbf9f });
    const roofM = new THREE.MeshLambertMaterial({ color: 0x6b4634 });
    const spots = [[-14, -34, 0.3], [-3, -42, -0.2], [9, -36, 0.5], [18, -46, -0.4], [-24, -48, 0.1], [2, -58, 0.0]];
    for (const [x, z, ry] of spots) {
      const y = terrainHeight(x, z);
      const g = new THREE.Group();
      const walls = new THREE.Mesh(new THREE.BoxGeometry(6, 3.6, 5), wallM);
      walls.position.y = 1.8;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(4.9, 2.8, 4), roofM);
      roof.position.y = 5.0; roof.rotation.y = Math.PI / 4;
      walls.castShadow = roof.castShadow = true;
      walls.receiveShadow = true;
      g.add(walls, roof);
      g.position.set(x, y, z); g.rotation.y = ry;
      this.scene.add(g);
    }
  }

  _buildClouds() {
    const tex = softTexture(128, [[0, 'rgba(255,255,255,0.9)'], [0.5, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
    const rand = mulberry32(21);
    this.clouds = [];
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.35 + rand() * 0.25, depthWrite: false, fog: false });
      const sp = new THREE.Sprite(mat);
      sp.position.set((rand() - 0.5) * 500, 70 + rand() * 50, -140 - rand() * 220);
      sp.scale.set(90 + rand() * 90, 26 + rand() * 20, 1);
      sp.userData.speed = 0.6 + rand() * 0.8;
      this.scene.add(sp);
      this.clouds.push(sp);
    }
  }

  _buildMotes() {
    const count = 120;
    this.moteCount = count;
    const geo = new THREE.BufferGeometry();
    this.motePos = new Float32Array(count * 3);
    this.moteSeed = new Float32Array(count);
    const rand = mulberry32(99);
    for (let i = 0; i < count; i++) {
      this.motePos.set([(rand() - 0.5) * 60, 0.5 + rand() * 8, 6 + (rand() - 0.5) * 50], i * 3);
      this.moteSeed[i] = rand() * 6.28;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.motePos, 3));
    const tex = softTexture(32, [[0, 'rgba(255,240,200,1)'], [0.4, 'rgba(255,230,170,0.4)'], [1, 'rgba(255,230,170,0)']]);
    const mat = new THREE.PointsMaterial({ map: tex, size: 0.5, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.motes = new THREE.Points(geo, mat);
    this.motes.frustumCulled = false;
    this.scene.add(this.motes);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  _frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;

    // slow camera drift, kept above the terrain
    const cx = Math.sin(t * 0.05) * 6;
    const cz = 24 + Math.sin(t * 0.03) * 3;
    this.camera.position.set(cx, terrainHeight(cx, cz) + 2.6 + Math.sin(t * 0.1) * 0.25, cz);
    this.camera.lookAt(Math.sin(t * 0.04) * 4, 5, -30);
    this.sky.position.copy(this.camera.position);

    this._updateTrees(t);

    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 280) c.position.x = -280;
    }

    // motes drift upward with a gentle wobble, respawn low when too high
    const p = this.motePos;
    for (let i = 0; i < this.moteCount; i++) {
      const k = i * 3;
      p[k] += Math.sin(t * 0.6 + this.moteSeed[i]) * 0.15 * dt;
      p[k + 1] += (0.25 + 0.15 * Math.sin(this.moteSeed[i])) * dt;
      p[k + 2] += Math.cos(t * 0.5 + this.moteSeed[i]) * 0.12 * dt;
      if (p[k + 1] > 9) p[k + 1] = 0.4;
    }
    this.motes.geometry.attributes.position.needsUpdate = true;

    // subtle breathing of sunlight
    this.sun.intensity = 2.6 + Math.sin(t * 0.25) * 0.12;

    this.renderer.render(this.scene, this.camera);
  }
}

// small deterministic RNG so the scene looks the same every launch
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
