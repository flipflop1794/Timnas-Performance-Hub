import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";

// Tanpa StrictMode: pembacaan Linimasa tercatat di Log Audit, dan render
// ganda StrictMode akan menggandakan entri itu.
createRoot(document.getElementById("root")!).render(<App />);
