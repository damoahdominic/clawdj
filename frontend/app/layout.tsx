import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "🦞 ClawDJ — AI Mashup Engine",
  description: "Mix any two songs instantly with AI-powered stem separation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
