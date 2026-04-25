import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CELL_SIZE, FLOOR_Y, FOOD_TYPE_LIST, FOOD_TYPES, HALF_GRID } from "./config";
import { getGameDom } from "./dom";
import { InputController } from "./input";
import { createScene } from "./scene";
import type { BlastParticle, Cell, Direction, FoodType, GameDom, ObstacleSegment } from "./types";

const HIGH_SCORE_STORAGE_KEY = "first-person-snake-3d:high-score";

interface DeathDebris {
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
}

export class SnakeGame {
  private readonly dom: GameDom;
  private readonly sceneBundle;
  private readonly input: InputController;
  private readonly segmentGeometry = this.createRoundedBoxGeometry(1.42, 1.42, 1.42, 0.22, 5);

  private snake: Cell[] = [];
  private dir: Direction = { x: 0, z: -1 };
  private nextDir: Direction = { x: 0, z: -1 };
  private visualForward = new THREE.Vector3(0, 0, -1);
  private foodPos: Cell | null = null;
  private activeFoodType: FoodType = FOOD_TYPES.bonus;
  private score = 0;
  private highScore = 0;
  private running = false;
  private dead = false;
  private moveTimer = 0;
  private stepTime = 0.28;
  private slowStepsRemaining = 0;
  private fastStepsRemaining = 0;
  private wrapStepsRemaining = 0;
  private ghostStepsRemaining = 0;
  private doubleLengthStepsRemaining = 0;
  private doubleLengthSegments = 0;
  private reverseControlsStepsRemaining = 0;
  private headGlowUntil = 0;
  private headGlowFlashStartsAt = 0;
  private pickupLabelUntil = 0;
  private pickupLabelWord = "";
  private pickupLabelColor = 0xffffff;
  private pickupLabelEmissive = 0xffffff;
  private meshes: THREE.Mesh[] = [];
  private obstacles: Cell[] = [];
  private obstacleMeshes: THREE.Mesh[] = [];
  private obstacleSegments: ObstacleSegment[] = [];
  private mazeWallPlan: ObstacleSegment[] = [];
  private blastParticles: BlastParticle[] = [];
  private deathDebris: DeathDebris[] = [];
  private deathAnimationUntil = 0;
  private gameOverOverlayShown = false;
  private turnAnimationStartedAt = 0;
  private turnAnimationUntil = 0;
  private turnDirection = 0;
  private lastTime = performance.now();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.dom = getGameDom(canvas);
    this.sceneBundle = createScene(canvas);
    this.highScore = this.loadHighScore();
    this.dom.highScoreEl.textContent = String(this.highScore);
    this.input = new InputController(this.dom, {
      onDebugFoodType: (index) => this.setDebugFoodType(index),
      onStart: () => this.requestStart()
    });
  }

  start() {
    this.input.bind();
    window.addEventListener("resize", this.handleResize);
    this.runTests();
    this.reset(false);
    requestAnimationFrame(this.animate);
  }

  private readonly handleResize = () => {
    const { camera, composer, renderer } = this.sceneBundle;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  };

  private gridToWorld(position: Cell) {
    return new THREE.Vector3(position.x * CELL_SIZE, FLOOR_Y, position.z * CELL_SIZE);
  }

  private same(a: Cell | null | undefined, b: Cell | null | undefined) {
    return Boolean(a && b && a.x === b.x && a.z === b.z);
  }

  private directionToVector(direction: Direction) {
    return new THREE.Vector3(direction.x, 0, direction.z).normalize();
  }

  private requestStart() {
    if (this.running || (this.dead && performance.now() < this.deathAnimationUntil)) {
      return;
    }

    this.reset(true);
  }

  private isOccupied(position: Cell) {
    return this.snake.some((cell) => this.same(cell, position)) || this.obstacles.some((cell) => this.same(cell, position));
  }

  private cellsForWall(start: Cell, direction: Direction, length: number) {
    return Array.from({ length }, (_, index) => ({
      x: start.x + direction.x * index,
      z: start.z + direction.z * index
    }));
  }

  private cellsForCornerWall(start: Cell, direction: Direction, length: number, turn: Direction, turnLength: number) {
    const cells = this.cellsForWall(start, direction, length);
    const corner = cells[cells.length - 1];

    for (let index = 1; index < turnLength; index++) {
      cells.push({
        x: corner.x + turn.x * index,
        z: corner.z + turn.z * index
      });
    }

    return cells;
  }

  private areCellsFree(cells: Cell[]) {
    return cells.every((position) =>
      Math.abs(position.x) < HALF_GRID - 1 &&
      Math.abs(position.z) < HALF_GRID - 1 &&
      !this.isOccupied(position) &&
      (!this.foodPos || !this.same(position, this.foodPos))
    );
  }

  private randomFreeCell(): Cell {
    let attempts = 0;
    while (attempts++ < 2000) {
      const position = {
        x: THREE.MathUtils.randInt(-HALF_GRID + 1, HALF_GRID - 1),
        z: THREE.MathUtils.randInt(-HALF_GRID + 1, HALF_GRID - 1)
      };
      if (!this.isOccupied(position) && (!this.foodPos || !this.same(position, this.foodPos))) {
        return position;
      }
    }

    return { x: 0, z: 0 };
  }

  private pickFoodType() {
    const totalWeight = FOOD_TYPE_LIST.reduce((sum, type) => sum + type.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const foodType of FOOD_TYPE_LIST) {
      roll -= foodType.weight;
      if (roll <= 0) {
        return foodType;
      }
    }

    return FOOD_TYPES.bonus;
  }

  private loadHighScore() {
    const storedScore = Number.parseInt(window.localStorage.getItem(HIGH_SCORE_STORAGE_KEY) ?? "0", 10);
    return Number.isFinite(storedScore) ? Math.max(0, storedScore) : 0;
  }

  private setScore(score: number) {
    this.score = score;
    this.dom.scoreEl.textContent = String(this.score);

    if (this.score <= this.highScore) {
      return;
    }

    this.highScore = this.score;
    this.dom.highScoreEl.textContent = String(this.highScore);
    window.localStorage.setItem(HIGH_SCORE_STORAGE_KEY, String(this.highScore));
  }

  private applyFoodVisuals() {
    const { food, foodBeacon, foodBeaconLight, foodLight, foodMat } = this.sceneBundle;

    foodMat.color.setHex(this.activeFoodType.color);
    foodMat.emissive.setHex(this.activeFoodType.emissive);
    foodLight.color.setHex(this.activeFoodType.emissive);
    foodBeaconLight.color.setHex(this.activeFoodType.emissive);
    const beaconMaterial = foodBeacon.material;
    if (beaconMaterial instanceof THREE.MeshBasicMaterial) {
      beaconMaterial.color.setHex(this.activeFoodType.emissive);
    }
  }

  private setDebugFoodType(index: number) {
    if (this.dead || !this.foodPos || !FOOD_TYPE_LIST[index]) {
      return;
    }

    this.activeFoodType = FOOD_TYPE_LIST[index];
    this.applyFoodVisuals();
  }

  private placeFood() {
    const { food, foodBeacon, foodBeaconLight, foodLight } = this.sceneBundle;

    this.activeFoodType = this.pickFoodType();
    this.dom.floatingFoodName.textContent = "";
    this.dom.floatingFoodDescription.textContent = "";
    this.dom.floatingFoodInfo.style.display = "none";
    this.applyFoodVisuals();

    this.foodPos = this.randomFreeCell();
    food.position.copy(this.gridToWorld(this.foodPos));
    food.rotation.set(Math.random(), Math.random(), Math.random());
    foodLight.position.copy(food.position).add(new THREE.Vector3(0, 2.5, 0));
    foodBeacon.position.copy(food.position).add(new THREE.Vector3(0, 3.2, 0));
    foodBeaconLight.position.copy(foodBeacon.position).add(new THREE.Vector3(0, 1.3, 0));
  }

  private imminentSnakeCells() {
    const cells: Cell[] = [];
    const head = this.snake[0];

    for (let i = 1; i <= 8; i++) {
      cells.push({ x: head.x + this.dir.x * i, z: head.z + this.dir.z * i });
      cells.push({ x: head.x + this.dir.x * i + this.dir.z, z: head.z + this.dir.z * i - this.dir.x });
      cells.push({ x: head.x + this.dir.x * i - this.dir.z, z: head.z + this.dir.z * i + this.dir.x });
    }

    for (let x = -3; x <= 3; x++) {
      for (let z = -3; z <= 3; z++) {
        if (Math.abs(x) + Math.abs(z) <= 4) {
          cells.push({ x: head.x + x, z: head.z + z });
        }
      }
    }

    return cells;
  }

  private isSafeObstaclePlacement(cells: Cell[]) {
    const danger = this.imminentSnakeCells();
    return cells.every((cell) => !danger.some((candidate) => this.same(candidate, cell)));
  }

  private buildMazeWallPlan(): ObstacleSegment[] {
    const plan: ObstacleSegment[] = [];
    const addCorner = (start: Cell, direction: Direction, length: number, turn: Direction, turnLength: number) => {
      plan.push({
        start,
        direction,
        length,
        turn,
        turnLength,
        cells: this.cellsForCornerWall(start, direction, length, turn, turnLength)
      });
    };

    addCorner({ x: -9, z: -8 }, { x: 1, z: 0 }, 5, { x: 0, z: 1 }, 4);
    addCorner({ x: 5, z: -8 }, { x: 1, z: 0 }, 5, { x: 0, z: 1 }, 4);
    addCorner({ x: -9, z: 8 }, { x: 1, z: 0 }, 5, { x: 0, z: -1 }, 4);
    addCorner({ x: 5, z: 8 }, { x: 1, z: 0 }, 5, { x: 0, z: -1 }, 4);
    addCorner({ x: -8, z: -5 }, { x: 0, z: 1 }, 4, { x: 1, z: 0 }, 4);
    addCorner({ x: 8, z: -5 }, { x: 0, z: 1 }, 4, { x: -1, z: 0 }, 4);
    addCorner({ x: -8, z: 2 }, { x: 0, z: 1 }, 4, { x: 1, z: 0 }, 4);
    addCorner({ x: 8, z: 2 }, { x: 0, z: 1 }, 4, { x: -1, z: 0 }, 4);
    addCorner({ x: -5, z: -5 }, { x: 1, z: 0 }, 4, { x: 0, z: 1 }, 3);
    addCorner({ x: 2, z: -5 }, { x: 1, z: 0 }, 4, { x: 0, z: 1 }, 3);
    addCorner({ x: -5, z: 5 }, { x: 1, z: 0 }, 4, { x: 0, z: -1 }, 3);
    addCorner({ x: 2, z: 5 }, { x: 1, z: 0 }, 4, { x: 0, z: -1 }, 3);
    addCorner({ x: -5, z: -2 }, { x: 0, z: 1 }, 5, { x: 1, z: 0 }, 3);
    addCorner({ x: 5, z: -2 }, { x: 0, z: 1 }, 5, { x: -1, z: 0 }, 3);
    addCorner({ x: -2, z: -9 }, { x: 0, z: 1 }, 4, { x: -1, z: 0 }, 3);
    addCorner({ x: 2, z: -9 }, { x: 0, z: 1 }, 4, { x: 1, z: 0 }, 3);
    addCorner({ x: -2, z: 6 }, { x: 0, z: 1 }, 4, { x: -1, z: 0 }, 3);
    addCorner({ x: 2, z: 6 }, { x: 0, z: 1 }, 4, { x: 1, z: 0 }, 3);
    addCorner({ x: -2, z: -2 }, { x: 1, z: 0 }, 5, { x: 0, z: -1 }, 3);
    addCorner({ x: -2, z: 2 }, { x: 1, z: 0 }, 5, { x: 0, z: 1 }, 3);
    addCorner({ x: -10, z: 0 }, { x: 1, z: 0 }, 4, { x: 0, z: -1 }, 3);
    addCorner({ x: 7, z: 0 }, { x: 1, z: 0 }, 4, { x: 0, z: 1 }, 3);

    return plan.sort(() => Math.random() - 0.5);
  }

  private renderObstacleWall(segment: ObstacleSegment) {
    const { obstacleGroup, obstacleMats } = this.sceneBundle;

    this.obstacles.push(...segment.cells);
    this.obstacleSegments.push(segment);

    const minX = Math.min(...segment.cells.map((cell) => cell.x));
    const maxX = Math.max(...segment.cells.map((cell) => cell.x));
    const minZ = Math.min(...segment.cells.map((cell) => cell.z));
    const maxZ = Math.max(...segment.cells.map((cell) => cell.z));
    const boundsCenter = this.gridToWorld({ x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 }).add(new THREE.Vector3(0, 0.35, 0));
    const material = obstacleMats[THREE.MathUtils.randInt(0, obstacleMats.length - 1)];
    const geometries: THREE.BufferGeometry[] = [];
    const addLeg = (cells: Cell[]) => {
      const horizontal = cells.length > 1 && cells[0].z === cells[cells.length - 1].z;
      const sizeX = horizontal ? cells.length * CELL_SIZE - 0.28 : 1.65;
      const sizeZ = horizontal ? 1.65 : cells.length * CELL_SIZE - 0.28;
      const first = this.gridToWorld(cells[0]);
      const last = this.gridToWorld(cells[cells.length - 1]);
      const center = first.clone().add(last).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.35, 0));
      const geometry = new RoundedBoxGeometry(sizeX, 2.2, sizeZ, 4, 0.34);
      geometry.translate(center.x - boundsCenter.x, center.y - boundsCenter.y, center.z - boundsCenter.z);
      geometries.push(geometry);
    };

    const firstLeg = this.cellsForWall(segment.start, segment.direction, segment.length);
    addLeg(firstLeg);

    if (segment.turn && segment.turnLength && segment.turnLength > 1) {
      const corner = firstLeg[firstLeg.length - 1];
      addLeg(this.cellsForWall(corner, segment.turn, segment.turnLength));
    }

    const geometry = mergeGeometries(geometries, false) ?? geometries[0];
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(boundsCenter);
    mesh.userData.wallSize = {
      x: (maxX - minX + 1) * CELL_SIZE,
      y: 2.2,
      z: (maxZ - minZ + 1) * CELL_SIZE
    };
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    obstacleGroup.add(mesh);
    this.obstacleMeshes.push(mesh);
  }

  private addObstacle() {
    for (let index = 0; index < this.mazeWallPlan.length; index++) {
      const segment = this.mazeWallPlan[index];
      if (!this.areCellsFree(segment.cells) || !this.isSafeObstaclePlacement(segment.cells)) {
        continue;
      }

      this.mazeWallPlan.splice(index, 1);
      this.renderObstacleWall(segment);
      return;
    }
  }

  private spawnWallExplosion(mesh: THREE.Mesh) {
    const { blastParticleGeo, particleGroup } = this.sceneBundle;
    const size = mesh.userData.wallSize as { x?: number; y?: number; z?: number } | undefined;
    const params = mesh.geometry instanceof THREE.BoxGeometry ? mesh.geometry.parameters : undefined;
    const halfX = (size?.x ?? params?.width ?? 1) / 2;
    const halfY = (size?.y ?? params?.height ?? 1) / 2;
    const halfZ = (size?.z ?? params?.depth ?? 1) / 2;

    for (let i = 0; i < 22; i++) {
      const meshMaterial = mesh.material;
      const sourceMaterial = Array.isArray(meshMaterial) ? meshMaterial[0] : meshMaterial;
      const color = sourceMaterial instanceof THREE.MeshStandardMaterial ? sourceMaterial.color.clone() : new THREE.Color(0xffffff);

      const particleMaterial = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.9,
        roughness: 0.4,
        metalness: 0.1,
        transparent: true,
        opacity: 1
      });

      const particle = new THREE.Mesh(blastParticleGeo, particleMaterial) as BlastParticle;
      particle.position.set(
        mesh.position.x + THREE.MathUtils.randFloatSpread(halfX * 1.35),
        mesh.position.y + THREE.MathUtils.randFloatSpread(halfY * 0.95),
        mesh.position.z + THREE.MathUtils.randFloatSpread(halfZ * 1.35)
      );
      particle.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      particle.scale.setScalar(THREE.MathUtils.randFloat(0.7, 1.45));
      particle.userData = {
        velocity: new THREE.Vector3(
          THREE.MathUtils.randFloatSpread(5.5),
          THREE.MathUtils.randFloat(2.6, 6.8),
          THREE.MathUtils.randFloatSpread(5.5)
        ),
        spin: new THREE.Vector3(
          THREE.MathUtils.randFloatSpread(8),
          THREE.MathUtils.randFloatSpread(8),
          THREE.MathUtils.randFloatSpread(8)
        ),
        life: 0.75
      };

      particleGroup.add(particle);
      this.blastParticles.push(particle);
    }
  }

  private updateBlastParticles(dt: number) {
    const { particleGroup } = this.sceneBundle;

    for (let index = this.blastParticles.length - 1; index >= 0; index--) {
      const particle = this.blastParticles[index];
      particle.userData.life -= dt;

      if (particle.userData.life <= 0) {
        particleGroup.remove(particle);
        particle.material.dispose();
        this.blastParticles.splice(index, 1);
        continue;
      }

      particle.userData.velocity.y -= 7.8 * dt;
      particle.position.addScaledVector(particle.userData.velocity, dt);
      particle.rotation.x += particle.userData.spin.x * dt;
      particle.rotation.y += particle.userData.spin.y * dt;
      particle.rotation.z += particle.userData.spin.z * dt;

      const material = particle.material;
      if (material instanceof THREE.MeshStandardMaterial) {
        material.opacity = Math.max(0, particle.userData.life / 0.75);
      }
    }
  }

  private isSegmentInFrontOfSnake(segment: ObstacleSegment) {
    const head = this.snake[0];
    return segment.cells.some((cell) => {
      const dx = cell.x - head.x;
      const dz = cell.z - head.z;
      return dx * this.dir.x + dz * this.dir.z > 0;
    });
  }

  private removeObstacleAt(index: number, explode = false) {
    const { obstacleGroup } = this.sceneBundle;
    const mesh = this.obstacleMeshes[index];
    const segment = this.obstacleSegments[index];

    if (!mesh || !segment) {
      return false;
    }

    if (explode) {
      this.spawnWallExplosion(mesh);
    }

    obstacleGroup.remove(mesh);
    mesh.geometry.dispose();
    this.disposeMaterial(mesh.material);
    this.mazeWallPlan.push(segment);
    this.obstacleMeshes.splice(index, 1);
    this.obstacleSegments.splice(index, 1);
    return true;
  }

  private clearObstacles(count = Number.POSITIVE_INFINITY, explode = false, onlyInFront = false) {
    let removed = 0;

    for (let index = this.obstacleMeshes.length - 1; index >= 0 && removed < count; index--) {
      const segment = this.obstacleSegments[index];
      if (onlyInFront && !this.isSegmentInFrontOfSnake(segment)) {
        continue;
      }

      if (this.removeObstacleAt(index, explode)) {
        removed++;
      }
    }

    this.obstacles = [];
    for (const segment of this.obstacleSegments) {
      this.obstacles.push(...segment.cells);
    }
  }

  private wrapPosition(position: Cell): Cell {
    return {
      x: position.x > HALF_GRID ? -HALF_GRID : position.x < -HALF_GRID ? HALF_GRID : position.x,
      z: position.z > HALF_GRID ? -HALF_GRID : position.z < -HALF_GRID ? HALF_GRID : position.z
    };
  }

  private createRoundedBoxGeometry(width: number, height: number, depth: number, radius: number, segments: number) {
    const shape = new THREE.Shape();
    const x = -width / 2;
    const y = -height / 2;
    const safeRadius = Math.min(radius, width / 2, height / 2);

    shape.moveTo(x + safeRadius, y);
    shape.lineTo(x + width - safeRadius, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
    shape.lineTo(x + width, y + height - safeRadius);
    shape.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
    shape.lineTo(x + safeRadius, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
    shape.lineTo(x, y + safeRadius);
    shape.quadraticCurveTo(x, y, x + safeRadius, y);

    const geometry = new THREE.ExtrudeGeometry(shape, {
      bevelEnabled: true,
      bevelSegments: segments,
      bevelSize: safeRadius,
      bevelThickness: safeRadius,
      curveSegments: segments,
      depth,
      steps: 1
    });

    geometry.center();
    geometry.computeVertexNormals();
    return geometry;
  }

  private ensureMeshes() {
    const { snakeGroup, headMat, snakeMat } = this.sceneBundle;

    while (this.meshes.length < this.snake.length) {
      const mesh = new THREE.Mesh(this.segmentGeometry, this.meshes.length === 0 ? headMat : snakeMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      snakeGroup.add(mesh);
      this.meshes.push(mesh);
    }

    while (this.meshes.length > this.snake.length) {
      const mesh = this.meshes.pop();
      if (!mesh) break;
      snakeGroup.remove(mesh);
    }
  }

  private updateSnakeMeshes(alpha = 1) {
    const { headGlow, headGlowLight, headGlowMat } = this.sceneBundle;
    const now = performance.now();
    const turning = now < this.turnAnimationUntil;
    const turnProgress = turning
      ? THREE.MathUtils.clamp((now - this.turnAnimationStartedAt) / (this.turnAnimationUntil - this.turnAnimationStartedAt), 0, 1)
      : 1;
    const turnEase = turning ? Math.sin(turnProgress * Math.PI) : 0;

    this.ensureMeshes();

    for (let index = 0; index < this.snake.length; index++) {
      const target = this.gridToWorld(this.snake[index]);
      this.meshes[index].position.lerp(target, alpha);
      const scale = index === 0 ? 1.1 : Math.max(0.62, 1 - index * 0.015);
      this.meshes[index].scale.setScalar(scale);
      if (!this.dead) {
        const lean = this.turnDirection * turnEase * Math.max(0.05, 0.22 - index * 0.026);
        this.meshes[index].rotation.set(0, 0, lean);
      }
    }

    const headPosition = this.meshes[0].position;
    headGlow.position.copy(headPosition);
    const glowRemaining = this.headGlowUntil - now;
    const glowActive = glowRemaining > 0;
    const shouldFlash = glowActive && now >= this.headGlowFlashStartsAt;
    const flash = shouldFlash ? 0.5 + Math.sin(now * 0.026) * 0.5 : 0;
    headGlow.visible = glowActive;
    headGlow.scale.setScalar(1.08 + flash * 0.28);
    headGlowMat.opacity = glowActive ? 0.28 + flash * 0.32 : 0;
    headGlowLight.position.copy(headPosition).add(new THREE.Vector3(0, 1.4, 0));
    headGlowLight.intensity = glowActive ? 1.25 + flash * 2.75 : 0;
  }

  private updateGhostCollisionVisuals(now: number) {
    const ghostActive = this.ghostStepsRemaining > 0;
    const currentStepTime = this.fastStepsRemaining > 0 ? this.stepTime / 1.5 : this.stepTime;
    const remainingMs = this.ghostStepsRemaining * currentStepTime * 1000;
    const shouldFlash = ghostActive && remainingMs <= 2000;
    const flash = shouldFlash ? 0.5 + Math.sin(now * 0.032) * 0.5 : 0;
    const opacity = ghostActive ? 0.28 + flash * 0.72 : 1;

    for (let index = 1; index < this.meshes.length; index++) {
      this.setMeshOpacity(this.meshes[index], opacity);
    }

    for (const obstacle of this.obstacleMeshes) {
      this.setMeshOpacity(obstacle, opacity);
    }
  }

  private setMeshOpacity(mesh: THREE.Mesh, opacity: number) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) {
        continue;
      }

      material.opacity = opacity;
      material.transparent = opacity < 1;
      material.depthWrite = opacity >= 1;
      material.needsUpdate = true;
    }
  }

  private setDirectionFromKeys() {
    const reversed = this.reverseControlsStepsRemaining > 0;
    const leftTurn = reversed ? { x: -this.dir.z, z: this.dir.x } : { x: this.dir.z, z: -this.dir.x };
    const rightTurn = reversed ? { x: this.dir.z, z: -this.dir.x } : { x: -this.dir.z, z: this.dir.x };

    if (this.input.has("arrowleft") || this.input.has("a")) {
      this.nextDir = leftTurn;
      this.input.consume("arrowleft");
      this.input.consume("a");
    }

    if (this.input.has("arrowright") || this.input.has("d")) {
      this.nextDir = rightTurn;
      this.input.consume("arrowright");
      this.input.consume("d");
    }
  }

  private startTurnAnimation(previous: Direction, next: Direction) {
    if (previous.x === next.x && previous.z === next.z) {
      return;
    }

    const now = performance.now();
    const cross = previous.x * next.z - previous.z * next.x;
    this.turnDirection = Math.sign(cross);
    this.turnAnimationStartedAt = now;
    this.turnAnimationUntil = now + Math.min(300, Math.max(170, this.stepTime * 850));
  }

  private updateWrapRipple(now: number) {
    const active = this.wrapStepsRemaining > 0;
    const pulse = active ? 1 + Math.sin(now * 0.012) * 0.08 : 1;
    const glow = active ? 0.45 + Math.sin(now * 0.012) * 0.22 : 0;

    for (const wall of this.obstacleMeshes) {
      wall.scale.y = pulse;
      const material = wall.material;
      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissiveIntensity = active ? 1.45 + glow : 1.0;
      }
    }
  }

  private activatePickupVisual(foodType: FoodType, durationMs = 3000) {
    const { headGlowLight, headGlowMat } = this.sceneBundle;
    const now = performance.now();

    if (foodType.word) {
      this.pickupLabelUntil = now + 1000;
      this.pickupLabelWord = foodType.word;
    }
    this.pickupLabelColor = foodType.color;
    this.pickupLabelEmissive = foodType.emissive;
    this.headGlowUntil = now + durationMs;
    this.headGlowFlashStartsAt = this.headGlowUntil - 2000;

    headGlowMat.color.setHex(foodType.emissive);
    headGlowLight.color.setHex(foodType.emissive);
  }

  private removeTemporaryDoubleLength() {
    const removeCount = Math.min(this.doubleLengthSegments, Math.max(0, this.snake.length - 4));

    for (let index = 0; index < removeCount; index++) {
      this.snake.pop();
    }

    this.doubleLengthSegments = 0;
    this.doubleLengthStepsRemaining = 0;
  }

  private applyTemporaryDoubleLength() {
    this.removeTemporaryDoubleLength();

    const addedSegments = this.snake.length;
    for (let index = 0; index < addedSegments; index++) {
      const tail = this.snake[this.snake.length - 1];
      this.snake.push({ ...tail });
    }

    this.doubleLengthSegments = addedSegments;
    this.doubleLengthStepsRemaining = 18;
  }

  private step() {
    const previousDir = { ...this.dir };
    this.dir = this.nextDir;
    this.startTurnAnimation(previousDir, this.dir);
    const head = this.snake[0];
    let newHead: Cell = { x: head.x + this.dir.x, z: head.z + this.dir.z };

    const wouldHitWall = Math.abs(newHead.x) > HALF_GRID || Math.abs(newHead.z) > HALF_GRID;
    if (wouldHitWall && this.wrapStepsRemaining > 0) {
      newHead = this.wrapPosition(newHead);
    }

    const hitWall = Math.abs(newHead.x) > HALF_GRID || Math.abs(newHead.z) > HALF_GRID;
    const hitSelf = this.ghostStepsRemaining <= 0 && this.snake.some((part, index) => index > 0 && this.same(part, newHead));
    const hitObstacle = this.ghostStepsRemaining <= 0 && this.wrapStepsRemaining <= 0 && this.obstacles.some((cell) => this.same(cell, newHead));

    if (hitWall || hitSelf || hitObstacle) {
      this.gameOver();
      return;
    }

    this.snake.unshift(newHead);

    if (this.foodPos && this.same(newHead, this.foodPos)) {
      const foodType = this.activeFoodType;
      let glowDurationMs = 3000;

      this.setScore(this.score + foodType.points);

      const growBy = foodType.grow - 1;
      for (let i = 0; i < growBy; i++) {
        const tail = this.snake[this.snake.length - 1];
        this.snake.push({ ...tail });
      }

      if (foodType === FOOD_TYPES.slow) {
        this.slowStepsRemaining = 18;
        this.stepTime = Math.min(0.58, this.stepTime * 1.22);
        glowDurationMs = this.slowStepsRemaining * this.stepTime * 1000;
      } else {
        this.stepTime = Math.max(0.22, this.stepTime * 0.97);
      }

      if (foodType === FOOD_TYPES.fast) {
        this.fastStepsRemaining = 18;
        glowDurationMs = this.fastStepsRemaining * (this.stepTime / 1.5) * 1000;
      }
      if (foodType === FOOD_TYPES.reverse) {
        this.reverseControlsStepsRemaining = 18;
        glowDurationMs = this.reverseControlsStepsRemaining * this.stepTime * 1000;
      }
      if (foodType === FOOD_TYPES.double) {
        this.applyTemporaryDoubleLength();
        glowDurationMs = this.doubleLengthStepsRemaining * this.stepTime * 1000;
      }
      if (foodType === FOOD_TYPES.ghost) {
        this.ghostStepsRemaining = 16;
        glowDurationMs = this.ghostStepsRemaining * this.stepTime * 1000;
      }

      this.activatePickupVisual(foodType, glowDurationMs);

      this.placeFood();
    } else {
      this.snake.pop();
    }

    if (this.slowStepsRemaining > 0) {
      this.slowStepsRemaining--;
      if (this.slowStepsRemaining === 0) {
        this.stepTime = Math.max(0.22, this.stepTime * 0.84);
      }
    }
    if (this.fastStepsRemaining > 0) this.fastStepsRemaining--;
    if (this.wrapStepsRemaining > 0) this.wrapStepsRemaining--;
    if (this.ghostStepsRemaining > 0) this.ghostStepsRemaining--;
    if (this.doubleLengthStepsRemaining > 0) {
      this.doubleLengthStepsRemaining--;
      if (this.doubleLengthStepsRemaining === 0) {
        this.removeTemporaryDoubleLength();
      }
    }
    if (this.reverseControlsStepsRemaining > 0) this.reverseControlsStepsRemaining--;
    this.updateSnakeMeshes(0.55);
  }

  private updateFloatingFoodInfo() {
    if (performance.now() > this.pickupLabelUntil) {
      this.dom.floatingFoodInfo.style.display = "none";
      return;
    }

    this.dom.floatingFoodName.textContent = this.pickupLabelWord;
    this.dom.floatingFoodInfo.style.display = "block";
    this.dom.floatingFoodInfo.style.borderColor = `#${this.pickupLabelColor.toString(16).padStart(6, "0")}`;
    this.dom.floatingFoodInfo.style.boxShadow = `0 18px 60px rgba(0,0,0,.5), 0 0 34px #${this.pickupLabelEmissive.toString(16).padStart(6, "0")}`;

    const headWorld = this.gridToWorld(this.snake[0]).add(new THREE.Vector3(0, 3.1, 0));
    const screen = headWorld.clone().project(this.sceneBundle.camera);
    const x = (screen.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-screen.y * 0.5 + 0.5) * window.innerHeight;

    this.dom.floatingFoodInfo.style.left = `${THREE.MathUtils.clamp(x, 170, window.innerWidth - 170)}px`;
    this.dom.floatingFoodInfo.style.top = `${THREE.MathUtils.clamp(y, 70, window.innerHeight - 110)}px`;
  }

  private updateCamera(dt: number) {
    const head = this.snake[0];
    const cameraSegmentIndex = Math.min(5, this.snake.length - 1);
    const headWorld = this.gridToWorld(head);
    const targetForward = this.directionToVector(this.dir);
    this.visualForward.lerp(targetForward, 1 - Math.pow(0.0008, dt)).normalize();
    const forward = this.visualForward;
    const camera = this.sceneBundle.camera;
    const cameraDistance = cameraSegmentIndex * CELL_SIZE + 2.8;

    const desired = headWorld
      .clone()
      .add(forward.clone().multiplyScalar(-cameraDistance))
      .add(new THREE.Vector3(0, 7.2, 0));

    camera.position.lerp(desired, 1 - Math.pow(0.004, dt));

    const bodyCenter = this.snake
      .reduce<THREE.Vector3>((sum, cell) => sum.add(this.gridToWorld(cell)), new THREE.Vector3())
      .multiplyScalar(1 / this.snake.length)
      .add(new THREE.Vector3(0, 0.9, 0));

    const bodyFocus = THREE.MathUtils.clamp((this.snake.length - 6) / 18, 0, 0.62);
    const targetFov = THREE.MathUtils.clamp(76 + Math.max(0, this.snake.length - 6) * 1.45, 76, 110);
    const fovNext = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.pow(0.01, dt));
    if (Math.abs(camera.fov - fovNext) > 0.01) {
      camera.fov = fovNext;
      camera.updateProjectionMatrix();
    }

    const target = headWorld
      .clone()
      .add(forward.clone().multiplyScalar(4.2))
      .add(new THREE.Vector3(0, 0.9, 0))
      .lerp(bodyCenter, bodyFocus);

    camera.lookAt(target);
  }

  private startDeathAnimation() {
    const headPosition = this.meshes[0]?.position.clone() ?? new THREE.Vector3();
    this.deathAnimationUntil = performance.now() + 1200;
    this.deathDebris = this.meshes.map((mesh, index) => {
      const awayFromHead = mesh.position.clone().sub(headPosition);

      if (awayFromHead.lengthSq() < 0.01) {
        awayFromHead.set(this.dir.x, 0, this.dir.z).multiplyScalar(-1);
      }

      const scatter = awayFromHead
        .normalize()
        .multiplyScalar(4.8 + index * 0.12)
        .add(new THREE.Vector3((Math.random() - 0.5) * 2.2, 6.5 + Math.random() * 3, (Math.random() - 0.5) * 2.2));

      return {
        velocity: scatter,
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 8
        )
      };
    });
  }

  private updateDeathAnimation(dt: number, now: number) {
    if (!this.dead) {
      return;
    }

    if (now >= this.deathAnimationUntil) {
      this.showGameOverOverlay();
      return;
    }

    const remaining = Math.max(0, (this.deathAnimationUntil - now) / 1200);
    const scaleFloor = 0.18 + remaining * 0.82;

    for (let index = 0; index < this.meshes.length; index++) {
      const debris = this.deathDebris[index];
      const mesh = this.meshes[index];

      if (!debris) {
        continue;
      }

      debris.velocity.y -= 11 * dt;
      mesh.position.addScaledVector(debris.velocity, dt);
      mesh.rotation.x += debris.spin.x * dt;
      mesh.rotation.y += debris.spin.y * dt;
      mesh.rotation.z += debris.spin.z * dt;
      mesh.scale.setScalar((index === 0 ? 1.1 : Math.max(0.62, 1 - index * 0.015)) * scaleFloor);
    }
  }

  private showGameOverOverlay() {
    if (this.gameOverOverlayShown) {
      return;
    }

    this.gameOverOverlayShown = true;
    this.dom.message.classList.remove("hidden");
    this.dom.startBtn.disabled = false;
    this.dom.messageTitle.textContent = "Game over";
    this.dom.messageCopy.innerHTML = `Score: <strong>${this.score}</strong>. High score: <strong>${this.highScore}</strong>.`;
    this.dom.startBtn.textContent = "Play again";
  }

  private gameOver() {
    this.dead = true;
    this.running = false;
    this.gameOverOverlayShown = false;
    this.startDeathAnimation();
    this.dom.message.classList.add("hidden");
    this.dom.startBtn.disabled = true;
    this.dom.startBtn.textContent = "Play again";
  }

  private reset(startNow = false) {
    const { camera, headGlow, headGlowLight, particleGroup } = this.sceneBundle;

    this.snake = [
      { x: 0, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: 2 },
      { x: 0, z: 3 }
    ];
    this.dir = { x: 0, z: -1 };
    this.nextDir = { ...this.dir };
    this.visualForward.copy(this.directionToVector(this.dir));
    this.setScore(0);
    this.moveTimer = 0;
    this.stepTime = 0.28;
    this.slowStepsRemaining = 0;
    this.fastStepsRemaining = 0;
    this.wrapStepsRemaining = 0;
    this.ghostStepsRemaining = 0;
    this.doubleLengthStepsRemaining = 0;
    this.doubleLengthSegments = 0;
    this.reverseControlsStepsRemaining = 0;
    this.headGlowUntil = 0;
    this.headGlowFlashStartsAt = 0;
    this.pickupLabelUntil = 0;
    this.pickupLabelWord = "";
    this.pickupLabelColor = 0xffffff;
    this.pickupLabelEmissive = 0xffffff;
    this.obstacles = [];
    this.deathDebris = [];
    this.deathAnimationUntil = 0;
    this.gameOverOverlayShown = false;
    this.turnAnimationStartedAt = 0;
    this.turnAnimationUntil = 0;
    this.turnDirection = 0;
    this.foodPos = null;
    this.dead = false;
    this.running = startNow;
    this.lastTime = performance.now();

    headGlow.visible = false;
    headGlowLight.intensity = 0;
    this.input.clear();

    while (this.blastParticles.length) {
      const particle = this.blastParticles.pop();
      if (!particle) continue;
      particleGroup.remove(particle);
      particle.material.dispose();
    }

    this.clearObstacles();
    this.obstacleSegments = [];
    this.mazeWallPlan = this.buildMazeWallPlan();
    this.dom.messageTitle.textContent = "Snake 3D";
    this.dom.messageCopy.textContent = "";
    this.dom.startBtn.textContent = startNow ? "Play again" : "Start game";
    this.dom.startBtn.disabled = false;

    this.updateSnakeMeshes(1);
    this.updateGhostCollisionVisuals(performance.now());
    this.placeFood();
    camera.fov = 76;
    camera.updateProjectionMatrix();
    camera.position.set(0, 10, 12);

    if (startNow) {
      this.dom.message.classList.add("hidden");
    } else {
      this.dom.message.classList.remove("hidden");
    }
  }

  private runTests() {
    console.groupCollapsed("Snake game sanity tests");
    console.assert(this.same({ x: 1, z: 2 }, { x: 1, z: 2 }), "same() should match equal cells");
    console.assert(!this.same({ x: 1, z: 2 }, { x: 2, z: 1 }), "same() should reject different cells");

    const wallCells = this.cellsForWall({ x: 2, z: 3 }, { x: 1, z: 0 }, 3);
    console.assert(wallCells.length === 3, "cellsForWall() should create requested length");
    console.assert(this.same(wallCells[0], { x: 2, z: 3 }) && this.same(wallCells[2], { x: 4, z: 3 }), "cellsForWall() should follow direction");

    console.assert(this.same(this.wrapPosition({ x: HALF_GRID + 1, z: 0 }), { x: -HALF_GRID, z: 0 }), "wrapPosition() should wrap east to west");
    console.assert(this.same(this.wrapPosition({ x: 0, z: -HALF_GRID - 1 }), { x: 0, z: HALF_GRID }), "wrapPosition() should wrap north to south");

    this.snake = [{ x: 0, z: 0 }];
    this.dir = { x: 1, z: 0 };
    console.assert(this.isSegmentInFrontOfSnake({ start: { x: 2, z: 0 }, direction: { x: 1, z: 0 }, length: 1, cells: [{ x: 2, z: 0 }] }), "isSegmentInFrontOfSnake() should detect a wall ahead");
    console.assert(!this.isSegmentInFrontOfSnake({ start: { x: -2, z: 0 }, direction: { x: 1, z: 0 }, length: 1, cells: [{ x: -2, z: 0 }] }), "isSegmentInFrontOfSnake() should reject a wall behind");

    this.snake = [{ x: 0, z: 0 }, { x: 0, z: 1 }, { x: 0, z: 2 }, { x: 0, z: 3 }];
    this.applyTemporaryDoubleLength();
    this.applyTemporaryDoubleLength();
    console.assert(this.snake.length === 8 && this.doubleLengthSegments === 4, "Double should refresh instead of stacking exponentially");
    this.removeTemporaryDoubleLength();

    const previousParticleCount = this.blastParticles.length;
    this.updateBlastParticles(0);
    console.assert(this.blastParticles.length === previousParticleCount, "updateBlastParticles(0) should be safe before gameplay");
    console.groupEnd();
  }

  private disposeMaterial(material: THREE.Material | THREE.Material[]) {
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
      return;
    }

    material.dispose();
  }

  private readonly animate = (now: number) => {
    const { camera, composer, food, foodBeacon, foodBeaconLight, foodLight } = this.sceneBundle;
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    food.rotation.x += dt * 1.7;
    food.rotation.y += dt * 2.3;
    food.position.y = FLOOR_Y + Math.sin(now * 0.005) * 0.18;
    foodLight.position.copy(food.position).add(new THREE.Vector3(0, 2.5, 0));
    foodBeacon.position.set(food.position.x, FLOOR_Y + 3.35 + Math.sin(now * 0.004) * 0.22, food.position.z);
    foodBeacon.rotation.y += dt * 2.1;
    foodBeacon.scale.setScalar(1 + Math.sin(now * 0.006) * 0.12);
    foodBeaconLight.position.copy(foodBeacon.position).add(new THREE.Vector3(0, 1.3, 0));
    this.updateBlastParticles(dt);

    if (this.running && !this.dead) {
      this.setDirectionFromKeys();
      this.moveTimer += dt;
      this.updateWrapRipple(now);

      const speed = this.fastStepsRemaining > 0 ? this.stepTime / 1.5 : this.stepTime;
      while (this.moveTimer >= speed) {
        this.moveTimer -= speed;
        this.step();
      }

      this.updateSnakeMeshes(0.2);
      this.updateGhostCollisionVisuals(now);
      this.updateCamera(dt);
      this.updateFloatingFoodInfo();
    } else if (this.snake.length > 0) {
      this.updateWrapRipple(now);
      this.updateGhostCollisionVisuals(now);
      this.updateDeathAnimation(dt, now);
      if (!this.dead || now >= this.deathAnimationUntil) {
        camera.position.lerp(new THREE.Vector3(0, 24, 28), 0.025);
        camera.lookAt(0, 0, 0);
      }
    }

    composer.render();
    requestAnimationFrame(this.animate);
  };
}
