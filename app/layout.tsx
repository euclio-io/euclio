import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Spectral, Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

/**
 * Euclio design system fonts (adopted M5):
 *   Spectral      — serif, headings / client names
 *   Instrument Sans — sans, body / UI chrome
 *   IBM Plex Mono — mono, tokens / timestamps / labels
 *
 * Each is loaded as a CSS variable so globals.css can reference them via
 * --font-spectral / --font-instrument-sans / --font-ibm-plex-mono.
 */
const spectral = Spectral({
  variable: "--font-spectral",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
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
        className={`${spectral.variable} ${instrumentSans.variable} ${ibmPlexMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">{children}</body>
      </html>
    </ClerkProvider>
  );
}
