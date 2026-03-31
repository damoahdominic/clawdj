import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClawDJ — AI-Powered DJ Engine",
  description: "Search any vibe, get an instant playlist with crossfade transitions. Or pick two songs and create a mashup with AI stem separation. Radio mode, mashup mixer, BPM matching — all in your browser.",
  metadataBase: new URL("https://clawdj.live"),
  openGraph: {
    title: "ClawDJ — AI-Powered DJ Engine",
    description: "Radio mode with infinite playlists, mashup mixer with AI stem separation. Type a vibe and start listening.",
    url: "https://clawdj.live",
    siteName: "ClawDJ",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ClawDJ — AI-Powered DJ Engine",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ClawDJ — AI-Powered DJ Engine",
    description: "Radio mode with infinite playlists, mashup mixer with AI stem separation. Type a vibe and start listening.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
