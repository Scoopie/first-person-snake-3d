import type { GameDom } from "./types";

interface InputCallbacks {
  onDebugFoodType: (index: number) => void;
  onStart: () => void;
}

export class InputController {
  private readonly keys = new Set<string>();

  constructor(
    private readonly dom: GameDom,
    private readonly callbacks: InputCallbacks
  ) {}

  bind() {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);

    this.dom.canvas.addEventListener("pointerdown", this.handleCanvasPointerDown);
    this.dom.startBtn.addEventListener("click", this.callbacks.onStart);
    this.dom.message.addEventListener("click", this.handleOverlayClick);
  }

  has(key: string) {
    return this.keys.has(key);
  }

  consume(key: string) {
    this.keys.delete(key);
  }

  clear() {
    this.keys.clear();
  }

  private tapVirtualKey(key: string) {
    this.keys.add(key);
    requestAnimationFrame(() => {
      this.keys.delete(key);
    });
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    const target = event.target;
    const typingInControl = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    this.keys.add(key);

    if (/^[1-9]$/.test(key)) {
      this.callbacks.onDebugFoodType(Number.parseInt(key, 10) - 1);
    }

    if (!typingInControl && !this.dom.message.classList.contains("hidden") && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      this.callbacks.onStart();
    }
  };

  private handleKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.key.toLowerCase());
  };

  private handleCanvasPointerDown = (event: PointerEvent) => {
    if (!this.dom.message.classList.contains("hidden")) return;
    event.preventDefault();
    this.tapVirtualKey(event.clientX < window.innerWidth / 2 ? "arrowleft" : "arrowright");
  };

  private handleOverlayClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("button, input, .leaderboard-panel")) return;
    this.callbacks.onStart();
  };
}
