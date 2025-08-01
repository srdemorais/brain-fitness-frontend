// musical-ear-trainer-frontend/src/router/index.js
import { createRouter, createWebHistory } from "vue-router";
import GameView from "../views/GameView.vue"; // Import your new GameView

const routes = [
  {
    path: "/", // Set '/' to be your game view
    name: "home",
    component: GameView, // Use GameView here
  },
  {
    path: "/game", // Also allow /game specifically
    name: "game",
    component: GameView,
  },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL), // Use import.meta.env.BASE_URL for Vite
  routes,
});

export default router;
