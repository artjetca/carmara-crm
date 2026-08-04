import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installNativeApiFetch } from "./lib/nativeApi";

installNativeApiFetch();

// iOS Safari/WKWebView ignores `user-scalable=no`, so a two-finger pinch zoomed
// the whole page. Because the tab bar, search bar and map buttons are fixed,
// that made the entire UI drift sideways. Leaflet handles map pinch itself, so
// blocking the document-level gesture only stops the unwanted page zoom.
for (const gesture of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(gesture, (event) => event.preventDefault(), { passive: false });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
