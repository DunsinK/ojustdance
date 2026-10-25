import { randomUUID } from "node:crypto";

export class GameService {
  constructor({
    chart,
    foundDurationMs = 1500,
    previewDurationMs = 30000,
    countdownDurationMs = 3000,
    battleDurationMs = 30000,
  }) {
    this.chart = chart;
    this.durations = {
      found: foundDurationMs,
      preview: previewDurationMs,
      countdown: countdownDurationMs,
      battle: battleDurationMs,
    };
    this.clients = new Map();
    this.rooms = new Map();
    this.queue = [];
    this.nextPlayerNumber = 1;
    this.currentTime = Date.now();
  }

  addClient(send) {
    const client = {
      id: randomUUID(),
      name: `Player ${this.nextPlayerNumber++}`,
      send,
      queued: false,
      roomId: null,
    };
    this.clients.set(client.id, client);
    this.send(client, {
      type: "hello",
      player: { id: client.id, name: client.name },
    });
    this.sendSnapshot(client);
    return client.id;
  }

  removeClient(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;
    this.removeFromQueue(client);
    if (client.roomId) this.removeRoom(client, "Your opponent disconnected.");
    this.clients.delete(clientId);
  }

  handle(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case "find":
        this.find(client);
        break;
      case "cancel":
      case "leave":
        this.leave(client);
        break;
      case "ready":
        this.setReady(client);
        break;
      case "score":
        this.submitScore(client, message.score);
        break;
      default:
        this.sendError(client, "Unsupported game action.");
    }
  }

  find(client) {
    if (client.roomId) this.removeRoom(client, "Your opponent left the room.");
    this.removeFromQueue(client);
    client.queued = true;
    this.queue.push(client.id);
    this.sendSnapshot(client);

    while (this.queue.length >= 2) {
      const first = this.clients.get(this.queue.shift());
      const second = this.clients.get(this.queue.shift());
      if (!first || !second || first.id === second.id) continue;
      this.createRoom(first, second);
    }
  }

  leave(client) {
    this.removeFromQueue(client);
    if (client.roomId) this.removeRoom(client, "Your opponent left the room.");
    this.sendSnapshot(client);
  }

  setReady(client) {
    const room = this.roomFor(client);
    if (!room || room.phase !== "preview") {
      this.sendError(client, "Ready is only available during the preview.");
      return;
    }
    room.ready.add(client.id);
    this.broadcast(room);
  }

  submitScore(client, update) {
    const room = this.roomFor(client);
    if (!room || room.phase !== "battle") {
      this.sendError(client, "Scores can only be submitted during a battle.");
      return;
    }
    if (
      !update ||
      !Number.isFinite(update.score) ||
      update.score < 0 ||
      update.score > 1_000_000_000 ||
      !Number.isFinite(update.accuracy) ||
      update.accuracy < 0 ||
      update.accuracy > 100 ||
      !Number.isFinite(update.combo) ||
      update.combo < 0 ||
      update.combo > 1_000_000
    ) {
      this.sendError(client, "Score update contains invalid values.");
      return;
    }
    room.scores.set(client.id, {
      score: Math.floor(update.score),
      accuracy: update.accuracy,
      combo: Math.floor(update.combo),
    });
    this.broadcast(room);
  }

  advance(now = Date.now()) {
    this.currentTime = now;
    for (const room of this.rooms.values()) {
      const elapsed = now - room.phaseStartedAt;
      if (room.phase === "found" && elapsed >= this.durations.found) {
        this.transition(room, "preview", now);
      } else if (
        room.phase === "preview" &&
        elapsed >= this.durations.preview &&
        room.ready.size === room.clients.length
      ) {
        this.transition(room, "countdown", now);
      } else if (
        room.phase === "countdown" &&
        elapsed >= this.durations.countdown
      ) {
        this.transition(room, "battle", now);
      } else if (
        room.phase === "battle" &&
        elapsed >= this.durations.battle
      ) {
        this.transition(room, "results", now);
      } else {
        this.broadcast(room);
      }
    }
  }

  createRoom(first, second) {
    first.queued = false;
    second.queued = false;
    const room = {
      id: randomUUID(),
      clients: [first, second],
      phase: "found",
      phaseStartedAt: Date.now(),
      ready: new Set(),
      scores: new Map(),
    };
    first.roomId = room.id;
    second.roomId = room.id;
    this.rooms.set(room.id, room);
    this.broadcast(room);
  }

  transition(room, phase, now) {
    room.phase = phase;
    room.phaseStartedAt = now;
    if (phase === "results") room.result = this.createResult(room);
    this.broadcast(room);
  }

  createResult(room) {
    const first = room.scores.get(room.clients[0].id);
    const second = room.scores.get(room.clients[1].id);
    const bothScored = Boolean(first && second);
    return {
      winnerId: bothScored
        ? first.score === second.score
          ? null
          : first.score > second.score
            ? room.clients[0].id
            : room.clients[1].id
        : null,
      scores: Object.fromEntries(
        room.clients.map((client) => [
          client.id,
          room.scores.get(client.id)?.score ?? null,
        ]),
      ),
      accuracy:
        bothScored ? (first.accuracy + second.accuracy) / 2 : null,
      bestCombo: bothScored ? Math.max(first.combo, second.combo) : null,
      perfectMoves: null,
    };
  }

  removeRoom(client, opponentMessage) {
    const room = this.rooms.get(client.roomId);
    if (!room) {
      client.roomId = null;
      return;
    }
    this.rooms.delete(room.id);
    client.roomId = null;
    for (const opponent of room.clients) {
      if (opponent.id === client.id) continue;
      opponent.roomId = null;
      opponent.queued = false;
      this.sendSnapshot(opponent, {
        phase: "searching",
        connection: "disconnected",
        error: opponentMessage,
        players: [opponent],
      });
    }
  }

  removeFromQueue(client) {
    if (!client.queued) return;
    client.queued = false;
    this.queue = this.queue.filter((id) => id !== client.id);
  }

  roomFor(client) {
    return client.roomId ? this.rooms.get(client.roomId) : null;
  }

  snapshot(client, overrides = {}) {
    const room = this.roomFor(client);
    if (!room) {
      return {
        type: "snapshot",
        youId: client.id,
        phase: client.queued ? "searching" : "home",
        connection: "connected",
        players: [this.playerState(client)],
        choreography: null,
        remainingMs: 0,
        elapsedMs: 0,
        result: null,
        ...overrides,
      };
    }

    const duration = room.phase === "results" ? 0 : this.durations[room.phase];
    const elapsedMs = Math.min(
      duration,
      Math.max(0, this.currentTime - room.phaseStartedAt),
    );
    return {
      type: "snapshot",
      youId: client.id,
      phase: room.phase,
      connection: "connected",
      players: room.clients.map((player) =>
        this.playerState(player, room.scores.get(player.id), room.ready.has(player.id)),
      ),
      choreography: this.chart,
      remainingMs: Math.max(0, duration - elapsedMs),
      elapsedMs,
      result: room.result ?? null,
      ...overrides,
    };
  }

  playerState(client, score, ready = false) {
    return {
      id: client.id,
      name: client.name,
      color: "cobalt",
      score: score?.score ?? null,
      ready,
    };
  }

  broadcast(room) {
    for (const client of room.clients) this.sendSnapshot(client);
  }

  sendSnapshot(client, overrides) {
    this.send(client, this.snapshot(client, overrides));
  }

  sendError(client, message) {
    this.send(client, { type: "error", message });
  }

  send(client, message) {
    try {
      client.send(message);
    } catch (error) {
      console.error("Failed to send game message:", error);
    }
  }

  close() {
    this.rooms.clear();
    this.clients.clear();
    this.queue = [];
  }
}
