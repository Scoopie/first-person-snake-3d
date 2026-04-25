import type { FoodType } from "./types";

export const GRID_SIZE = 15;
export const CELL_SIZE = 2;
export const HALF_GRID = Math.floor(GRID_SIZE / 2);
export const FLOOR_Y = 1;

export const FOOD_TYPES: Record<string, FoodType> = {
  bonus: { id: "bonus", label: "Bonus", word: "Bonus", description: "+5", color: 0xfff176, emissive: 0xffff00, points: 5, grow: 1, weight: 14 },
  slow: { id: "slow", label: "Slow", word: "Slow", description: "Slower", color: 0x9fd3ff, emissive: 0x2299ff, points: 2, grow: 1, weight: 8 },
  fast: { id: "fast", label: "Fast", word: "Fast", description: "Faster", color: 0xff4d4d, emissive: 0xff0000, points: 4, grow: 1, weight: 7 },
  reverse: { id: "reverse", label: "Reverse", word: "Reverse", description: "Reverse", color: 0xff7ab6, emissive: 0xff2277, points: 3, grow: 1, weight: 7 },
  double: { id: "double", label: "Double", word: "Double", description: "x2 length", color: 0xffa94d, emissive: 0xff7a00, points: 3, grow: 1, weight: 5 },
  ghost: { id: "ghost", label: "Ghost", word: "Ghost", description: "Pass through body", color: 0xd8b4fe, emissive: 0xaa66ff, points: 3, grow: 1, weight: 4 }
};

export const FOOD_TYPE_LIST = Object.values(FOOD_TYPES);
