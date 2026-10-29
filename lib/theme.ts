// Theme picker. The UI colours are CSS tokens per [data-theme] in
// globals.css; the globe's colours live here because Mapbox paints them in
// JS. The choice is a per-browser convenience in localStorage.

export const THEMES = [
  {
    id: "graphite",
    label: "Graphite",
    swatch: "#1d9bf0",
    fog: { color: "rgb(30, 31, 34)", high: "rgb(34, 58, 88)", space: "rgb(11, 11, 12)" },
    globe: {
      land: "#3a3b40",
      landShade: "#44454b",
      water: "#121214",
      border: "#8a8c94",
      road: "#55575e",
      label: "#e4e4e7",
    },
  },
  {
    id: "navy",
    label: "Navy",
    swatch: "#2c4a66",
    fog: { color: "rgb(26, 44, 64)", high: "rgb(36, 78, 128)", space: "rgb(21, 32, 43)" },
    globe: {
      land: "#2c4a66",
      landShade: "#335675",
      water: "#0f1c2b",
      border: "#6f93b5",
      road: "#41617f",
      label: "#d6e3ef",
    },
  },
  {
    id: "clay",
    label: "Cozy clay",
    swatch: "#b9a2ff",
    fog: { color: "rgb(52, 40, 96)", high: "rgb(96, 72, 160)", space: "rgb(26, 20, 48)" },
    globe: {
      land: "#6a4fb8",
      landShade: "#7a5cc8",
      water: "#26215e",
      border: "#c9b6ff",
      road: "#8f74d8",
      label: "#f1eaff",
    },
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export type Theme = (typeof THEMES)[number];

const KEY = "pulse-theme";
export const THEME_EVENT = "pulse-theme";

export function currentTheme(): Theme {
  const id = typeof document === "undefined" ? undefined : document.documentElement.dataset.theme;
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function setTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {}
  window.dispatchEvent(new Event(THEME_EVENT));
}

// Runs inline in <head> before paint, so a saved theme never flashes.
export const THEME_BOOT = `try{var t=localStorage.getItem("${KEY}");if(t)document.documentElement.dataset.theme=t}catch(e){}`;
