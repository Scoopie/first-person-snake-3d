import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { CELL_SIZE, GRID_SIZE } from "./config";

export interface SceneBundle {
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  snakeGroup: THREE.Group;
  food: THREE.Mesh;
  foodMat: THREE.MeshStandardMaterial;
  foodLight: THREE.PointLight;
  headGlow: THREE.Mesh;
  headGlowMat: THREE.MeshBasicMaterial;
  headGlowLight: THREE.PointLight;
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

  const borderShape = new THREE.Shape();
  const halfArena = (GRID_SIZE * CELL_SIZE) / 2;
  const inset = 0.18;
  const outer = halfArena - inset;
  const inner = outer - 0.12;
  borderShape.moveTo(-outer, -outer);
  borderShape.lineTo(outer, -outer);
  borderShape.lineTo(outer, outer);
  borderShape.lineTo(-outer, outer);
  borderShape.lineTo(-outer, -outer);

  const borderHole = new THREE.Path();
  borderHole.moveTo(-inner, -inner);
  borderHole.lineTo(-inner, inner);
  borderHole.lineTo(inner, inner);
  borderHole.lineTo(inner, -inner);
  borderHole.lineTo(-inner, -inner);
  borderShape.holes.push(borderHole);

  const border = new THREE.Mesh(
    new THREE.ShapeGeometry(borderShape),
    new THREE.MeshBasicMaterial({
      color: 0x8efbff,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  border.rotation.x = -Math.PI / 2;
  border.position.y = 0.085;
  border.renderOrder = 4;
  scene.add(border);

  const borderLight = new THREE.RectAreaLight(0x8efbff, 2.4, GRID_SIZE * CELL_SIZE, GRID_SIZE * CELL_SIZE);
  borderLight.position.set(0, 0.18, 0);
  borderLight.rotation.x = -Math.PI / 2;
  scene.add(borderLight);

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

  return {
    camera,
    renderer,
    composer,
    snakeGroup,
    food,
    foodMat,
    foodLight,
    headGlow,
    headGlowMat,
    headGlowLight,
    snakeMat,
    headMat
  };
}
