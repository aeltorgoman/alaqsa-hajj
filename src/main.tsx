import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider } from "./config/ConfigContext";
import App from "./App";
import { PilgrimPortal } from "./components/PilgrimPortal";
import "./index.css";
import "./styles/themes.css";

const isPortal = window.location.pathname.startsWith("/hajj");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isPortal ? (
      <PilgrimPortal />
    ) : (
      <ConfigProvider>
        <App />
      </ConfigProvider>
    )}
  </StrictMode>
);
