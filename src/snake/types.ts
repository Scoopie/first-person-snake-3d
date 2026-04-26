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
  scorePanel: HTMLElement;
  scoreEl: HTMLSpanElement;
  floatingFoodInfo: HTMLElement;
  floatingFoodName: HTMLElement;
  message: HTMLElement;
  highScoreEntryPanel: HTMLElement;
  leaderboardList: HTMLOListElement;
  leaderboardName: HTMLInputElement;
  leaderboardPanel: HTMLElement;
  leaderboardRank: HTMLElement;
  leaderboardSkip: HTMLButtonElement;
  leaderboardStatus: HTMLElement;
  leaderboardSubmitRow: HTMLElement;
  leaderboardSubmit: HTMLButtonElement;
  startBtn: HTMLButtonElement;
  messageTitle: HTMLHeadingElement;
  messageCopy: HTMLParagraphElement;
}
