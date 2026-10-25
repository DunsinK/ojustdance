import { randomUUID } from "crypto";
import { getChartById, listCharts } from "../chartsStore.js";

/** @typedef {{ id: string, name: string, socketId: string }} QueuedPlayer */
/** @typedef {{
 *   id: string,
 *   players: { a: QueuedPlayer, b: QueuedPlayer },
 *   scores: Record<string, number>,
 *   finished: Set<string>,
 *   chart: object,
 *   started: boolean,
 * }} Match */

/** @type {QueuedPlayer[]} */
const queue = [];

/** @type {Map<string, Match>} */
const matches = new Map();

/** socketId -> matchId */
const socketMatch = new Map();

function leaveQueue(socketId) {
  const idx = queue.findIndex((p) => p.socketId === socketId);
  if (idx >= 0) queue.splice(idx, 1);
}

async function pickChart() {
  const charts = await listCharts();
  if (!charts.length) {
    throw new Error("No charts in the library — publish one from Map first");
  }
  const row = charts[Math.floor(Math.random() * charts.length)];
  const full = await getChartById(row.id);
  if (!full?.chart_json) {
    throw new Error("Selected chart has no pose data");
  }
  return {
    id: full.id,
    title: full.title,
    difficulty: full.difficulty,
    durationSec: full.duration_sec,
    videoUrl: full.video_url,
    chartJson: full.chart_json,
  };
}

/**
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export function registerMatchmaking(io, socket) {
  socket.on("queue:join", async (payload = {}) => {
    try {
      leaveQueue(socket.id);
      if (socketMatch.has(socket.id)) {
        socket.emit("error:message", { message: "Already in a match" });
        return;
      }

      const player = {
        id: randomUUID(),
        name: String(payload.name || "Dancer").slice(0, 32),
        socketId: socket.id,
      };

      const waiting = queue[0];
      if (!waiting) {
        queue.push(player);
        socket.emit("queue:waiting", { position: 1 });
        return;
      }

      queue.shift();
      const chart = await pickChart();
      const matchId = randomUUID();
      const match = {
        id: matchId,
        players: { a: waiting, b: player },
        scores: { [waiting.id]: 0, [player.id]: 0 },
        finished: new Set(),
        chart,
        started: false,
      };
      matches.set(matchId, match);
      socketMatch.set(waiting.socketId, matchId);
      socketMatch.set(player.socketId, matchId);

      const payloadFor = (you, rival, role) => ({
        matchId,
        role,
        you: { id: you.id, name: you.name },
        rival: { id: rival.id, name: rival.name },
        chart,
      });

      io.to(waiting.socketId).emit(
        "match:found",
        payloadFor(waiting, player, "a")
      );
      socket.emit("match:found", payloadFor(player, waiting, "b"));

      setTimeout(() => {
        const m = matches.get(matchId);
        if (!m || m.started) return;
        m.started = true;
        const startPayload = { matchId, serverTime: Date.now() };
        io.to(waiting.socketId).emit("match:start", startPayload);
        io.to(player.socketId).emit("match:start", startPayload);
      }, 1500);
    } catch (err) {
      console.error(err);
      socket.emit("error:message", {
        message: err.message || "Failed to join queue",
      });
      leaveQueue(socket.id);
    }
  });

  socket.on("queue:leave", () => {
    leaveQueue(socket.id);
    socket.emit("queue:left");
  });

  socket.on("match:ready", ({ matchId } = {}) => {
    const match = matches.get(matchId);
    if (!match || match.started) return;
    socket.emit("match:readyAck", { matchId });
  });

  socket.on("match:score", ({ matchId, score } = {}) => {
    const match = matches.get(matchId);
    if (!match) return;
    const playerId = playerIdForSocket(match, socket.id);
    if (!playerId) return;
    const n = Math.max(0, Math.round(Number(score) || 0));
    match.scores[playerId] = n;
    const rivalSocket = rivalSocketId(match, socket.id);
    if (rivalSocket) {
      io.to(rivalSocket).emit("match:rivalScore", { score: n });
    }
  });

  socket.on("match:finished", ({ matchId, score } = {}) => {
    const match = matches.get(matchId);
    if (!match) return;
    const playerId = playerIdForSocket(match, socket.id);
    if (!playerId) return;
    match.scores[playerId] = Math.max(0, Math.round(Number(score) || 0));
    match.finished.add(playerId);

    const rivalSocket = rivalSocketId(match, socket.id);
    if (rivalSocket) {
      io.to(rivalSocket).emit("match:rivalFinished", {
        score: match.scores[playerId],
      });
    }

    if (match.finished.size >= 2) {
      settleMatch(io, match);
      return;
    }

    const rival = rivalPlayer(match, socket.id);
    if (!rival || !socketMatch.has(rival.socketId)) {
      settleMatch(io, match);
    }
  });

  socket.on("disconnect", () => {
    leaveQueue(socket.id);
    const matchId = socketMatch.get(socket.id);
    if (!matchId) return;
    const match = matches.get(matchId);
    socketMatch.delete(socket.id);
    if (!match) return;

    const rivalSocket = rivalSocketId(match, socket.id);
    if (rivalSocket) {
      io.to(rivalSocket).emit("match:rivalLeft", { matchId });
    }

    if (match.finished.size >= 1) {
      settleMatch(io, match);
    } else {
      for (const p of [match.players.a, match.players.b]) {
        socketMatch.delete(p.socketId);
      }
      matches.delete(matchId);
    }
  });
}

function playerIdForSocket(match, socketId) {
  if (match.players.a.socketId === socketId) return match.players.a.id;
  if (match.players.b.socketId === socketId) return match.players.b.id;
  return null;
}

function rivalPlayer(match, socketId) {
  if (match.players.a.socketId === socketId) return match.players.b;
  if (match.players.b.socketId === socketId) return match.players.a;
  return null;
}

function rivalSocketId(match, socketId) {
  return rivalPlayer(match, socketId)?.socketId ?? null;
}

function settleMatch(io, match) {
  const a = match.players.a;
  const b = match.players.b;
  const scoreA = match.scores[a.id] ?? 0;
  const scoreB = match.scores[b.id] ?? 0;

  const resultFor = (you, rival, youScore, rivalScore) => {
    let outcome = "draw";
    if (youScore > rivalScore) outcome = "win";
    else if (youScore < rivalScore) outcome = "lose";
    return {
      matchId: match.id,
      outcome,
      you: { id: you.id, name: you.name, score: youScore },
      rival: { id: rival.id, name: rival.name, score: rivalScore },
    };
  };

  io.to(a.socketId).emit("match:result", resultFor(a, b, scoreA, scoreB));
  io.to(b.socketId).emit("match:result", resultFor(b, a, scoreB, scoreA));

  socketMatch.delete(a.socketId);
  socketMatch.delete(b.socketId);
  matches.delete(match.id);
}
