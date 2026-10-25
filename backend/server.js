import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "http";
import { config } from "./src/config.js";
import { ensureChartsTable } from "./src/db.js";
import { attachRealtime } from "./src/realtime/index.js";
import { chartsRouter } from "./src/routes/charts.js";

const app = express();
const httpServer = createServer(app);

app.use(
  cors({
    origin: config.frontendOrigin,
  })
);
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "ojustdance-api",
    time: new Date().toISOString(),
    supabaseConfigured: Boolean(config.supabaseUrl && config.databaseUrl),
    realtime: "socket.io",
  });
});

app.use("/charts", chartsRouter);

attachRealtime(httpServer);

async function boot() {
  if (config.skipDatabaseInit) {
    console.log("Using existing charts table; database initialization skipped");
  } else {
    try {
      await ensureChartsTable();
      console.log("Charts table ready");
    } catch (err) {
      console.error("Could not ensure charts table:", err.message);
      console.error(
        "Check SUPABASE_DIRECT_CONNECTION_KEY (password special chars / [brackets])."
      );
    }
  }

  httpServer.listen(config.port, config.host, () => {
    console.log(`API on http://localhost:${config.port}`);
    console.log(`Socket.io ready (CORS ${config.frontendOrigin})`);
  });
}

boot();
