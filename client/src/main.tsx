import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Boot checkpoints read by the inline reporter in client/index.html (step 2t).
// If the app fails to mount, the diagnostic shows which of these were set,
// pinpointing whether main.tsx executed, reached render(), or completed it.
(window as unknown as { __p10_bootStarted?: boolean }).__p10_bootStarted = true;

(window as unknown as { __p10_renderStarted?: boolean }).__p10_renderStarted = true;
createRoot(document.getElementById("root")!).render(<App />);
(window as unknown as { __p10_renderReturned?: boolean }).__p10_renderReturned = true;
