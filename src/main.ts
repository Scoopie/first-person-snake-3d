import "./styles.css";
import { SnakeGame } from "./snake/SnakeGame";

const canvas = document.getElementById("game");

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Missing #game canvas.");
}

const game = new SnakeGame(canvas);
game.start();

const SERVICE_WORKER_VERSION = "snake-3d-v3";

function syncVisualViewportVars() {
  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  const offsetTop = viewport?.offsetTop ?? 0;

  document.documentElement.style.setProperty("--visual-viewport-height", `${height}px`);
  document.documentElement.style.setProperty("--visual-viewport-top", `${offsetTop}px`);
}

syncVisualViewportVars();
window.addEventListener("resize", syncVisualViewportVars);
window.visualViewport?.addEventListener("resize", syncVisualViewportVars);
window.visualViewport?.addEventListener("scroll", syncVisualViewportVars);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  let reloadedForServiceWorkerUpdate = false;
  let serviceWorkerRegistration: ServiceWorkerRegistration | null = null;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadedForServiceWorkerUpdate) {
      return;
    }

    reloadedForServiceWorkerUpdate = true;
    window.location.reload();
  });

  function requestServiceWorkerUpdate() {
    serviceWorkerRegistration?.update().catch(() => {
      // Update checks are opportunistic; gameplay should never depend on them.
    });
  }

  window.addEventListener("focus", requestServiceWorkerUpdate);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      requestServiceWorkerUpdate();
    }
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`./sw.js?v=${SERVICE_WORKER_VERSION}`, { updateViaCache: "none" })
      .then((registration) => {
        serviceWorkerRegistration = registration;
        registration.waiting?.postMessage({ type: "SKIP_WAITING" });
        return registration.update();
      })
      .catch(() => {
        // The game should stay playable even if install/offline support is unavailable.
      });
  });
} else if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    for (const registration of registrations) {
      await registration.unregister();
    }

    if (navigator.serviceWorker.controller && window.sessionStorage.getItem("snake-3d-dev-sw-cleared") !== "true") {
      window.sessionStorage.setItem("snake-3d-dev-sw-cleared", "true");
      window.location.reload();
    }
  });
}
