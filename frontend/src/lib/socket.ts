import { io, type Socket } from "socket.io-client";
import { getApiUrl } from "./api";

export type MatchChartPayload = {
  id: string;
  title: string;
  difficulty: string;
  durationSec: number | null;
  videoUrl: string | null;
  chartJson: unknown;
};

export type MatchFoundPayload = {
  matchId: string;
  role: "a" | "b";
  you: { id: string; name: string };
  rival: { id: string; name: string };
  chart: MatchChartPayload;
};

export type MatchResultPayload = {
  matchId: string;
  outcome: "win" | "lose" | "draw";
  you: { id: string; name: string; score: number };
  rival: { id: string; name: string; score: number };
};

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(getApiUrl(), {
      autoConnect: false,
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  socket?.disconnect();
}
