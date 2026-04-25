import * as THREE from "three";
import { CELL_SIZE, FLOOR_Y, FOOD_TYPE_LIST, FOOD_TYPES, HALF_GRID } from "./config";
import { getGameDom } from "./dom";
import { InputController } from "./input";
import { createScene } from "./scene";
import type { BlastParticle, Cell, Direction, FoodType, GameDom, ObstacleSegment } from "./types";

const HIGH_SCORE_STORAGE_KEY = "first-person-snake-3d:high-score";

export class SnakeGame {
  private readonly dom: GameDom;
  private readonly sceneBundle;
  private readonly input: InputController;

  private snake: Cell[] = [];
  private dir: Direction = { x: 0, z: -1 };
  private nextDir: Direction = { x: 0, z: -1 };
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
  private lastTime = performance.now();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.dom = getGameDom(canvas);
    this.sceneBundle = createScene(canvas);
    this.highScore = this.loadHighScore();
    this.dom.highScoreEl.textContent = String(this.highScore);
    this.input = new InputController(this.dom, {
      onRestart: () => this.reset(true),
      onStart: () => this.reset(true)
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

  private isOccupied(position: Cell) {
    return this.snake.some((cell) => this.same(cell, position)) || this.obstacles.some((cell) => this.same(cell, position));
  }

  private cellsForWall(start: Cell, direction: Direction, length: number) {
    return Array.from({ length }, (_, index) => ({
      x: start.x + direction.x * index,
      z: start.z + direction.z * index
    }));
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

  private placeFood() {
    const { food, foodBeacon, foodBeaconLight, foodLight, foodMat } = this.sceneBundle;

    this.activeFoodType = this.pickFoodType();
    this.dom.foodTypeEl.textContent = this.activeFoodType.label;
    this.dom.foodDescriptionEl.textContent = this.activeFoodType.description;
    this.dom.floatingFoodName.textContent = "";
    this.dom.floatingFoodDescription.textContent = "";
    this.dom.floatingFoodInfo.style.display = "none";

    foodMat.color.setHex(this.activeFoodType.color);
    foodMat.emissive.setHex(this.activeFoodType.emissive);
    foodLight.color.setHex(this.activeFoodType.emissive);
    foodBeaconLight.color.setHex(this.activeFoodType.emissive);
    const beaconMaterial = foodBeacon.material;
    if (beaconMaterial instanceof THREE.MeshBasicMaterial) {
      beaconMaterial.color.setHex(this.activeFoodType.emissive);
    }

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
    const add = (start: Cell, direction: Direction, length: number) => {
      plan.push({
        start,
        direction,
        length,
        cells: this.cellsForWall(start, direction, length)
      });
    };

    add({ x: -8, z: -8 }, { x: 1, z: 0 }, 5); add({ x: 4, z: -8 }, { x: 1, z: 0 }, 5);
    add({ x: -8, z: 8 }, { x: 1, z: 0 }, 5); add({ x: 4, z: 8 }, { x: 1, z: 0 }, 5);
    add({ x: -8, z: -5 }, { x: 0, z: 1 }, 4); add({ x: 8, z: -5 }, { x: 0, z: 1 }, 4);
    add({ x: -8, z: 2 }, { x: 0, z: 1 }, 4); add({ x: 8, z: 2 }, { x: 0, z: 1 }, 4);
    add({ x: -5, z: -5 }, { x: 1, z: 0 }, 4); add({ x: 2, z: -5 }, { x: 1, z: 0 }, 4);
    add({ x: -5, z: 5 }, { x: 1, z: 0 }, 4); add({ x: 2, z: 5 }, { x: 1, z: 0 }, 4);
    add({ x: -5, z: -2 }, { x: 0, z: 1 }, 5); add({ x: 5, z: -2 }, { x: 0, z: 1 }, 5);
    add({ x: -2, z: -9 }, { x: 0, z: 1 }, 4); add({ x: 2, z: -9 }, { x: 0, z: 1 }, 4);
    add({ x: -2, z: 6 }, { x: 0, z: 1 }, 4); add({ x: 2, z: 6 }, { x: 0, z: 1 }, 4);
    add({ x: -2, z: -2 }, { x: 1, z: 0 }, 5);
    add({ x: -2, z: 2 }, { x: 1, z: 0 }, 5);
    add({ x: -10, z: 0 }, { x: 1, z: 0 }, 4); add({ x: 7, z: 0 }, { x: 1, z: 0 }, 4);
    add({ x: -10, z: -10 }, { x: 0, z: 1 }, 3); add({ x: 10, z: -10 }, { x: 0, z: 1 }, 3);
    add({ x: -10, z: 8 }, { x: 0, z: 1 }, 3); add({ x: 10, z: 8 }, { x: 0, z: 1 }, 3);

    return plan.sort(() => Math.random() - 0.5);
  }

  private renderObstacleWall(segment: ObstacleSegment) {
    const { obstacleGroup, obstacleMats } = this.sceneBundle;

    this.obstacles.push(...segment.cells);
    this.obstacleSegments.push(segment);

    const horizontal = segment.direction.x !== 0;
    const sizeX = horizontal ? segment.length * CELL_SIZE - 0.28 : 1.65;
    const sizeZ = horizontal ? 1.65 : segment.length * CELL_SIZE - 0.28;
    const first = this.gridToWorld(segment.cells[0]);
    const last = this.gridToWorld(segment.cells[segment.cells.length - 1]);
    const center = first.clone().add(last).multiplyScalar(0.5);

    const material = obstacleMats[THREE.MathUtils.randInt(0, obstacleMats.length - 1)];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sizeX, 2.2, sizeZ), material);
    mesh.position.copy(center).add(new THREE.Vector3(0, 0.35, 0));
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
    const params = mesh.geometry instanceof THREE.BoxGeometry ? mesh.geometry.parameters : { width: 1, height: 1, depth: 1 };
    const halfX = (params.width ?? 1) / 2;
    const halfY = (params.height ?? 1) / 2;
    const halfZ = (params.depth ?? 1) / 2;

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

  private ensureMeshes() {
    const { snakeGroup, headMat, snakeMat } = this.sceneBundle;

    while (this.meshes.length < this.snake.length) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.42, 1.42, 1.42), this.meshes.length === 0 ? headMat : snakeMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      snakeGroup.add(mesh);
      this.meshes.push(mesh);
    }

    while (this.meshes.length > this.snake.length) {
      const mesh = this.meshes.pop();
      if (!mesh) break;
      snakeGroup.remove(mesh);
      mesh.geometry.dispose();
    }
  }

