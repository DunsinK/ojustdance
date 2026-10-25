import type {
  Connection,
  GameAction,
  GameAdapter,
  GameSnapshot,
  Phase,
  Player,
  ScoreUpdate,
} from "../types";

interface ServerSnapshot {
  type: "snapshot";
  youId: string;
  phase: Phase;
  connection: Connection;
  players: Player[];
  choreography: GameSnapshot["choreography"];
  remainingMs: number;
  elapsedMs: number;
  result: GameSnapshot["result"];
  error?: string;
}

type ServerMessage =
  | ServerSnapshot
  | {
      type: "hello" | "error";
      player?: { id: string; name: string };
      message?: string;
    };

const playerDefaults = (
  id: string,
  name: string,
  color: Player["color"],
): Player => ({ id, name, color, score: null, ready: false });

function socketUrl() {
  const configured = import.meta.env.VITE_BACKEND_URL;
  const url = new URL(configured || window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  return url.toString();
}

export class LiveGameAdapter implements GameAdapter {
  private state: GameSnapshot = {
    phase: "home",
    connection: "connecting",
    players: [playerDefaults("local", "You", "cobalt"), null],
    choreography: null,
    remainingMs: 0,
    elapsedMs: 0,
    result: null,
  };
  private listeners = new Set<(state: GameSnapshot) => void>();
  private socket: WebSocket | undefined;
  private pendingFind = false;
  private disposed = false;
  private playerId = "local";
  private playerName = "You";
  private readonly url: string;
  private readonly createSocket: (url: string) => WebSocket;

  constructor(
    url = socketUrl(),
    createSocket: (url: string) => WebSocket = (address) =>
      new WebSocket(address),
  ) {
    this.url = url;
    this.createSocket = createSocket;
    this.open(this.url);
  }

  getSnapshot = () => this.state;

  subscribe = (listener: (state: GameSnapshot) => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispatch = (action: GameAction) => {
    if (action === "find" || action === "next" || action === "retry") {
      this.pendingFind = true;
      this.emit({
        phase: "searching",
        connection:
          this.socket?.readyState === WebSocket.OPEN
            ? "connected"
            : "connecting",
        players: [playerDefaults(this.playerId, "You", "cobalt"), null],
        choreography: null,
        remainingMs: 0,
        elapsedMs: 0,
        result: null,
        error: undefined,
      });
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.send({ type: "find" });
      } else if (
        action === "retry" ||
        !this.socket ||
        this.socket.readyState === WebSocket.CLOSED ||
        this.socket.readyState === WebSocket.CLOSING
      ) {
        this.reconnect();
      }
      return;
    }
    if (action === "ready") this.send({ type: "ready" });
    if (action === "cancel" || action === "leave") {
      this.pendingFind = false;
      this.send({ type: action });
      this.emit({
        phase: "home",
        players: [playerDefaults(this.playerId, "You", "cobalt"), null],
        choreography: null,
        remainingMs: 0,
        elapsedMs: 0,
        result: null,
        error: undefined,
      });
    }
  };

  submitScore = (score: ScoreUpdate) => {
    this.send({ type: "score", score });
  };

  dispose = () => {
    this.disposed = true;
    this.socket?.close(1000, "App disposed");
    this.socket = undefined;
    this.listeners.clear();
  };

  private open(url: string) {
    this.emit({ connection: "connecting", error: undefined });
    const socket = this.createSocket(url);
    this.socket = socket;
    socket.onopen = () => {
      if (socket !== this.socket) return;
      this.emit({ connection: "connected", error: undefined });
      if (this.pendingFind) {
        this.send({ type: "find" });
      }
    };
    socket.onmessage = (event) => {
      if (socket !== this.socket) return;
      this.receive(event.data);
    };
    socket.onerror = () => {
      if (socket === this.socket)
        this.emit({
          connection: "error",
          error: "Could not communicate with the game server.",
        });
    };
    socket.onclose = () => {
      if (socket === this.socket && !this.disposed)
        this.emit({
          connection: "disconnected",
          error: "The game server connection closed.",
        });
    };
  }

  private reconnect() {
    const previous = this.socket;
    this.socket = undefined;
    previous?.close();
    this.open(this.url);
  }

  private send(message: object) {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(message));
  }

  private receive(data: unknown) {
    let message: ServerMessage;
    try {
      message = JSON.parse(String(data)) as ServerMessage;
    } catch {
      this.emit({
        connection: "error",
        error: "The game server sent an unreadable response.",
      });
      return;
    }

    if (message.type === "hello" && message.player) {
      this.playerId = message.player.id;
      this.playerName = message.player.name;
      return;
    }
    if (message.type === "error") {
      this.emit({
        connection: "error",
        error: message.message ?? "The game server rejected that action.",
      });
      return;
    }
    if (message.type === "snapshot") {
      // The server sends an initial home snapshot before processing queued actions.
      if (this.pendingFind && message.phase === "home") return;
      this.pendingFind = false;
      this.applySnapshot(message);
    }
  }

  private applySnapshot(snapshot: ServerSnapshot) {
    const local =
      snapshot.players.find((player) => player.id === snapshot.youId) ??
      playerDefaults(this.playerId, this.playerName, "cobalt");
    const rival =
      snapshot.players.find((player) => player.id !== snapshot.youId) ?? null;
    this.emit({
      phase: snapshot.phase,
      connection: snapshot.connection,
      players: [
        { ...local, name: "You", color: "cobalt" },
        rival ? { ...rival, color: "coral" } : null,
      ],
      choreography: snapshot.choreography,
      remainingMs: snapshot.remainingMs,
      elapsedMs: snapshot.elapsedMs,
      result: snapshot.result,
      error: snapshot.error,
    });
  }

  private emit(patch: Partial<GameSnapshot>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener(this.state));
  }
}
