import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brain Dashboard — Agent Operations Hub",
  description: "Operational visibility for agents, skills, plugins, CLI tools, MCP servers, dashboards, processes, and durable memory.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
