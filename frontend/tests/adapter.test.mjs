import assert from "node:assert/strict";
import test from "node:test";
import { LiveGameAdapter } from "../src/services/live-game-adapter.ts";

class FakeSocket {
  readyState = 0;
  onopen;
  onmessage;
  onerror;
  onclose;
  sent = [];
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  send(message) {
    this.sent.push(JSON.parse(message));
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(message) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

test("queues through WebSocket and maps the backend state to the local UI", () => {
  let socket;
  const adapter = new LiveGameAdapter("ws://localhost/ws", () => {
    socket = new FakeSocket();
    return socket;
  });
  try {
    adapter.dispatch("find");
    socket.open();
    assert.deepEqual(socket.sent, [{ type: "find" }]);

    socket.receive({
      type: "hello",
      player: { id: "player-a", name: "Player 1" },
    });
    socket.receive({
      type: "snapshot",
      youId: "player-a",
      phase: "preview",
      connection: "connected",
      players: [
        {
          id: "player-a",
          name: "Player 1",
          color: "cobalt",
          score: null,
          ready: false,
        },
        {
          id: "player-b",
          name: "Player 2",
          color: "coral",
          score: null,
          ready: true,
        },
      ],
      choreography: { id: "shared-chart", sample: true },
      remainingMs: 30_000,
      elapsedMs: 0,
      result: null,
    });

    const snapshot = adapter.getSnapshot();
    assert.equal(snapshot.phase, "preview");
    assert.equal(snapshot.players[0].name, "You");
    assert.equal(snapshot.players[1].name, "Player 2");
    assert.equal(snapshot.players[1].ready, true);
    assert.equal(snapshot.choreography.id, "shared-chart");
    assert.strictEqual(adapter.getSnapshot(), snapshot);

    adapter.dispatch("ready");
    adapter.submitScore({
      playerId: "player-a",
      score: 50,
      accuracy: 80,
      combo: 3,
      timestampMs: 100,
    });
    assert.deepEqual(socket.sent.slice(1), [
      { type: "ready" },
      {
        type: "score",
        score: {
          playerId: "player-a",
          score: 50,
          accuracy: 80,
          combo: 3,
          timestampMs: 100,
        },
      },
    ]);
  } finally {
    adapter.dispose();
  }
});

test("surfaces malformed server messages as connection errors", () => {
  let socket;
  const adapter = new LiveGameAdapter("ws://localhost/ws", () => {
    socket = new FakeSocket();
    return socket;
  });
  socket.open();
  socket.onmessage({ data: "not-json" });
  assert.equal(adapter.getSnapshot().connection, "error");
  assert.match(adapter.getSnapshot().error, /unreadable response/i);
  adapter.dispose();
});

// Exercise the real producer and consumer together so their wire formats cannot drift.
test("actual backend snapshots drive matchmaking through results and requeue", async () => {
  const { GameService } = await import("../../backend/game-service.js");
  const { readFileSync } = await import("node:fs");
  const chart = JSON.parse(readFileSync(new URL("../../shared/sample-chart.json", import.meta.url), "utf8"));
  const game = new GameService({ chart, foundDurationMs: 1, previewDurationMs: 1, countdownDurationMs: 1, battleDurationMs: 1 });
  const connect = () => {
    const socket = new FakeSocket();
    const adapter = new LiveGameAdapter("ws://localhost/ws", () => socket);
    const id = game.addClient(message => socket.receive(message));
    socket.send = raw => game.handle(id, JSON.parse(raw));
    socket.open();
    return adapter;
  };
  const first = connect();
  const second = connect();
  try {
    first.dispatch("find");
    assert.equal(first.getSnapshot().phase, "searching");
    second.dispatch("find");
    assert.equal(first.getSnapshot().phase, "found");
    assert.equal(second.getSnapshot().phase, "found");
    const start = Date.now();
    game.advance(start + 2);
    assert.equal(first.getSnapshot().phase, "preview");
    assert.equal(first.getSnapshot().choreography.id, chart.id);
    first.dispatch("ready");
    second.dispatch("ready");
    game.advance(start + 4);
    assert.equal(first.getSnapshot().phase, "countdown");
    game.advance(start + 6);
    assert.equal(first.getSnapshot().phase, "battle");
    game.advance(start + 8);
    assert.equal(first.getSnapshot().phase, "results");
    first.dispatch("next");
    assert.equal(first.getSnapshot().phase, "searching");
    assert.equal(second.getSnapshot().connection, "disconnected");
    second.dispatch("retry");
    assert.equal(first.getSnapshot().phase, "found");
    first.dispatch("leave");
    assert.equal(first.getSnapshot().phase, "home");
  } finally {
    first.dispose();
    second.dispose();
    game.close();
  }
});

test("Play opens matchmaking while connecting; cancel clears the queued find", () => {
  const socket = new FakeSocket();
  const adapter = new LiveGameAdapter("ws://localhost/ws", () => socket);
  try {
    adapter.dispatch("find");
    assert.equal(adapter.getSnapshot().phase, "searching");
    assert.equal(adapter.getSnapshot().connection, "connecting");
    adapter.dispatch("cancel");
    assert.equal(adapter.getSnapshot().phase, "home");
    socket.open();
    assert.deepEqual(socket.sent, []);
  } finally { adapter.dispose(); }
});

test("an initial home snapshot cannot hide a pending search", () => {
  const socket = new FakeSocket();
  const adapter = new LiveGameAdapter("ws://localhost/ws", () => socket);
  try {
    adapter.dispatch("find");
    socket.open();
    socket.receive({ type: "snapshot", phase: "home" });
    assert.equal(adapter.getSnapshot().phase, "searching");
    assert.deepEqual(socket.sent, [{ type: "find" }]);
  } finally { adapter.dispose(); }
});

test("offline leave works and retry replaces a closing connection", () => {
  const sockets = [];
  const adapter = new LiveGameAdapter("ws://localhost/ws", () => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  });
  try {
    adapter.dispatch("find");
    sockets[0].close();
    assert.equal(adapter.getSnapshot().connection, "disconnected");
    adapter.dispatch("leave");
    assert.equal(adapter.getSnapshot().phase, "home");
    sockets[0].readyState = 2;
    adapter.dispatch("find");
    assert.equal(sockets.length, 2);
    sockets[1].open();
    assert.deepEqual(sockets[1].sent, [{ type: "find" }]);
  } finally { adapter.dispose(); }
});
