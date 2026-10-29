import { ImageResponse } from "next/og";
import { LogoMark } from "@/lib/site";

// iOS home-screen icon (iOS ignores SVG icons and adds its own rounding).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#141417" }}>
        <LogoMark size={180} />
      </div>
    ),
    size,
  );
}
