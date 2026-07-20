import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brain — Agent Ecosystem Registry",
  description: "Central registry for skills, plugins, CLI tools, MCP servers, bots, dashboards, processes, and memory facts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
