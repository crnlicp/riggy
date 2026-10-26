import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import GameApp from "./DeepDigApp";
import "./game.css";
import "./dig-scene.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GameApp />
  </StrictMode>,
);
