import type { ComponentType } from "react";
export type Phase =
  | "home"
  | "searching"
  | "found"
  | "preview"
  | "countdown"
  | "battle"
  | "results";
export type Connection = "connected" | "connecting" | "disconnected" | "error";
export interface Player {
  id: string;
  name: string;
  color: "cobalt" | "coral";
  score: number;
  ready: boolean;
}
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}
export interface PoseFrame {
  timestampMs: number;
  landmarks: readonly Landmark[];
}
export interface ScoreUpdate {
  playerId: string;
  score: number;
  accuracy: number;
  combo: number;
  timestampMs: number;
}
export interface DanceMove {
  id: string;
  name: string;
  startMs: number;
  durationMs: number;
  pose?: readonly Landmark[];
}
export interface Choreography {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  difficulty: "Easy" | "Medium" | "Hard";
  durationMs: number;
  previewDurationMs: number;
  moves: readonly DanceMove[];
  audioUrl?: string;
  animationUrl?: string;
}
export interface BattleResult {
  winnerId: string | null;
  scores: Record<string, number>;
  accuracy: number;
  bestCombo: number;
  perfectMoves: number;
}
export interface GameSnapshot {
  phase: Phase;
  connection: Connection;
  players: readonly [Player, Player];
  choreography: Choreography | null;
  remainingMs: number;
  elapsedMs: number;
  result: BattleResult | null;
  error?: string;
  demo: boolean;
}
export type GameAction =
  "find" | "cancel" | "ready" | "rematch" | "next" | "leave" | "retry";
/** Adapter owns authoritative clock, room events, and continuation policy. Unsubscribe on cleanup. */
export interface GameAdapter {
  subscribe: (listener: (state: GameSnapshot) => void) => () => void;
  getSnapshot: () => GameSnapshot;
  dispatch: (action: GameAction) => void;
  submitScore?: (score: ScoreUpdate) => void;
}
export interface VideoPanelProps {
  player: Player;
  stream?: MediaStream;
  local: boolean;
  demo: boolean;
  children?: React.ReactNode;
}
export interface ChoreographyStageProps {
  choreography: Choreography | null;
  elapsedMs: number;
  playing: boolean;
  loading?: boolean;
}
export interface GameRenderers {
  Video: ComponentType<VideoPanelProps>;
  Choreography: ComponentType<ChoreographyStageProps>;
}
