import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMove,
  createGame,
  MOVE_ROPE,
  MOVE_SCAN,
  outcomeOf,
  replayMoves,
  tileAt,
  tileForState,
  WIDTH,
} from "./sim.ts";

const options = { pick: 1, bag: 1, lamp: 1, detector: 1, energy: 12, maxBiome: 1 };

test("seeded mine cells are repeatable and contain collectible ores", () => {
  let oreCells = 0;
  for (let y = 1; y < 200; y++) {
    for (let x = 0; x < 16; x++) {
      const first = tileAt(938_559_024, x, y);
      assert.deepEqual(tileAt(938_559_024, x, y), first);
      if (first.gemIndex >= 0) oreCells++;
    }
  }
  assert.ok(oreCells > 20);
});

test("detector spends two energy and rope-up banks the shift", () => {
  const game = createGame(123, options);
  assert.equal(applyMove(game, MOVE_SCAN), "moved");
  assert.equal(game.energy, 10);
  assert.equal(applyMove(game, MOVE_ROPE), "banked");
  assert.equal(game.ended, true);
  assert.equal(game.banked, true);
  assert.equal(outcomeOf(game).moves, 2);
});

test("stone breaks for two energy without moving, then dirt costs one energy to enter", () => {
  let seed = 0;
  while (tileAt(seed, 8, 1).kind !== "stone") seed++;
  const game = createGame(seed, options);
  assert.equal(applyMove(game, 2), "moved");
  assert.equal(game.energy, options.energy - 2);
  assert.equal(game.y, 0);
  assert.equal(game.maxDepth, 0);
  assert.equal(game.dug.has(WIDTH + 8), false);
  assert.equal(game.brokenStones.has(WIDTH + 8), true);
  assert.equal(tileForState(game, 8, 1).kind, "dirt");
  assert.equal(applyMove(game, 2), "moved");
  assert.equal(game.energy, options.energy - 3);
  assert.equal(game.y, 1);
  assert.equal(tileForState(game, 8, 1).kind, "air");
  assert.equal(game.dug.has(WIDTH + 8), true);
  assert.equal(applyMove(game, 0), "moved");
  assert.equal(applyMove(game, 2), "moved");
  assert.equal(game.energy, options.energy - 5);
  assert.equal(applyMove(game, MOVE_ROPE), "banked");
  const replay = replayMoves(seed, options, game.moves);
  assert.equal(replay.invalidMove, null);
  assert.deepEqual(replay.state.brokenStones, game.brokenStones);
  assert.deepEqual(outcomeOf(replay.state), outcomeOf(game));
});

test("stone rejects insufficient energy and exhaustion leaves dirt without advancing", () => {
  let seed = 0;
  while (tileAt(seed, 8, 1).kind !== "stone") seed++;
  const low = createGame(seed, { ...options, energy: 1 });
  assert.equal(applyMove(low, 2), "invalid");
  assert.equal(low.brokenStones.size, 0);
  assert.equal(low.energy, 1);
  const exhausted = createGame(seed, { ...options, energy: 2 });
  assert.equal(applyMove(exhausted, 2), "ended");
  assert.equal(exhausted.y, 0);
  assert.equal(exhausted.maxDepth, 0);
  assert.equal(exhausted.energy, 0);
  assert.equal(tileForState(exhausted, 8, 1).kind, "dirt");
  assert.equal(exhausted.dug.size, 0);
});

test("boulders also leave dirt and exposed dirt no longer requires a stronger pick", () => {
  let seed = 0;
  while (tileAt(seed, 8, 101).kind !== "boulder") seed++;
  const game = createGame(seed, { ...options, pick: 2 });
  game.y = 100;
  assert.equal(applyMove(game, 2), "moved");
  assert.equal(game.y, 100);
  assert.equal(tileForState(game, 8, 101).kind, "dirt");
  game.pick = 1;
  assert.equal(applyMove(game, 2), "moved");
  assert.equal(game.y, 101);
  assert.equal(game.energy, options.energy - 3);
});

test("seeded coins can be mined into the haul bag", () => {
  let seed = 0;
  while (tileAt(seed, 8, 1).kind !== "coin") seed++;
  const game = createGame(seed, options);
  assert.equal(applyMove(game, 2), "moved");
  assert.equal(game.bagValue, 2);
  assert.equal(game.energy, options.energy - 1);
});

test("the replay rejects illegal actions and any moves after banking", () => {
  const tooLittleEnergy = replayMoves(123, { ...options, energy: 1 }, [MOVE_SCAN]);
  assert.equal(tooLittleEnergy.invalidMove, 0);
  const trailing = replayMoves(123, options, [MOVE_ROPE, 2]);
  assert.equal(trailing.invalidMove, 1);
});

test("repeating the same move log yields the same result", () => {
  const moves = [2, 2, 1, 2, MOVE_SCAN, 3, 2, MOVE_ROPE];
  const first = replayMoves(3_049_657_054, options, moves);
  const second = replayMoves(3_049_657_054, options, moves);
  assert.equal(first.invalidMove, null);
  assert.equal(second.invalidMove, null);
  assert.deepEqual(outcomeOf(first.state), outcomeOf(second.state));
});
