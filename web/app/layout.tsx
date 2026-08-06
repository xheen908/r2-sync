import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "R2Sync Drive | Cloudflare R2 Storage",
  description: "Secure, fast cloud storage with expiring share links powered by Cloudflare R2 & D1",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" className="dark">
      <body className="antialiased selection:bg-orange-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
