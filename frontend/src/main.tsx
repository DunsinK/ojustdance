import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { DemoController } from "./demo/controller";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/entry.css";
const demo = new DemoController();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App adapter={demo} demoControls={demo} />
  </React.StrictMode>,
);
if (import.meta.hot) import.meta.hot.dispose(() => demo.dispose());
