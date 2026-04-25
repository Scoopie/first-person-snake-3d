import type { GameDom } from "./types";

interface InputCallbacks {
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
    this.keys.add(key);

    if (!this.dom.message.classList.contains("hidden") && (event.key === "Enter" || event.key === " ")) {
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
    if (target.closest("button")) return;
    this.callbacks.onStart();
  };
}
