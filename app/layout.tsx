import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Euclio",
  description: "Heartbeat monitoring for the automations you run for clients.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // ClerkProvider must wrap the whole tree so Clerk's client context and the
  // server-side auth helpers are available everywhere below it.
  //
  // Routing lives here as props, not env vars: these paths are app structure
  // (they never differ per environment), so keeping them in code avoids env
  // sprawl. signIn/UpUrl tell Clerk where our mounted pages are;
  // *FallbackRedirectUrl is where to land after auth when no explicit return
  // URL was set.
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
    >
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">{children}</body>
      </html>
    </ClerkProvider>
  );
}
