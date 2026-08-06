import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter } from "next/font/google";
import { clerkAppearance } from "@/lib/clerk-appearance";
import "./globals.css";

// Euclio product voice: no exclamation marks, no "Welcome!", sentence case.
// Keys: signIn.start.subtitle / signUp.start.subtitle (Clerk v7 localization API).
const clerkLocalization = {
  signIn: {
    start: {
      subtitle: "Sign in to your ledger.",
    },
  },
  signUp: {
    start: {
      subtitle: "Start your ledger.",
    },
  },
};

/**
 * Euclio design system — v6 "professional portal".
 * Font: Inter only (400/500/600/700). Monospace is the system stack,
 * reserved strictly for code-like values (snippets, tokens, addresses).
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
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
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
      appearance={clerkAppearance}
      localization={clerkLocalization}
    >
      <html
        lang="en"
        className={`${inter.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">{children}</body>
      </html>
    </ClerkProvider>
  );
}
