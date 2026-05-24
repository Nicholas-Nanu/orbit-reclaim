import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

export const runtime = "edge";

export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          backgroundColor: "#0d0d0d",
          color: "#ffffff",
          fontFamily: "monospace",
        }}
      >
        <div
          style={{
            fontSize: 28,
            letterSpacing: 8,
            color: "#a3a3a3",
            textTransform: "uppercase",
          }}
        >
          {SITE.tagline}
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 110,
            fontWeight: 700,
            letterSpacing: -2,
            color: "#ffe11f",
          }}
        >
          {SITE.wordmark}
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 32,
            lineHeight: 1.3,
            color: "#ffffff",
            maxWidth: 900,
          }}
        >
          Collision risk · Compliance urgency · Salvage value
        </div>
        <div
          style={{
            marginTop: 48,
            display: "flex",
            gap: 16,
          }}
        >
          {["#ffe11f", "#ff6b35", "#b89c14"].map((c) => (
            <div
              key={c}
              style={{
                width: 120,
                height: 10,
                backgroundColor: c,
                borderRadius: 2,
              }}
            />
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
