import { LayoutGroup } from "motion/react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ApiTest } from "./pages/ApiTest";
import { Battle } from "./pages/Battle";
import { CameraCheck } from "./pages/CameraCheck";
import { Charts } from "./pages/Charts";
import { Home } from "./pages/Home";
import { Map } from "./pages/Map";
import { SoloBattles } from "./pages/SoloBattles";
import { SkeletonDebug } from "./pages/SkeletonDebug";
import { EffectsProvider } from './performance/EffectsProvider';

export default function App() {
  return (
    <BrowserRouter>
      <LayoutGroup id="ojustdance-flow">
        <Routes>
          <Route path="skeleton-debug" element={<SkeletonDebug />} />
          <Route index element={<Home />} />
          <Route element={<Layout />}>
            <Route path="camera-check" element={<CameraCheck />} />
            <Route path="battle" element={<EffectsProvider><Battle /></EffectsProvider>} />
            <Route path="solo" element={<SoloBattles />} />
            <Route path="map" element={<Map />} />
            <Route path="charts" element={<Charts />} />
            <Route path="api-test" element={<ApiTest />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </LayoutGroup>
    </BrowserRouter>
  );
}
