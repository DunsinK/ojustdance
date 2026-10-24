import "dotenv/config";
import cors from "cors";
import express from "express";
import { config } from "./src/config.js";
import { ensureChartsTable } from "./src/db.js";
import { chartsRouter } from "./src/routes/charts.js";

const app = express();

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
  });
});

app.use("/charts", chartsRouter);

async function boot() {
  try {
    await ensureChartsTable();
    console.log("Charts table ready");
  } catch (err) {
    console.error("Could not ensure charts table:", err.message);
    console.error(
      "Check SUPABASE_DIRECT_CONNECTION_KEY (password special chars / [brackets])."
    );
  }

  app.listen(config.port, () => {
    console.log(`API on http://localhost:${config.port}`);
    console.log(`CORS origin: ${config.frontendOrigin}`);
  });
}

boot();
