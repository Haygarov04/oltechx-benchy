import "@fontsource/sofia-sans/400.css";
import "@fontsource/sofia-sans/600.css";
import "@fontsource/sofia-sans/700.css";
import "@fontsource/sofia-sans-extra-condensed/800.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles.css";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<App />);
