import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider } from "./config/ConfigContext";
import App from "./App";
import "./index.css";
import "./styles/themes.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfigProvider>
      <App />
    </ConfigProvider>
  </StrictMode>
);
