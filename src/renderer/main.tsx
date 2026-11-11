import "@fontsource/sofia-sans/400.css";
import "@fontsource/sofia-sans/600.css";
import "@fontsource/sofia-sans/700.css";
import "@fontsource/sofia-sans-extra-condensed/800.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles.css";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyTheme, savedTheme } from "./theme";

// The theme is set before the first paint, so a dark system does not flash a light window.
applyTheme(savedTheme());

createRoot(document.getElementById("root")!).render(<App />);
