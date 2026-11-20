import { ImageResponse } from "next/og";

export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const alt = "Pactopus — Crypto Invoicing for Arc & Algorand";

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background:
            "radial-gradient(1100px 600px at 15% 20%, #431a6f 0%, #18102a 55%, #0a0814 100%)",
          color: "#f6f4fb",
          fontFamily: "Fraunces, Georgia, serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontSize: 40,
            letterSpacing: -0.5,
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 24,
              background:
                "linear-gradient(135deg,#ffb648 0%,#f59e0b 55%,#e05a4f 100%)",
              boxShadow: "0 18px 40px -8px rgba(255,183,72,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 44,
            }}
          >🐙</div>
          <span style={{ fontWeight: 800 }}>Pactopus</span>
          <span
            style={{
              marginLeft: 14,
              color: "#ffd7a8",
              fontSize: 22,
              fontWeight: 500,
            }}
          >
            Crypto Invoicing · Arc & Algorand
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 84,
              lineHeight: 1.05,
              fontWeight: 900,
              letterSpacing: -2,
              gap: 0,
            }}
          >
            <div style={{ display: "block" }}>Three hearts.</div>
            <div style={{ display: "block" }}>Eight arms.</div>
            <div
              style={{
                display: "block",
                background:
                  "linear-gradient(90deg,#ffb648,#f59e0b 65%,#e05a4f)",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Zero chargebacks.
            </div>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: "#c5bfd6",
              maxWidth: 900,
              fontFamily: "Outfit, sans-serif",
              lineHeight: 1.3,
            }}
          >
            The cephalopod-approved crypto invoicing dApp. Issue branded invoices. Get paid on-chain. Your client doesn&apos;t even need to know what a blockchain is.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            color: "#9e97b3",
            fontFamily: "Outfit, sans-serif",
            fontSize: 22,
          }}
        >
          <div style={{ display: "flex" }}>pactopus-app.vercel.app</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                padding: "8px 14px",
                border: "1px solid #3a2e52",
                borderRadius: 999,
              }}
            >
              🔷 Arc
            </div>
            <div
              style={{
                display: "flex",
                padding: "8px 14px",
                border: "1px solid #2a4d4b",
                borderRadius: 999,
              }}
            >
              🐢 Algorand
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
