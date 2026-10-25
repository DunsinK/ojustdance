import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { GameService } from "./game-service.js";

const chart = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../shared/sample-chart.json", import.meta.url)),
    "utf8",
  ),
);

test("pairs queued players and advances a shared round", () => {
  const firstMessages = [];
  const secondMessages = [];
  const game = new GameService({
    chart,
    foundDurationMs: 1,
    previewDurationMs: 1,
    countdownDurationMs: 1,
    battleDurationMs: 1,
  });
  try {
    const firstId = game.addClient((message) => firstMessages.push(message));
    const secondId = game.addClient((message) => secondMessages.push(message));

    game.handle(firstId, { type: "find" });
    assert.equal(latest(firstMessages).phase, "searching");
    assert.equal(latest(secondMessages).phase, "home");

    const start = Date.now();
    game.handle(secondId, { type: "find" });
    assert.equal(latest(firstMessages).phase, "found");
    assert.equal(latest(secondMessages).phase, "found");
    assert.equal(latest(firstMessages).players.length, 2);
    assert.equal(latest(firstMessages).choreography.id, chart.id);

    game.advance(start + 2);
    assert.equal(latest(firstMessages).phase, "preview");
    game.handle(firstId, { type: "ready" });
    game.handle(secondId, { type: "ready" });
    game.advance(start + 4);
    assert.equal(latest(firstMessages).phase, "countdown");
    game.advance(start + 6);
    assert.equal(latest(firstMessages).phase, "battle");

    game.handle(firstId, {
      type: "score",
      score: { score: 1200, accuracy: 90, combo: 12 },
    });
    game.handle(secondId, {
      type: "score",
      score: { score: 1400, accuracy: 95, combo: 15 },
    });
    game.advance(start + 8);
    const result = latest(firstMessages);
    assert.equal(result.phase, "results");
    assert.equal(result.result.winnerId, secondId);
    assert.deepEqual(result.result.scores, {
      [firstId]: 1200,
      [secondId]: 1400,
    });
    assert.equal(result.result.accuracy, 92.5);
    assert.equal(result.result.bestCombo, 15);
  } finally {
    game.close();
  }
});

test("does not invent scores and notifies the other player on disconnect", () => {
  const firstMessages = [];
  const secondMessages = [];
  const game = new GameService({ chart });
  try {
    const firstId = game.addClient((message) => firstMessages.push(message));
    const secondId = game.addClient((message) => secondMessages.push(message));
    game.handle(firstId, { type: "find" });
    game.handle(secondId, { type: "find" });
    const room = [...game.rooms.values()][0];
    game.transition(room, "results", Date.now());

    const result = latest(firstMessages).result;
    assert.equal(result.winnerId, null);
    assert.deepEqual(result.scores, { [firstId]: null, [secondId]: null });
    assert.equal(result.accuracy, null);
    assert.equal(result.bestCombo, null);

    game.removeClient(secondId);
    assert.equal(latest(firstMessages).phase, "searching");
    assert.equal(latest(firstMessages).connection, "disconnected");
    assert.match(latest(firstMessages).error, /disconnected/i);
  } finally {
    game.close();
  }
});

test("cancel removes a queued player and returns the server state to home", () => {
  const messages = [];
  const game = new GameService({ chart });
  try {
    const playerId = game.addClient((message) => messages.push(message));
    game.handle(playerId, { type: "find" });
    assert.equal(latest(messages).phase, "searching");
    game.handle(playerId, { type: "cancel" });
    assert.equal(latest(messages).phase, "home");
    assert.equal(game.queue.length, 0);
  } finally {
    game.close();
  }
});

function latest(messages) {
  return messages.filter((message) => message.type === "snapshot").at(-1);
}
