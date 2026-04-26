import "./styles.css";
import { SnakeGame } from "./snake/SnakeGame";

const canvas = document.getElementById("game");

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Missing #game canvas.");
}

const game = new SnakeGame(canvas);
game.start();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  let reloadedForServiceWorkerUpdate = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadedForServiceWorkerUpdate) {
      return;
    }

    reloadedForServiceWorkerUpdate = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
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
