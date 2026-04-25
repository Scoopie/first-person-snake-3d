import type { FoodType } from "./types";

export const GRID_SIZE = 15;
export const CELL_SIZE = 2;
export const HALF_GRID = Math.floor(GRID_SIZE / 2);
export const FLOOR_Y = 1;

export const FOOD_TYPES: Record<string, FoodType> = {
  bonus: { id: "bonus", label: "Bonus", word: "Bonus", color: 0xfff176, emissive: 0xffff00, points: 5, weight: 14 },
  slow: { id: "slow", label: "Slow", word: "Slow", color: 0x9fd3ff, emissive: 0x2299ff, points: 2, weight: 8 },
  fast: { id: "fast", label: "Fast", word: "Fast", color: 0xff4d4d, emissive: 0xff0000, points: 4, weight: 7 },
  double: { id: "double", label: "Double", word: "Double", color: 0xffa94d, emissive: 0xff7a00, points: 3, weight: 5 },
  ghost: { id: "ghost", label: "Ghost", word: "Ghost", color: 0xd8b4fe, emissive: 0xaa66ff, points: 3, weight: 4 }
};

export const FOOD_TYPE_LIST = Object.values(FOOD_TYPES);
