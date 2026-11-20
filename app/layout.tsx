import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit } from "next/font/google";
import "./globals.css";
import QueryClientSetup from "@/lib/QueryClientProviderSetup";
import { validateCriticalEnvs } from "@/lib/envguard";
import { installGlobalLogHooks } from "@/lib/log-redact";
import { SITE_URL } from "@/lib/site";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["opsz"],
  weight: "variable",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
});

const brandName = process.env.NEXT_PUBLIC_PACTOPUS_NAME || "Pactopus";
const ogTitle = `${brandName} — Crypto Invoicing for Arc & Algorand`;
const ogDesc =
  "Octopus-themed crypto invoicing dApp by Kyrvyn Ltd. Create invoices, collect Arc + Algorand payments, 3 hearts, 8 arms, 0 chargebacks.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${brandName} — Octopus-Adaptive Multi-Chain Invoicing`,
  description: `${brandName} lets freelancers, businesses, and AI agents create on-chain invoices while the interface adapts its primary colors in milliseconds to match Arc or Algorand branding.`,
  keywords: [
    "stablecoin agreements",
    "escrow pacts",
    "USDC",
    "EURC",
    "Arc blockchain",
    "Algorand",
    "crypto payments",
    brandName,
    "Kyrvyn Ltd",
    "brand-adaptive interface",
    "octopus-inspired fintech",
  ],
  authors: [{ name: "Kyrvyn Ltd", url: "https://kyrvynltd.co.uk" }],
  creator: "Kyrvyn Ltd",
  publisher: "Kyrvyn Ltd",
  alternates: { canonical: "/", languages: { "en-US": "/en-US" } },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  category: "finance",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: brandName,
    title: ogTitle,
    description: ogDesc,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Pactopus — Crypto Invoicing dApp logo + tagline",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: ogTitle,
    description: ogDesc,
    creator: "@pactopus",
    site: "@pactopus",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Pactopus — Crypto Invoicing dApp logo + tagline",
      },
    ],
  },
  manifest: "/site.webmanifest",
  other: {
    "msapplication-TileColor": "#0a0814",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      new URL("/favicon.ico", SITE_URL).toString(),
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0814" },
    { media: "(prefers-color-scheme: light)", color: "#fff6ee" },
  ],
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  validateCriticalEnvs({ mode: "warn" });
  installGlobalLogHooks();
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      data-theme="dark"
      suppressHydrationWarning
      className={`${fraunces.variable} ${outfit.variable}`}
    >
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Pactopus",
              parentOrganization: {
                "@type": "Organization",
                name: "Kyrvyn Ltd",
                url: "https://kyrvynltd.co.uk",
              },
              url: SITE_URL,
              logo: `${SITE_URL}/opengraph-image`,
              description:
                "Crypto invoicing dApp for Arc and Algorand blockchains by Kyrvyn Ltd.",
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "Pactopus",
              url: SITE_URL,
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: [
                {
                  "@type": "Question",
                  name: "Is Pactopus free?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "The Solo Tide plan is free forever (5 invoices/month, 0.5% fee). Upgrade to Reef Pro (15 USDC / ~£12 per month, 10,000 invoices/month, 0.4% fee) or Armada Business (50 USDC / ~£40 per month, 1,000,000 invoices/month, 0.3% fee) for higher volumes.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Which blockchains do you support?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Arc Testnet and Algorand Testnet with USDC and EURC stablecoin settlement.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Which wallets are supported?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "MetaMask, Coinbase Wallet, Phantom (EVM), and WalletConnect on Arc; Pera Wallet on Algorand.",
                  },
                },
                {
                  "@type": "Question",
                  name: "What's the catch?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "No catch. No chargebacks (blockchain finality) and server-verified atomic fee splits.",
                  },
                },
              ],
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Product",
              name: "Pactopus — Crypto Invoicing dApp",
              description:
                "Issue branded crypto invoices on Arc + Algorand with cryptographic wallet authentication.",
              offers: [
                {
                  "@type": "Offer",
                  name: "The Solo Tide",
                  price: "0",
                  priceCurrency: "USD",
                  availability: "https://schema.org/InStock",
                  url: SITE_URL,
                },
                {
                  "@type": "Offer",
                  name: "The Reef Pro",
                  price: "15",
                  priceCurrency: "USD",
                  availability: "https://schema.org/InStock",
                  url: SITE_URL,
                },
                {
                  "@type": "Offer",
                  name: "The Armada Business",
                  price: "50",
                  priceCurrency: "USD",
                  availability: "https://schema.org/InStock",
                  url: SITE_URL,
                },
              ],
              brand: { "@type": "Brand", name: "Pactopus" },
            }),
          }}
        />
        <QueryClientSetup>{children}</QueryClientSetup>
      </body>
    </html>
  );
}
