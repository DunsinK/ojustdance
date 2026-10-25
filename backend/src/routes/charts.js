import { Router } from "express";
import multer from "multer";
import { getChartById, insertChart, listCharts } from "../chartsStore.js";
import { config } from "../config.js";
import { ensureChartBucket, uploadChartVideo } from "../supabase.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxVideoBytes },
});

export const chartsRouter = Router();

chartsRouter.get("/", async (_req, res) => {
  try {
    const rows = await listCharts();
    res.json({
      charts: rows.map((row) => ({
        id: row.id,
        title: row.title,
        difficulty: row.difficulty,
        durationSec: row.duration_sec,
        sampleRateHz: row.sample_rate_hz,
        model: row.model,
        videoUrl: row.video_url,
        createdAt: row.created_at,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to list charts" });
  }
});

chartsRouter.get("/:id", async (req, res) => {
  try {
    const row = await getChartById(req.params.id);
    if (!row) return res.status(404).json({ error: "Chart not found" });
    res.json({
      id: row.id,
      title: row.title,
      difficulty: row.difficulty,
      durationSec: row.duration_sec,
      sampleRateHz: row.sample_rate_hz,
      model: row.model,
      chartJson: row.chart_json,
      videoUrl: row.video_url,
      createdAt: row.created_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to load chart" });
  }
});

chartsRouter.post(
  "/",
  upload.fields([
    { name: "video", maxCount: 1 },
    { name: "chart", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      let chartJson = null;
      const chartFile = req.files?.chart?.[0];
      if (chartFile) {
        try {
          chartJson = JSON.parse(chartFile.buffer.toString("utf8"));
        } catch {
          return res.status(400).json({ error: "Chart JSON is invalid" });
        }
      } else if (typeof req.body.chart === "string") {
        try {
          chartJson = JSON.parse(req.body.chart);
        } catch {
          return res.status(400).json({ error: "Chart JSON is invalid" });
        }
      }

      if (
        !chartJson ||
        typeof chartJson !== "object" ||
        Array.isArray(chartJson)
      ) {
        return res.status(400).json({ error: "Missing chart JSON" });
      }
      if (!Array.isArray(chartJson.samples) || chartJson.samples.length === 0) {
        return res
          .status(400)
          .json({ error: "Chart JSON must include pose samples" });
      }

      const videoFile = req.files?.video?.[0];
      let videoPath = null;
      let videoUrl = null;

      if (videoFile) {
        await ensureChartBucket();
        const uploaded = await uploadChartVideo(videoFile);
        videoPath = uploaded.path;
        videoUrl = uploaded.publicUrl;
      }

      const title =
        req.body.title || chartJson.title || videoFile?.originalname || "Untitled chart";
      const difficulty =
        req.body.difficulty || chartJson.difficulty || "easy";

      const row = await insertChart({
        title,
        difficulty,
        durationSec: chartJson.durationSec ?? null,
        sampleRateHz: chartJson.sampleRateHz ?? null,
        model: chartJson.model ?? null,
        chartJson,
        videoPath,
        videoUrl,
      });

      res.status(201).json({
        id: row.id,
        title: row.title,
        difficulty: row.difficulty,
        durationSec: row.duration_sec,
        videoUrl: row.video_url,
        createdAt: row.created_at,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || "Failed to save chart" });
    }
  }
);
