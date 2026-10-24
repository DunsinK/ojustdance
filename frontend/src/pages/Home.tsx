import { Link } from "react-router-dom";
import "./Home.css";

export function Home() {
  return (
    <main className="home">
      <div className="home-copy">
        <p className="brand">ojustdance</p>
        <h1>Dance strangers. Score live.</h1>
        <p className="lede">
          Random 1v1 battles on community-mapped charts — graded on your camera,
          settled on the wire.
        </p>
        <div className="cta-row">
          <Link to="/battle" className="btn primary">
            Find a battle
          </Link>
          <Link to="/solo" className="btn ghost">
            Solo battles
          </Link>
          <Link to="/map" className="btn ghost">
            Map a chart
          </Link>
        </div>
      </div>

      <div className="home-visual" aria-hidden="true">
        <div className="stage-plane">
          <span className="lane lane-a" />
          <span className="lane lane-b" />
          <span className="vs">VS</span>
        </div>
      </div>
    </main>
  );
}
