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
  color: number;
  emissive: number;
  points: number;
  weight: number;
}

export interface GameDom {
  canvas: HTMLCanvasElement;
  scoreEl: HTMLSpanElement;
  highScoreEl: HTMLSpanElement;
  floatingFoodInfo: HTMLElement;
  floatingFoodName: HTMLElement;
  message: HTMLElement;
  startBtn: HTMLButtonElement;
  messageTitle: HTMLHeadingElement;
  messageCopy: HTMLParagraphElement;
}
