import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { App } from "./App";
import { ModeShell } from "./components/ModeShell";
import { LiveGameAdapter } from "./services/live-game-adapter";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/entry.css";
import "./styles/festival.css";

const Map = lazy(() =>
  import("./pages/Map").then((module) => ({ default: module.Map })),
);
const SoloBattles = lazy(() =>
  import("./pages/SoloBattles").then((module) => ({
    default: module.SoloBattles,
  })),
);

const game = new LiveGameAdapter();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App adapter={game} />} />
        <Route
          path="/battle"
          element={<App adapter={game} startBattle />}
        />
        <Route
          path="/solo"
          element={
            <ModeShell>
              <Suspense fallback={<p className="mode-loading" role="status">Loading Solo…</p>}>
                <SoloBattles />
              </Suspense>
            </ModeShell>
          }
        />
        <Route
          path="/map"
          element={
            <ModeShell>
              <Suspense fallback={<p className="mode-loading" role="status">Loading Practice…</p>}>
                <Map />
              </Suspense>
            </ModeShell>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
if (import.meta.hot) import.meta.hot.dispose(() => game.dispose());
