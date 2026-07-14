import React from "react";
import { createRoot } from "react-dom/client";
import Root from "./Root";

// Polyfill ResizeObserver for environments (older Android WebViews) that lack it.
// Recharts' ResponsiveContainer relies on ResizeObserver to measure container size.
import ResizeObserver from "resize-observer-polyfill";
if (typeof window !== "undefined" && !window.ResizeObserver) {
	window.ResizeObserver = ResizeObserver;
}

// Log safe area CSS errors for debugging
const originalError = console.error;
console.error = function(...args) {
	if (args[0]?.includes?.("Error injecting safe area CSS")) {
		console.warn("🔍 SAFE AREA CSS ERROR:", args[0]);
		console.warn("Full error object:", args[1] || args[0]);
		return;
	}
	originalError.apply(console, args);
};

createRoot(document.getElementById("root")).render(<React.StrictMode><Root /></React.StrictMode>);
