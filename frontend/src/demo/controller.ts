import type {
  Connection,
  GameAction,
  GameAdapter,
  GameSnapshot,
  Phase,
} from "../types";
export const demoDance = {
  id: "demo-neon",
  title: "After Hours",
  artist: "Shared Beat · demo routine",
  bpm: 120,
  difficulty: "Medium" as const,
  durationMs: 30000,
  previewDurationMs: 30000,
  moves: [
    "Side step",
    "Reach up",
    "Cross & pop",
    "Slide right",
    "Double bounce",
    "Freestyle",
  ].map((name, i) => ({
    id: `move-${i}`,
    name,
    startMs: i * 5000,
    durationMs: 5000,
  })),
};
const initial = (): GameSnapshot => ({
  phase: "home",
  connection: "connected",
  players: [
    { id: "you", name: "You", color: "cobalt", score: 0, ready: false },
    {
      id: "opponent",
      name: "Stranger",
      color: "coral",
      score: 0,
      ready: false,
    },
  ],
  choreography: demoDance,
  remainingMs: 0,
  elapsedMs: 0,
  result: null,
  error: undefined,
  demo: true,
});
/** Entirely local simulation. No network, camera, audio, or pose requests. */
export class DemoController implements GameAdapter {
  private state = initial();
  private listeners = new Set<(state: GameSnapshot) => void>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private startedAt = 0;
  private duration = 0;
  getSnapshot = () => this.state;
  subscribe = (listener: (state: GameSnapshot) => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(patch: Partial<GameSnapshot>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn(this.state));
  }
  private enter(phase: Phase, duration = 0) {
    clearInterval(this.timer);
    this.duration = duration;
    this.startedAt = performance.now();
    this.emit({ phase, elapsedMs: 0, remainingMs: duration });
    if (duration) this.timer = setInterval(() => this.tick(), 100);
  }
  private tick() {
    const elapsedMs = Math.min(
      this.duration,
      performance.now() - this.startedAt,
    );
    const patch: Partial<GameSnapshot> = {
      elapsedMs,
      remainingMs: Math.max(0, this.duration - elapsedMs),
    };
    if (this.state.phase === "battle")
      patch.players = [
        {
          ...this.state.players[0],
          score: Math.floor((elapsedMs / this.duration) * 9240),
        },
        {
          ...this.state.players[1],
          score: Math.floor((elapsedMs / this.duration) * 8610),
        },
      ];
    this.emit(patch);
    if (elapsedMs < this.duration) return;
    switch (this.state.phase) {
      case "searching":
        this.enter("found", 2200);
        break;
      case "found":
        this.emit({
          players: [
            { ...this.state.players[0], ready: false },
            { ...this.state.players[1], ready: true },
          ],
        });
        this.enter("preview", 30000);
        break;
      case "preview":
        clearInterval(this.timer);
        if (this.state.players[0].ready) this.enter("countdown", 3000);
        break;
      case "countdown":
        this.enter("battle", 30000);
        break;
      case "battle":
        this.emit({
          result: {
            winnerId: "you",
            scores: { you: 9240, opponent: 8610 },
            accuracy: 94,
            bestCombo: 18,
            perfectMoves: 24,
          },
        });
        this.enter("results");
        break;
    }
  }
  dispatch = (action: GameAction) => {
    if (action === "ready" && this.state.phase === "preview") {
      this.emit({
        players: [
          { ...this.state.players[0], ready: true },
          this.state.players[1],
        ],
      });
      if (this.state.remainingMs === 0) this.enter("countdown", 3000);
      return;
    }
    if (["find", "next", "retry", "rematch"].includes(action)) {
      this.emit(initial());
      this.enter(
        action === "rematch" ? "found" : "searching",
        action === "rematch" ? 1800 : 4200,
      );
    }
    if (action === "cancel" || action === "leave") {
      this.emit(initial());
      this.enter("home");
    }
  };
  setConnection = (connection: Connection) => {
    clearInterval(this.timer);
    this.emit({
      connection,
      error:
        connection === "error"
          ? "The demo room could not be loaded. Try a new match."
          : undefined,
    });
  };
  skip = () => {
    if (
      ["searching", "found", "preview", "countdown", "battle"].includes(
        this.state.phase,
      )
    ) {
      this.startedAt -= this.duration;
      this.tick();
    }
  };
  dispose = () => clearInterval(this.timer);
}
