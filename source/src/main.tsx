import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MeowBlockGame } from "./game";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MeowBlockGame />
  </StrictMode>,
);
