"use client";

import { useEffect, useState } from "react";
import { currentTheme, setTheme, THEME_EVENT, THEMES, type ThemeId } from "@/lib/theme";

export default function ThemePicker({ className = "" }: { className?: string }) {
  const [active, setActive] = useState<ThemeId | null>(null);
  useEffect(() => {
    const sync = () => setActive(currentTheme().id);
    sync();
    window.addEventListener(THEME_EVENT, sync);
    return () => window.removeEventListener(THEME_EVENT, sync);
  }, []);

  return (
    <div role="radiogroup" aria-label="Theme" className={`flex items-center gap-1.5 ${className}`}>
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={active === t.id}
          aria-label={`${t.label} theme`}
          title={t.label}
          onClick={() => setTheme(t.id)}
          className="grid size-7 place-items-center rounded-full transition hover:scale-110"
          style={{
            boxShadow: active === t.id ? `0 0 0 2px var(--bg), 0 0 0 4px ${t.swatch}` : "none",
          }}
        >
          <span
            className="size-5 rounded-full border border-white/20"
            style={{ background: `linear-gradient(135deg, ${t.globe.land}, ${t.swatch})` }}
          />
        </button>
      ))}
    </div>
  );
}
