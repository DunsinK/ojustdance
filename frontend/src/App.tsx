import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Battle } from "./pages/Battle";
import { Charts } from "./pages/Charts";
import { Home } from "./pages/Home";
import { Map } from "./pages/Map";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="battle" element={<Battle />} />
          <Route path="map" element={<Map />} />
          <Route path="charts" element={<Charts />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
