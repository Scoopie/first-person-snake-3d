import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { CELL_SIZE, FLOOR_Y, GRID_SIZE } from "./config";

export interface SceneBundle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  wallGroup: THREE.Group;
  snakeGroup: THREE.Group;
  food: THREE.Mesh;
  foodMat: THREE.MeshStandardMaterial;
  foodLight: THREE.PointLight;
  foodBeacon: THREE.Mesh;
  foodBeaconLight: THREE.PointLight;
  obstacleGroup: THREE.Group;
  obstacleMats: THREE.MeshStandardMaterial[];
  headGlow: THREE.Mesh;
  headGlowMat: THREE.MeshBasicMaterial;
  headGlowLight: THREE.PointLight;
  particleGroup: THREE.Group;
  blastParticleGeo: THREE.BoxGeometry;
  snakeMat: THREE.MeshStandardMaterial;
  headMat: THREE.MeshStandardMaterial;
}

function makeGridTexture(renderer: THREE.WebGLRenderer) {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = textureCanvas.height = 1024;
  const ctx = textureCanvas.getContext("2d");

  if (!ctx) {
    throw new Error("Failed to create grid texture context.");
  }

  const size = textureCanvas.width;
  const cellSize = size / GRID_SIZE;
  const darkCell = "#05070d";
  const lightCell = "#214662";

  ctx.fillStyle = "#050912";
  ctx.fillRect(0, 0, size, size);

  for (let z = 0; z < GRID_SIZE; z++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const left = x * cellSize;
      const top = z * cellSize;
      const isLight = (x + z) % 2 === 0;

      ctx.fillStyle = isLight ? lightCell : darkCell;
      ctx.fillRect(left, top, Math.ceil(cellSize), Math.ceil(cellSize));

      const glow = ctx.createRadialGradient(
        left + cellSize * 0.5,
        top + cellSize * 0.5,
        cellSize * 0.08,
        left + cellSize * 0.5,
        top + cellSize * 0.5,
        cellSize * 0.68
      );
      glow.addColorStop(0, isLight ? "rgba(134,244,255,.2)" : "rgba(0,0,0,.22)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(left, top, cellSize, cellSize);

      ctx.strokeStyle = isLight ? "rgba(212,255,255,.18)" : "rgba(0,0,0,.28)";
      ctx.lineWidth = 1.4;
      ctx.strokeRect(left + 1, top + 1, cellSize - 2, cellSize - 2);
    }
  }

  for (let i = 0; i <= GRID_SIZE; i++) {
    const line = i * cellSize;
    const major = i === 0 || i === GRID_SIZE || i === Math.floor(GRID_SIZE / 2) || i % 4 === 0;
    ctx.strokeStyle = major ? "rgba(190,250,255,.36)" : "rgba(122,205,220,.08)";
    ctx.lineWidth = major ? 2.2 : 0.75;
    ctx.beginPath();
    ctx.moveTo(line, 0);
    ctx.lineTo(line, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, line);
    ctx.lineTo(size, line);
    ctx.stroke();
  }

  const vignette = ctx.createRadialGradient(size / 2, size / 2, size * 0.22, size / 2, size / 2, size * 0.72);
  vignette.addColorStop(0, "rgba(255,255,255,0)");
  vignette.addColorStop(1, "rgba(0,0,0,.28)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

function makeWallTexture(renderer: THREE.WebGLRenderer, base: string, stripe: string) {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = textureCanvas.height = 256;
  const ctx = textureCanvas.getContext("2d");

  if (!ctx) {
    throw new Error("Failed to create wall texture context.");
  }

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = stripe;
  ctx.lineWidth = 18;

  for (let i = -256; i < 512; i += 54) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 256, 256);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255,255,255,.16)";
  for (let y = 28; y < 256; y += 64) {
    for (let x = 28; x < 256; x += 64) {
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 1);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

export function createScene(canvas: HTMLCanvasElement): SceneBundle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03050a);
  scene.fog = new THREE.FogExp2(0x050812, 0.06);

  const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.1, 160);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const composer = new EffectComposer(renderer);
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.62,
    0.48,
    0.24
  );
  composer.addPass(bloomPass);

  const ambient = new THREE.HemisphereLight(0xb8f7ff, 0x05020a, 0.82);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff1d8, 1.55);
  sun.position.set(12, 24, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);

  const cyanWash = new THREE.PointLight(0x00d5ff, 2.6, 42);
  cyanWash.position.set(-18, 7, -16);
  scene.add(cyanWash);

  const amberWash = new THREE.PointLight(0xff9d3c, 2.1, 36);
  amberWash.position.set(18, 6, 17);
  scene.add(amberWash);

  const violetRim = new THREE.PointLight(0xc084fc, 1.8, 34);
  violetRim.position.set(15, 8, -18);
  scene.add(violetRim);

  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: makeGridTexture(renderer),
    roughness: 0.46,
    metalness: 0.12,
    emissive: 0x02060a,
    emissiveIntensity: 0.18
  });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(GRID_SIZE * CELL_SIZE, 0.35, GRID_SIZE * CELL_SIZE), floorMat);
  floor.position.y = -0.28;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(GRID_SIZE * CELL_SIZE, GRID_SIZE * 2, 0xe8fbff, 0x6e8fa3);
  const gridMaterial = grid.material as THREE.Material;
  gridMaterial.opacity = 0.06;
  gridMaterial.transparent = true;
  grid.position.y = 0.035;
  scene.add(grid);

  const wallGroup = new THREE.Group();
  scene.add(wallGroup);

  const wallMats = {
    north: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeWallTexture(renderer, "#f97316", "rgba(255,245,180,.78)"), emissive: 0x612100, emissiveIntensity: 0.62, roughness: 0.34, metalness: 0.22 }),
    south: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeWallTexture(renderer, "#06b6d4", "rgba(220,255,255,.78)"), emissive: 0x004f68, emissiveIntensity: 0.68, roughness: 0.34, metalness: 0.22 }),
    west: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeWallTexture(renderer, "#84cc16", "rgba(245,255,190,.78)"), emissive: 0x285700, emissiveIntensity: 0.6, roughness: 0.34, metalness: 0.22 }),
    east: new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeWallTexture(renderer, "#a855f7", "rgba(245,220,255,.78)"), emissive: 0x3d0068, emissiveIntensity: 0.68, roughness: 0.34, metalness: 0.22 })
  };

  const makeWall = (x: number, z: number, sx: number, sz: number, mat: THREE.Material) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, 4, sz), mat);
    wall.position.set(x, 1.75, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    wallGroup.add(wall);
  };

  const arena = GRID_SIZE * CELL_SIZE;
  makeWall(0, -arena / 2 - 1, arena + 2, 2, wallMats.north);
  makeWall(0, arena / 2 + 1, arena + 2, 2, wallMats.south);
  makeWall(-arena / 2 - 1, 0, 2, arena + 2, wallMats.west);
  makeWall(arena / 2 + 1, 0, 2, arena + 2, wallMats.east);

  const snakeMat = new THREE.MeshStandardMaterial({ color: 0xaec0ff, emissive: 0x12205a, emissiveIntensity: 0.32, roughness: 0.3, metalness: 0.2 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xc8fbff, emissive: 0x2bc8ff, emissiveIntensity: 0.92, roughness: 0.2, metalness: 0.3 });
  const snakeGroup = new THREE.Group();
  scene.add(snakeGroup);

  const foodMat = new THREE.MeshStandardMaterial({
    color: 0xf4d5a0,
    emissive: 0xffaa33,
    emissiveIntensity: 2.7,
    roughness: 0.16,
    metalness: 0.18
  });

  const food = new THREE.Mesh(new THREE.BoxGeometry(1.65, 1.65, 1.65), foodMat);
  food.castShadow = true;
  scene.add(food);

  const foodLight = new THREE.PointLight(0xffbb66, 4.6, 18);
  scene.add(foodLight);

  const foodBeacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.78, 0.78, 0.08, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffaa33,
      transparent: true,
      opacity: 0.78,
      depthTest: false
    })
  );
  foodBeacon.renderOrder = 10;
  scene.add(foodBeacon);

  const foodBeaconLight = new THREE.PointLight(0xffaa33, 2.8, 24);
  scene.add(foodBeaconLight);

  const obstacleGroup = new THREE.Group();
  scene.add(obstacleGroup);

  const obstacleMats = [
    new THREE.MeshStandardMaterial({ color: 0xff2e63, emissive: 0x7a0022, emissiveIntensity: 1.05, roughness: 0.34, metalness: 0.26 }),
    new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x765000, emissiveIntensity: 0.95, roughness: 0.34, metalness: 0.26 }),
    new THREE.MeshStandardMaterial({ color: 0x38f9d7, emissive: 0x00705f, emissiveIntensity: 1.0, roughness: 0.34, metalness: 0.26 }),
    new THREE.MeshStandardMaterial({ color: 0xb967ff, emissive: 0x410080, emissiveIntensity: 1.0, roughness: 0.34, metalness: 0.26 })
  ];

  const headGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const headGlow = new THREE.Mesh(new THREE.SphereGeometry(1.22, 32, 18), headGlowMat);
  headGlow.visible = false;
  headGlow.renderOrder = 8;
  scene.add(headGlow);

  const headGlowLight = new THREE.PointLight(0xffffff, 0, 8);
  scene.add(headGlowLight);

  const particleGroup = new THREE.Group();
  scene.add(particleGroup);

  return {
    scene,
    camera,
    renderer,
    composer,
    wallGroup,
    snakeGroup,
    food,
    foodMat,
    foodLight,
    foodBeacon,
    foodBeaconLight,
    obstacleGroup,
    obstacleMats,
    headGlow,
    headGlowMat,
    headGlowLight,
    particleGroup,
    blastParticleGeo: new THREE.BoxGeometry(0.22, 0.22, 0.22),
    snakeMat,
    headMat
  };
}
