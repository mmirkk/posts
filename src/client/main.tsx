import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ExecutiveApp from "./ExecutiveApp";
import "./styles.css";

const CurrentApp = window.location.pathname.startsWith("/analitico") ? App : ExecutiveApp;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CurrentApp />
  </React.StrictMode>,
);
