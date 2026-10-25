import { useEffect, useRef, useState } from "react";
import { askMapAgent, type AgentChatMessage } from "../lib/api";
import { Spark } from "./Brand";
import "./MapAgent.css";

const WELCOME =
  "I’m your Map Coach. Ask how to record, import, edit the timeline, or publish a chart.";

export function MapAgent() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentChatMessage[]>([
    { role: "assistant", content: WELCOME },
  ]);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    const forApi: AgentChatMessage[] = [
      ...messages.filter(
        (m) => !(m.role === "assistant" && m.content === WELCOME)
      ),
      { role: "user", content: text },
    ];

    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setBusy(true);
    try {
      const reply = await askMapAgent(forApi);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Agent failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`map-agent${open ? " is-open" : ""}`}>
      {open && (
        <div className="map-agent-panel" role="dialog" aria-label="Map Coach">
          <header className="map-agent-head">
            <div>
              <strong>Map Coach</strong>
              <span>Powered by Muse Spark</span>
            </div>
            <button
              type="button"
              className="map-agent-close"
              aria-label="Close coach"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </header>

          <div className="map-agent-messages" ref={listRef}>
            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={`map-agent-bubble map-agent-bubble--${m.role}`}
              >
                {m.content}
              </div>
            ))}
            {busy && (
              <div className="map-agent-bubble map-agent-bubble--assistant map-agent-typing">
                Thinking…
              </div>
            )}
            {error && <p className="map-agent-error">{error}</p>}
          </div>

          <form
            className="map-agent-form"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="How do I publish a chart?"
              disabled={busy}
              aria-label="Ask Map Coach"
            />
            <button
              type="submit"
              className="btn primary"
              disabled={busy || !input.trim()}
            >
              Send
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        className="map-agent-fab"
        aria-label={open ? "Close Map Coach" : "Open Map Coach"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Spark />
      </button>
    </div>
  );
}
