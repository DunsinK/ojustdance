import { useEffect, useRef, useState } from "react";
import {
  askMapAgent,
  searchDanceVideos,
  type AgentChatMessage,
  type DanceVideoResult,
} from "../lib/api";
import { Spark } from "./Brand";
import "./MapAgent.css";

const WELCOME =
  "I’m your Map Coach. Ask how to record, import, edit the timeline, or publish a chart.";

type Props = {
  onImportVideo: () => void;
};

export function MapAgent({ onImportVideo }: Props) {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [danceDescription, setDanceDescription] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [results, setResults] = useState<DanceVideoResult[]>([]);
  const [selectedResult, setSelectedResult] =
    useState<DanceVideoResult | null>(null);
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

  async function searchDances() {
    const description = danceDescription.trim();
    if (!description || searchBusy) return;

    setSearchBusy(true);
    setSearchError(null);
    setSearchQuery(null);
    setResults([]);
    setSelectedResult(null);
    try {
      const response = await searchDanceVideos(description);
      setSearchQuery(response.query);
      setResults(response.results);
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "Dance search failed. Try again."
      );
    } finally {
      setSearchBusy(false);
    }
  }

  return (
    <div className={`map-agent${open ? " is-open" : ""}`}>
      {open && (
        <div
          className={`map-agent-panel${searchOpen ? " map-agent-panel--search" : ""}`}
          role="dialog"
          aria-label="Map Coach"
        >
          <header className="map-agent-head">
            <div>
              <strong>Map Coach</strong>
              <span>{searchOpen ? "YouTube dance search" : "Powered by Muse Spark"}</span>
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

          {searchOpen ? (
            <section className="map-agent-search" aria-label="Find a dance video">
              <button
                type="button"
                className="map-agent-back"
                onClick={() => setSearchOpen(false)}
              >
                Back to Map Coach
              </button>
              <form
                className="map-agent-search-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void searchDances();
                }}
              >
                <label htmlFor="map-agent-dance-description">
                  Describe the dance
                </label>
                <textarea
                  id="map-agent-dance-description"
                  value={danceDescription}
                  onChange={(event) => setDanceDescription(event.target.value)}
                  placeholder="A short, beginner-friendly shuffle dance to a fast beat"
                  maxLength={500}
                  disabled={searchBusy}
                />
                <button
                  type="submit"
                  className="btn primary"
                  disabled={searchBusy || !danceDescription.trim()}
                >
                  {searchBusy ? "Searching…" : "Search YouTube"}
                </button>
              </form>

              <p className="map-agent-search-note">
                Muse suggests a search query; results may not match the dance.
                Preview the clip before choosing it. YouTube videos cannot be
                analyzed directly here.
              </p>
              {searchBusy && (
                <p className="map-agent-search-status" role="status">
                  Finding videos…
                </p>
              )}
              {searchError && (
                <p className="map-agent-error" role="alert">
                  {searchError}
                </p>
              )}
              {!searchBusy && searchQuery && results.length === 0 && (
                <p className="map-agent-search-status" role="status">
                  No videos found for “{searchQuery}”. Try another description.
                </p>
              )}
              {!searchBusy && results.length > 0 && (
                <>
                  <p className="map-agent-search-query">
                    Search: <strong>{searchQuery}</strong>
                  </p>
                  <div className="map-agent-results" aria-label="Search results">
                    {results.map((result) => (
                      <div
                        key={result.videoId}
                        className="map-agent-result"
                      >
                        <a
                          className="map-agent-result-link"
                          href={result.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Open ${result.title} on YouTube in a new tab`}
                        >
                          {result.thumbnail ? (
                            <img src={result.thumbnail} alt="" loading="lazy" />
                          ) : (
                            <span className="map-agent-result-placeholder">
                              Video
                            </span>
                          )}
                          <span className="map-agent-result-copy">
                            <strong>{result.title}</strong>
                            <span>
                              {result.channel || "YouTube"}
                              {result.duration ? ` · ${result.duration}` : ""}
                              {result.isShort ? " · Short" : ""}
                            </span>
                          </span>
                        </a>
                        <button
                          type="button"
                          className="map-agent-result-preview"
                          aria-pressed={selectedResult?.videoId === result.videoId}
                          onClick={() => setSelectedResult(result)}
                        >
                          Preview
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {selectedResult && (
                <div className="map-agent-preview">
                  <h3>Preview: {selectedResult.title}</h3>
                  <iframe
                    src={selectedResult.embedUrl}
                    title={`YouTube preview: ${selectedResult.title}`}
                    referrerPolicy="strict-origin-when-cross-origin"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                  <a
                    className="map-agent-watch-link"
                    href={selectedResult.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open on YouTube
                  </a>
                  <p>
                    To analyze a video, import a video file you have permission
                    to use. Map will run MediaPipe after import.
                  </p>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => {
                      onImportVideo();
                      setOpen(false);
                    }}
                  >
                    Choose video file to analyze
                  </button>
                </div>
              )}
            </section>
          ) : (
            <>
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
                {error && (
                  <p className="map-agent-error" role="alert">
                    {error}
                  </p>
                )}
              </div>

              <button
                type="button"
                className="map-agent-find-button"
                onClick={() => {
                  setSearchOpen(true);
                  setSearchError(null);
                }}
              >
                Find a dance video
              </button>
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
            </>
          )}
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
