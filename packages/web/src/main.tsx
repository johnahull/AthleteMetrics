import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installCsrfFetch } from "./lib/csrf-fetch";

installCsrfFetch();

createRoot(document.getElementById("root")!).render(<App />);
