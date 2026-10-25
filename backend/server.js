import "dotenv/config";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { WebSocketServer } from "ws";
import { GameService } from "./game-service.js";
import { config } from "./src/config.js";
import { chartsRouter } from "./src/routes/charts.js";

const app = express();
const server = createServer(app);
const webSockets = new WebSocketServer({ noServer: true, maxPayload: 16_384 });
const chartPath = new URL("../shared/sample-chart.json", import.meta.url);
const chart = JSON.parse(readFileSync(fileURLToPath(chartPath), "utf8"));
const game = new GameService({ chart });

app.use(cors({ origin: config.frontendOrigin }));
app.use(express.json({ limit: "2mb" }));

app.get(["/health", "/api/health"], (_request, response) => {
  response.json({
    ok: true,
    service: "ojustdance-api",
    time: new Date().toISOString(),
    supabaseConfigured: Boolean(config.supabaseUrl && config.supabaseSecretKey),
  });
});

app.get("/api/chart", (_request, response) => {
  response.json(chart);
});

app.use("/api/charts", chartsRouter);

app.use((error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  console.error("HTTP request failed:", error);
  const status =
    error.code === "LIMIT_FILE_SIZE"
      ? 413
      : Number.isInteger(error.status) && error.status >= 400 && error.status < 600
        ? error.status
        : 500;
  response.status(status).json({
    error: error.message || "The request could not be completed.",
  });
});

server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  if (pathname !== "/ws") {
    socket.destroy();
    return;
  }
  webSockets.handleUpgrade(request, socket, head, (webSocket) => {
    webSockets.emit("connection", webSocket);
  });
});

webSockets.on("connection", (webSocket) => {
  const clientId = game.addClient((message) => {
    if (webSocket.readyState === webSocket.OPEN) {
      webSocket.send(JSON.stringify(message));
    }
  });

  webSocket.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      webSocket.send(
        JSON.stringify({ type: "error", message: "Message must be valid JSON." }),
      );
      return;
    }
    if (!message || typeof message.type !== "string") {
      webSocket.send(
        JSON.stringify({ type: "error", message: "Message type is required." }),
      );
      return;
    }
    game.handle(clientId, message);
  });

  webSocket.on("close", () => game.removeClient(clientId));
  webSocket.on("error", (error) => {
    console.error("WebSocket error:", error);
    game.removeClient(clientId);
  });
});

const ticker = setInterval(() => game.advance(), 100);
server.listen(config.port, () => {
  console.log(`ojustdance backend listening on http://localhost:${config.port}`);
});

function shutdown() {
  clearInterval(ticker);
  game.close();
  server.close();
  for (const webSocket of webSockets.clients)
    webSocket.close(1001, "Server shutting down");
  webSockets.close();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
