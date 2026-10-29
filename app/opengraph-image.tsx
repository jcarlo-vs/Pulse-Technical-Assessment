import { ImageResponse } from "next/og";
import { LogoMark, SITE_TAGLINE } from "@/lib/site";

// The card shown when the link is shared (Google, iMessage, WhatsApp, X...).
export const alt = "Pulse: talk to someone, somewhere, right now";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const DOTS = [
  { x: 820, y: 200, c: "#7cf5c8" },
  { x: 960, y: 170, c: "#ff7ad9" },
  { x: 1010, y: 300, c: "#a08cff" },
  { x: 880, y: 380, c: "#ffb86b" },
  { x: 760, y: 330, c: "#6bc8ff" },
  { x: 940, y: 460, c: "#a6f07a" },
];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "#0b0b0c",
          fontFamily: "sans-serif",
          color: "#f4f4f5",
        }}
      >
        {/* A stylised globe with live dots on the right. */}
        <div
          style={{
            position: "absolute",
            left: 640,
            top: 60,
            width: 520,
            height: 520,
            borderRadius: 9999,
            background: "radial-gradient(circle at 38% 32%, #3a3b40, #18181b 62%, #0b0b0c 85%)",
            boxShadow: "0 0 120px 10px rgba(29,155,240,0.28)",
          }}
        />
        {DOTS.map((d) => (
          <div
            key={d.x}
            style={{
              position: "absolute",
              left: d.x,
              top: d.y,
              width: 22,
              height: 22,
              borderRadius: 9999,
              background: d.c,
              boxShadow: `0 0 28px 8px ${d.c}`,
            }}
          />
        ))}

        <div style={{ display: "flex", flexDirection: "column", padding: "90px 80px", width: 720 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <LogoMark size={92} />
            <span style={{ fontSize: 76, fontWeight: 700, color: "#4cb6ff" }}>Pulse</span>
          </div>
          <div style={{ display: "flex", marginTop: 54, fontSize: 50, fontWeight: 700, lineHeight: 1.15, maxWidth: 620 }}>
            {SITE_TAGLINE}
          </div>
          <div style={{ display: "flex", marginTop: 40, fontSize: 28, color: "#a7a7ad", lineHeight: 1.4, maxWidth: 520 }}>
            Anonymous chat and video with strangers on a live globe. No accounts, nothing stored.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
