import { Router } from "express";
import { config } from "../config.js";
import { MAP_AGENT_DEVELOPER_PROMPT } from "../muse/mapAgentContext.js";

export const agentRouter = Router();

const MAX_MESSAGES = 24;
const MAX_CONTENT_LEN = 4000;

/**
 * @param {unknown} messages
 * @returns {{ role: string, content: string }[]}
 */
function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  const out = [];
  for (const raw of messages.slice(-MAX_MESSAGES)) {
    if (!raw || typeof raw !== "object") continue;
    const role = raw.role === "assistant" ? "assistant" : "user";
    const content = String(raw.content ?? "").trim().slice(0, MAX_CONTENT_LEN);
    if (!content) continue;
    out.push({ role, content });
  }
  return out;
}

/**
 * POST /agent/chat
 * Body: { messages: [{ role: "user"|"assistant", content: string }] }
 * Calls Muse Spark (no tools) with Map product context.
 */
agentRouter.post("/chat", async (req, res) => {
  if (!config.museApiKey) {
    res.status(503).json({
      error: "Muse is not configured (set MUSE_API_KEY on the server).",
    });
    return;
  }

  const history = sanitizeMessages(req.body?.messages);
  if (!history.length) {
    res.status(400).json({ error: "Send at least one user message." });
    return;
  }

  const payload = {
    model: config.museModel,
    reasoning_effort: "low",
    messages: [
      { role: "developer", content: MAP_AGENT_DEVELOPER_PROMPT },
      ...history,
    ],
  };

  try {
    const upstream = await fetch(`${config.museBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.museApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const detail =
        data?.error?.message ||
        data?.message ||
        `Muse request failed (${upstream.status})`;
      console.error("Muse chat error:", upstream.status, detail);
      res.status(502).json({ error: detail });
      return;
    }

    const reply =
      data?.choices?.[0]?.message?.content?.trim() ||
      "I didn’t get a reply — try asking again.";

    res.json({ reply });
  } catch (err) {
    console.error("Muse chat exception:", err);
    res.status(502).json({
      error: err instanceof Error ? err.message : "Muse request failed",
    });
  }
});
