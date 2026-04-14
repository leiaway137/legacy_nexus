import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Legacy Nexus",
  description: "Preserving generational stories.",
};

import { AuthProvider } from "@/components/AuthProvider";
import { BackgroundJobProvider } from "@/components/BackgroundJobProvider";
import { GlobalHeader } from "@/components/GlobalHeader";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased font-sans">
      <body className="h-screen flex flex-col overflow-hidden bg-[#F4F1EA] dark:bg-[#111111]">
        <BackgroundJobProvider>
          <AuthProvider>
            <GlobalHeader />
            <main className="flex-1 overflow-y-auto relative no-scrollbar flex flex-col">
              {children}
            </main>
          </AuthProvider>
        </BackgroundJobProvider>
      </body>
    </html>
  );
}
