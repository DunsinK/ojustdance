import { Server } from "socket.io";
import { config } from "../config.js";
import { registerMatchmaking } from "./matchmaking.js";

/**
 * Attach Socket.io to an existing HTTP server.
 * @param {import('http').Server} httpServer
 */
export function attachRealtime(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: config.frontendOrigins,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("socket connected", socket.id);
    registerMatchmaking(io, socket);
    socket.on("disconnect", () => {
      console.log("socket disconnected", socket.id);
    });
  });

  return io;
}
