import type * as THREE from "three";

export interface Cell {
  x: number;
  z: number;
}

export interface Direction {
  x: number;
  z: number;
}

export interface FoodType {
  id: string;
  label: string;
  word: string;
  description: string;
  color: number;
  emissive: number;
  points: number;
  grow: number;
  weight: number;
}

export interface ObstacleSegment {
  start: Cell;
  direction: Direction;
  length: number;
  turn?: Direction;
  turnLength?: number;
  cells: Cell[];
}

export type BlastParticle = THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> & {
  userData: {
    velocity: THREE.Vector3;
    spin: THREE.Vector3;
    life: number;
  };
};

export interface GameDom {
  canvas: HTMLCanvasElement;
  scoreEl: HTMLSpanElement;
  highScoreEl: HTMLSpanElement;
  floatingFoodInfo: HTMLElement;
  floatingFoodName: HTMLElement;
  floatingFoodDescription: HTMLElement;
  message: HTMLElement;
  startBtn: HTMLButtonElement;
  messageTitle: HTMLHeadingElement;
  messageCopy: HTMLParagraphElement;
}
