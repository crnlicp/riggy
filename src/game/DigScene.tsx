import { useEffect, useRef, useState } from "react";
import { COLLECTION_DURATION_MS, MiningBurst, PickaxeStrike, STRIKE_IMPACT_MS, type DigDirection } from "./MiningEffects";

type Loot = "coin" | "gem" | null;
type Cell = { kind: "dirt" | "stone" | "air"; loot: Loot };
type Stage = "idle" | "hammer" | "break" | "collect" | "move";
type SceneState = { x: number; y: number; cells: Cell[]; stage: Stage; target: number | null; direction: DigDirection; loot: Loot };
const SIDE = 7;

function freshCells(): Cell[] {
  return Array.from({ length: SIDE * SIDE }, () => {
    const roll = Math.random();
    const loot = roll < .11 ? "gem" : roll < .26 ? "coin" : null;
    return { kind: Math.random() < .36 ? "stone" : "dirt", loot };
  });
}

function adjacentCells(x: number, y: number) {
  return [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]
    .filter(([cx, cy]) => cx >= 0 && cx < SIDE && cy >= 0 && cy < SIDE)
    .map(([cx, cy]) => cy * SIDE + cx);
}

export default function DigScene({ variant = "" }: { variant?: string }) {
  const [scene, setScene] = useState<SceneState>(() => {
    const cells = freshCells();
    cells[SIDE + 3] = { kind: "air", loot: null };
    return { x: 3, y: 1, cells, stage: "idle", target: null, direction: "down", loot: null };
  });
  const stateRef = useRef(scene);
  stateRef.current = scene;

  useEffect(() => {
    let timer = 0;
    let alive = true;
    const commit = (next: SceneState, delay = 700) => {
      stateRef.current = next;
      setScene(next);
      timer = window.setTimeout(tick, delay);
    };
    const tick = () => {
      if (!alive) return;
      const current = stateRef.current;
      if (current.stage === "idle") {
        let cells = current.cells;
        let options = adjacentCells(current.x, current.y).filter((idx) => cells[idx].kind !== "air");
        if (!options.length) {
          cells = freshCells();
          cells[current.y * SIDE + current.x] = { kind: "air", loot: null };
          options = adjacentCells(current.x, current.y);
          for (const idx of options) {
            if (cells[idx].kind === "air") {
              const roll = Math.random();
              cells[idx] = { kind: Math.random() < .36 ? "stone" : "dirt", loot: roll < .11 ? "gem" : roll < .26 ? "coin" : null };
            }
          }
        }
        const target = options[Math.floor(Math.random() * options.length)];
        const targetX = target % SIDE;
        const targetY = Math.floor(target / SIDE);
        const direction: DigDirection = targetX < current.x ? "left" : targetX > current.x ? "right" : targetY < current.y ? "up" : "down";
        commit({ ...current, cells, target, direction, loot: cells[target].loot, stage: "hammer" }, STRIKE_IMPACT_MS);
      } else if (current.stage === "hammer") {
        commit({ ...current, stage: "break" });
      } else if (current.stage === "break") {
        const cells = current.cells.slice();
        if (current.target !== null) cells[current.target] = { ...cells[current.target], kind: "air" };
        commit({ ...current, cells, stage: current.loot ? "collect" : "move" }, current.loot ? COLLECTION_DURATION_MS : 700);
      } else if (current.stage === "collect") {
        if (current.target !== null) {
          const cells = current.cells.slice();
          cells[current.target] = { ...cells[current.target], loot: null };
          commit({ ...current, cells, stage: "move" });
        }
      } else {
        const target = current.target;
        commit({ ...current, x: target === null ? current.x : target % SIDE, y: target === null ? current.y : Math.floor(target / SIDE), target: null, loot: null, stage: "idle" }, 700);
      }
    };
    timer = window.setTimeout(tick, 700);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className={`dig-scene ${variant}`} aria-hidden="true">
      <div className="dig-scene-ambient" />
      <div className="dig-scene-frame">
        <div className="dig-scene-depth"><span>SHAFT 04</span><b>{String(84 + scene.y * 3).padStart(3, "0")} m</b></div>
        <div className="dig-scene-grid">
          {scene.cells.map((cell, i) => (
            <span key={i} style={{ gridColumn: i % SIDE + 1, gridRow: Math.floor(i / SIDE) + 1 }} className={`dig-scene-tile ${cell.kind} ${cell.loot ? "has-loot" : ""} ${scene.target === i ? "has-effect" : ""} ${scene.target === i && scene.stage === "hammer" ? "target-hammer" : ""} ${scene.target === i && scene.stage === "break" ? "target-break" : ""}`}>
              {scene.target === i && (scene.stage === "hammer" || scene.stage === "break") && <PickaxeStrike direction={scene.direction} />}
              {scene.target === i && scene.stage === "break" && <MiningBurst kind="firework" />}
              {scene.target === i && scene.stage === "collect" && <MiningBurst kind="confetti" glyph={scene.loot === "coin" ? "🪙" : "💎"} color={scene.loot === "coin" ? "#ffd45e" : "#78ffd0"} />}
            </span>
          ))}
          <div className={`dig-scene-miner ${scene.stage === "hammer" ? "swinging" : ""}`} style={{ gridColumn: scene.x + 1, gridRow: scene.y + 1 }}>
            <img src="/riggy.webp" alt="" />
          </div>
        </div>
        <div className="dig-scene-lamp" />
      </div>
    </div>
  );
}
