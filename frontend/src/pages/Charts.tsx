import { Link } from "react-router-dom";
import "./pages.css";

const MOCK_CHARTS = [
  { id: "1", title: "Midnight Groove", mapper: "nova", difficulty: "Easy", length: "2:18" },
  { id: "2", title: "Sidewalk Static", mapper: "kai", difficulty: "Normal", length: "1:54" },
  { id: "3", title: "Heat Check", mapper: "rim", difficulty: "Hard", length: "2:41" },
  { id: "4", title: "Lobby Bounce", mapper: "ada", difficulty: "Easy", length: "1:32" },
];

export function Charts() {
  return (
    <main className="page charts-page">
      <header className="page-head">
        <h1>Charts</h1>
        <p>Community maps waiting for a battle. Placeholder list for now.</p>
      </header>

      <ul className="chart-list">
        {MOCK_CHARTS.map((chart) => (
          <li key={chart.id}>
            <button type="button" className="chart-row">
              <span className="chart-title">{chart.title}</span>
              <span className="chart-meta">
                {chart.difficulty} · {chart.length} · @{chart.mapper}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="page-actions">
        <Link to="/map" className="btn primary">
          Map your own
        </Link>
        <Link to="/battle" className="btn ghost">
          Random battle
        </Link>
      </div>
    </main>
  );
}
