import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Legacy Nexus",
  description: "Preserving generational stories.",
};

import { AuthProvider } from "@/components/AuthProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased font-sans">
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
