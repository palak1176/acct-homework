import "./globals.css";
import { ServiceWorkerRegister } from "./ServiceWorkerRegister";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Homework Tracker",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#1a2e4a",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <div className="app-shell">
          {children}
        </div>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}

{/* 
<script
  dangerouslySetInnerHTML={{
    __html: `
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      }
    `,
  }}
/>
*/}