import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

document.documentElement.classList.add("dark");

const root = ReactDOM.createRoot(document.getElementById("root")!);

// `?gallery` shows the design-system reference instead of the app. Loaded
// with a dynamic import so it stays out of the main bundle.
if (new URLSearchParams(location.search).has("gallery")) {
  import("./gallery/Gallery").then(({ default: Gallery }) => {
    root.render(
      <React.StrictMode>
        <Gallery />
      </React.StrictMode>,
    );
  });
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
