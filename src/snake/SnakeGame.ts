import * as THREE from "three";
import { CELL_SIZE, FLOOR_Y, FOOD_TYPE_LIST, FOOD_TYPES, FOOD_Y, HALF_GRID } from "./config";
import { getGameDom } from "./dom";
import { InputController } from "./input";
import { createScene } from "./scene";
import type { Cell, Direction, FoodType, GameDom } from "./types";

const HIGH_SCORE_STORAGE_KEY = "first-person-snake-3d:high-score";
const DEFAULT_HEAD_COLOR = 0xc8fbff;
const DEFAULT_HEAD_EMISSIVE = 0x2bc8ff;

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
  private ghostStepsRemaining = 0;
  private doubleLengthStepsRemaining = 0;
  private doubleLengthSegments = 0;
  private headEffectUntil = 0;
  private headEffectFlashStartsAt = 0;
  private headEffectColor = DEFAULT_HEAD_COLOR;
  private headEffectEmissive = DEFAULT_HEAD_EMISSIVE;
  private pickupLabelUntil = 0;
  private pickupLabelWord = "";
  private pickupLabelColor = 0xffffff;
  private pickupLabelEmissive = 0xffffff;
  private meshes: THREE.Mesh[] = [];
  private deathDebris: DeathDebris[] = [];
  private deathAnimationUntil = 0;
  private gameOverOverlayShown = false;
  private turnAnimationStartedAt = 0;
  private turnAnimationUntil = 0;
  private turnDirection = 0;
  private lastTime = performance.now();

  constructor(canvas: HTMLCanvasElement) {
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
    return this.snake.some((cell) => this.same(cell, position));
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
    const { food, foodGeometries, foodLight, foodMat } = this.sceneBundle;

    food.geometry = foodGeometries[this.activeFoodType.id] ?? foodGeometries.default;
    foodMat.color.setHex(this.activeFoodType.color);
    foodMat.emissive.setHex(this.activeFoodType.emissive);
    foodLight.color.setHex(this.activeFoodType.emissive);
  }

  private setDebugFoodType(index: number) {
    if (this.dead || !this.foodPos || !FOOD_TYPE_LIST[index]) {
      return;
    }

    this.activeFoodType = FOOD_TYPE_LIST[index];
    this.applyFoodVisuals();
  }

  private placeFood() {
    const { food, foodLight } = this.sceneBundle;

    this.activeFoodType = this.pickFoodType();
    this.dom.floatingFoodName.textContent = "";
    this.dom.floatingFoodInfo.style.display = "none";
    this.applyFoodVisuals();

    this.foodPos = this.randomFreeCell();
    food.position.copy(this.gridToWorld(this.foodPos));
    food.position.y = FOOD_Y;
    food.rotation.set(0, Math.random() * Math.PI * 2, 0);
    foodLight.position.copy(food.position).add(new THREE.Vector3(0, 2.5, 0));
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
    this.updateHeadEffect(now);
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
    const leftTurn = { x: this.dir.z, z: -this.dir.x };
    const rightTurn = { x: -this.dir.z, z: this.dir.x };

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

  private resetHeadMaterial() {
    const { headMat } = this.sceneBundle;
    headMat.color.setHex(DEFAULT_HEAD_COLOR);
    headMat.emissive.setHex(DEFAULT_HEAD_EMISSIVE);
    headMat.emissiveIntensity = 0.92;
  }

  private updateHeadEffect(now: number) {
    if (this.headEffectUntil <= 0) {
      return;
    }

    if (now > this.headEffectUntil) {
      this.headEffectUntil = 0;
      this.headEffectFlashStartsAt = 0;
      this.resetHeadMaterial();
      return;
    }

    if (now < this.headEffectFlashStartsAt) {
      return;
    }

    const { headMat } = this.sceneBundle;
    const flash = 0.5 + Math.sin(now * 0.026) * 0.5;
    headMat.color.setHex(flash > 0.5 ? this.headEffectColor : DEFAULT_HEAD_COLOR);
    headMat.emissive.setHex(flash > 0.5 ? this.headEffectEmissive : DEFAULT_HEAD_EMISSIVE);
    headMat.emissiveIntensity = 0.92 + flash * 0.82;
  }

  private activatePickupVisual(foodType: FoodType, durationMs = 3000) {
    const { headMat } = this.sceneBundle;
    const now = performance.now();

    if (foodType.word) {
      this.pickupLabelUntil = now + 1000;
      this.pickupLabelWord = foodType.word;
    }
    this.pickupLabelColor = foodType.color;
    this.pickupLabelEmissive = foodType.emissive;
    this.headEffectUntil = now + durationMs;
    this.headEffectFlashStartsAt = this.headEffectUntil - 2000;
    this.headEffectColor = foodType.color;
    this.headEffectEmissive = foodType.emissive;

    headMat.color.setHex(foodType.color);
    headMat.emissive.setHex(foodType.emissive);
    headMat.emissiveIntensity = 1.35;
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

    const hitWall = Math.abs(newHead.x) > HALF_GRID || Math.abs(newHead.z) > HALF_GRID;
    const hitSelf = this.ghostStepsRemaining <= 0 && this.snake.some((part, index) => index > 0 && this.same(part, newHead));

    if (hitWall || hitSelf) {
      this.gameOver();
      return;
    }

    this.snake.unshift(newHead);

    if (this.foodPos && this.same(newHead, this.foodPos)) {
      const foodType = this.activeFoodType;
      let glowDurationMs = 3000;

      this.setScore(this.score + foodType.points);

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
    if (this.ghostStepsRemaining > 0) this.ghostStepsRemaining--;
    if (this.doubleLengthStepsRemaining > 0) {
      this.doubleLengthStepsRemaining--;
      if (this.doubleLengthStepsRemaining === 0) {
        this.removeTemporaryDoubleLength();
      }
    }
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
    const { camera } = this.sceneBundle;

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
    this.ghostStepsRemaining = 0;
    this.doubleLengthStepsRemaining = 0;
    this.doubleLengthSegments = 0;
    this.headEffectUntil = 0;
    this.headEffectFlashStartsAt = 0;
    this.headEffectColor = DEFAULT_HEAD_COLOR;
    this.headEffectEmissive = DEFAULT_HEAD_EMISSIVE;
    this.pickupLabelUntil = 0;
    this.pickupLabelWord = "";
    this.pickupLabelColor = 0xffffff;
    this.pickupLabelEmissive = 0xffffff;
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

    this.resetHeadMaterial();
    this.input.clear();
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

    this.snake = [{ x: 0, z: 0 }, { x: 0, z: 1 }, { x: 0, z: 2 }, { x: 0, z: 3 }];
    this.applyTemporaryDoubleLength();
    this.applyTemporaryDoubleLength();
    console.assert(this.snake.length === 8 && this.doubleLengthSegments === 4, "Double should refresh instead of stacking exponentially");
    this.removeTemporaryDoubleLength();
    console.groupEnd();
  }

  private readonly animate = (now: number) => {
    const { camera, composer, food, foodLight } = this.sceneBundle;
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    food.rotation.y += dt * 2.3;
    food.position.y = FOOD_Y + Math.sin(now * 0.005) * 0.18;
    foodLight.position.copy(food.position).add(new THREE.Vector3(0, 2.5, 0));

    if (this.running && !this.dead) {
      this.setDirectionFromKeys();
      this.moveTimer += dt;

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
