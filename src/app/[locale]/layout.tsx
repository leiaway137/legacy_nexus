import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "Legacy Nexus",
  description: "Preserving generational stories.",
};

import { AuthProvider } from "@/components/AuthProvider";
import { BackgroundJobProvider } from "@/components/BackgroundJobProvider";
import { GlobalHeader } from "@/components/GlobalHeader";
import { OnboardingProvider } from "@/components/OnboardingProvider";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  
  if (!routing.locales.includes(locale as any)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale} className="h-full antialiased font-sans">
      <body className="h-screen flex flex-col overflow-hidden bg-[#F4F1EA] dark:bg-[#111111]">
        <NextIntlClientProvider messages={messages}>
          <BackgroundJobProvider>
            <AuthProvider>
              <OnboardingProvider>
                <GlobalHeader />
                <main className="flex-1 overflow-y-auto relative no-scrollbar flex flex-col">
                  {children}
                </main>
              </OnboardingProvider>
            </AuthProvider>
          </BackgroundJobProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