  private updateSnakeMeshes(alpha = 1) {
    const { headGlow, headGlowLight, headGlowMat } = this.sceneBundle;

    this.ensureMeshes();

    for (let index = 0; index < this.snake.length; index++) {
      const target = this.gridToWorld(this.snake[index]);
      this.meshes[index].position.lerp(target, alpha);
      const scale = index === 0 ? 1.1 : Math.max(0.62, 1 - index * 0.015);
      this.meshes[index].scale.setScalar(scale);
    }

    const headPosition = this.meshes[0].position;
    headGlow.position.copy(headPosition);
    const now = performance.now();
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

  private updateWrapRipple(now: number) {
    const { wallGroup } = this.sceneBundle;
    const active = this.wrapStepsRemaining > 0;
    const pulse = active ? 1 + Math.sin(now * 0.012) * 0.08 : 1;
    const glow = active ? 0.45 + Math.sin(now * 0.012) * 0.22 : 0;

    for (const child of wallGroup.children) {
      if (!(child instanceof THREE.Mesh)) continue;
      child.scale.y = pulse;
      const wallMaterial = child.material;
      const material = Array.isArray(wallMaterial) ? wallMaterial[0] : wallMaterial;
      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissiveIntensity = active ? 1.15 + glow : 0.66;
      }
    }

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

  private step() {
    this.dir = this.nextDir;
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

      if (foodType.grow < 0) {
        const shrinkBy = Math.min(Math.abs(foodType.grow), Math.max(0, this.snake.length - 4));
        for (let i = 0; i < shrinkBy; i++) {
          this.snake.pop();
        }
      } else {
        for (let i = 1; i < foodType.grow; i++) {
          const tail = this.snake[this.snake.length - 1];
          this.snake.push({ ...tail });
        }
      }

      let shouldAddObstacle = true;

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
      if (foodType === FOOD_TYPES.ghost) {
        this.ghostStepsRemaining = 16;
        glowDurationMs = this.ghostStepsRemaining * this.stepTime * 1000;
      }

      this.activatePickupVisual(foodType, glowDurationMs);

      if (shouldAddObstacle) {
        this.addObstacle();
      }

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
    const cameraAnchor = this.snake[cameraSegmentIndex];
    const headWorld = this.gridToWorld(head);
    const anchorWorld = this.gridToWorld(cameraAnchor);
    const forward = new THREE.Vector3(this.dir.x, 0, this.dir.z).normalize();

    const desired = anchorWorld
      .clone()
      .add(forward.clone().multiplyScalar(-2.8))
      .add(new THREE.Vector3(0, 7.2, 0));

    this.sceneBundle.camera.position.lerp(desired, 1 - Math.pow(0.004, dt));

    const target = headWorld
      .clone()
      .add(forward.clone().multiplyScalar(4.2))
      .add(new THREE.Vector3(0, 0.9, 0));

    this.sceneBundle.camera.lookAt(target);
  }

  private gameOver() {
    this.dead = true;
    this.running = false;
    this.dom.message.classList.remove("hidden");
    this.dom.messageTitle.textContent = "Game over";
    this.dom.messageCopy.innerHTML = `Score: <strong>${this.score}</strong>. High score: <strong>${this.highScore}</strong>.`;
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
    this.setScore(0);
    this.moveTimer = 0;
    this.stepTime = 0.28;
    this.slowStepsRemaining = 0;
    this.fastStepsRemaining = 0;
    this.wrapStepsRemaining = 0;
    this.ghostStepsRemaining = 0;
    this.reverseControlsStepsRemaining = 0;
    this.headGlowUntil = 0;
    this.headGlowFlashStartsAt = 0;
    this.pickupLabelUntil = 0;
    this.pickupLabelWord = "";
    this.pickupLabelColor = 0xffffff;
    this.pickupLabelEmissive = 0xffffff;
    this.obstacles = [];
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
    this.dom.messageTitle.textContent = "First-Person Snake";
    this.dom.messageCopy.textContent = "You are the snake. Eat glowing cubes, avoid walls and your own body.";
    this.dom.startBtn.textContent = startNow ? "Play again" : "Start game";

    this.updateSnakeMeshes(1);
    this.placeFood();
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
      this.updateCamera(dt);
      this.updateFloatingFoodInfo();
    } else if (this.snake.length > 0) {
      this.updateWrapRipple(now);
      camera.position.lerp(new THREE.Vector3(0, 24, 28), 0.025);
      camera.lookAt(0, 0, 0);
    }

    composer.render();
    requestAnimationFrame(this.animate);
  };
}
