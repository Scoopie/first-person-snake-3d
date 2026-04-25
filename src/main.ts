import "./styles.css";
import { SnakeGame } from "./snake/SnakeGame";

const canvas = document.getElementById("game");

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Missing #game canvas.");
}

const game = new SnakeGame(canvas);
game.start();
