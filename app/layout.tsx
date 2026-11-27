import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import QueryClientSetup from "@/lib/QueryClientProviderSetup";
import MwaRegister from "@/components/MwaRegister";
import { validateCriticalEnvs } from "@/lib/envguard";
import { installGlobalLogHooks } from "@/lib/log-redact";
import { SITE_URL } from "@/lib/site";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "600", "700"],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const brandName = process.env.NEXT_PUBLIC_PACTOPUS_NAME || "Pactopus";
const ogTitle = `${brandName} — Solana & Seeker Phone Adaptive Stablecoin Invoicing`;
const ogDesc =
  "Octopus-adaptive Solana invoicing dApp by Kyrvyn Ltd. 0.5% capped at £50 on Web, 0.25% capped at £5 on Solana Seeker Phone. No monthly subscription fee, unlimited invoices, locked GBP accounting.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${brandName} — Solana & Seeker Phone Adaptive Stablecoin Invoicing`,
  description: `${brandName} pairs its octopus chameleon interface directly with the Solana Seeker phone: 0.25% fee capped at £5 for Seeker holders & 0.5% capped at £50 on standard web. No monthly subscription fee with locked GBP accounting records.`,
  keywords: [
    "Solana invoicing",
    "Solana Seeker phone dApp",
    "Seed Vault Mobile Wallet Adapter",
    "Solana Pay QR",
    "Solana Blinks invoicing",
    "USDC",
    "EURC",
    "GBP crypto accounting",
    brandName,
    "Kyrvyn Ltd",
    "octopus-adaptive Solana interface",
  ],
  authors: [{ name: "Kyrvyn Ltd", url: "https://kyrvynltd.co.uk" }],
  creator: "Kyrvyn Ltd",
  publisher: "Kyrvyn Ltd",
  alternates: { canonical: "/", languages: { "en-GB": "/en-GB", "en-US": "/en-US" } },
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
    locale: "en_GB",
    url: "/",
    siteName: brandName,
    title: ogTitle,
    description: ogDesc,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Pactopus — Solana & Seeker Phone Invoicing dApp by Kyrvyn Ltd",
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
        alt: "Pactopus — Solana & Seeker Phone Invoicing dApp by Kyrvyn Ltd",
      },
    ],
  },
  manifest: "/manifest.webmanifest",
  other: {
    "msapplication-TileColor": "#07090e",
  },
  icons: {
    icon: [
      { url: "/logo.png" },
      new URL("/logo.png", SITE_URL).toString(),
    ],
    apple: "/logo.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#07090e" },
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
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
      className={`${spaceGrotesk.variable} ${plusJakartaSans.variable} ${jetbrainsMono.variable}`}
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
                "Non-custodial Solana & Solana Seeker Phone invoicing and GBP reconciliation dApp by Kyrvyn Ltd.",
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
                  name: "How much does Pactopus cost?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "No monthly subscription fee with unlimited invoices. Standard Web users pay only 0.5% per settled invoice capped at £50 maximum. Verified Solana Seeker phone owners pay 0.25% capped at £5 maximum.",
                  },
                },
                {
                  "@type": "Question",
                  name: "How does the Octopus Chameleon Seeker pairing work?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Inspired by the octopus colour-changing chromatophores, Pactopus changes its theme and fee tier when it recognises an eligible Solana Seeker holder, lowering the fee to 0.25% with a £5 max cap.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Which wallets and payment methods are supported?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Solana Mobile Wallet Adapter 2.0 (Seed Vault on Solana Seeker), Phantom, Solflare, Backpack, Solana Pay QR codes, and shareable Solana Blinks / Actions with USDC and EURC.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Are payments non-custodial and accountant-ready?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Yes. Every payment settles atomically into your wallet within seconds with an on-chain SPL Memo, deterministic recovery reference key, 6-state settlement telemetry, and locked GBP FX export for UK accounting.",
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
              name: "Pactopus — Solana & Seeker Phone Invoicing dApp",
              description:
                "Non-custodial Solana USDC/EURC invoicing with 0.5% (£50 max cap) Standard Web and 0.25% (£5 max cap) for verified Seeker payer wallets.",
              offers: [
                {
                  "@type": "Offer",
                  name: "Standard Web Mode (0.5% · Max £50 Cap · £0/mo Unlimited)",
                  price: "0",
                  priceCurrency: "GBP",
                  availability: "https://schema.org/InStock",
                  url: SITE_URL,
                },
                {
                  "@type": "Offer",
                  name: "Verified Seeker payer (0.25% · Max £5 Cap · £0/mo Unlimited)",
                  price: "0",
                  priceCurrency: "GBP",
                  availability: "https://schema.org/InStock",
                  url: SITE_URL,
                },
              ],
              brand: { "@type": "Brand", name: "Pactopus" },
            }),
          }}
        />
        <MwaRegister />
        <QueryClientSetup>{children}</QueryClientSetup>
      </body>
    </html>
  );
}
