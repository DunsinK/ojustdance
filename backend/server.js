import express from "express";
// If you stay on CommonJS (default npm init), use:
// const express = require("express");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`API on http://localhost:${PORT}`);
});