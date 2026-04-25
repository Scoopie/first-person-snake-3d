import type { GameDom } from "./types";

function requireElement<T extends Element>(selector: string, type: { new (): T }): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

export function getGameDom(canvas: HTMLCanvasElement): GameDom {
  const message = requireElement("#message", HTMLDivElement);
  const messageParagraphs = message.querySelectorAll("p");
  const messageCopy = messageParagraphs.item(0);

  if (!(messageCopy instanceof HTMLParagraphElement)) {
    throw new Error("Missing primary message paragraph.");
  }

  return {
    canvas,
    scoreEl: requireElement("#score", HTMLSpanElement),
    highScoreEl: requireElement("#highScore", HTMLSpanElement),
    foodTypeEl: requireElement("#foodType", HTMLSpanElement),
    foodDescriptionEl: requireElement("#foodDescription", HTMLDivElement),
    floatingFoodInfo: requireElement("#floatingFoodInfo", HTMLDivElement),
    floatingFoodName: requireElement("#floatingFoodName", HTMLDivElement),
    floatingFoodDescription: requireElement("#floatingFoodDescription", HTMLDivElement),
    message,
    startBtn: requireElement("#startBtn", HTMLButtonElement),
    messageTitle: requireElement("#message h1", HTMLHeadingElement),
    messageCopy
  };
}
