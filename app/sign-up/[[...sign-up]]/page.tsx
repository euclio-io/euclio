import { SignUp } from "@clerk/nextjs";
import Link from "next/link";

// Catch-all route so Clerk owns its sub-paths under /sign-up. Mounted on our
// domain per the M0 decision.
//
// Shell: #F2F4F7 page background, widget centered, Euclio mark + wordmark above,
// quiet back-link below. Appearance tokens are set globally via ClerkProvider in
// app/layout.tsx — do NOT add an appearance prop here.
export default function SignUpPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#F2F4F7",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px 40px",
        boxSizing: "border-box",
      }}
    >
      {/* Logomark + wordmark */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "24px",
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 64 64"
          aria-hidden="true"
          focusable="false"
        >
          <g
            fill="none"
            stroke="#1E362B"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="32" cy="32" r="26.5" />
            <path d="M22 16 V48" />
            <path d="M22 16 H44" />
            <path d="M22 32 H27 L30 24 L33 40 L36 32 H43" />
            <path d="M22 48 H44" />
          </g>
        </svg>
        <span
          style={{
            fontSize: "18px",
            fontWeight: 600,
            color: "#101828",
            letterSpacing: "-0.01em",
            fontFamily: "var(--font-inter, Inter, sans-serif)",
          }}
        >
          Euclio
        </span>
      </div>

      {/* Clerk widget — appearance inherited from ClerkProvider */}
      <SignUp />

      {/* Back link */}
      <Link
        href="https://euclio.io"
        style={{
          marginTop: "20px",
          fontSize: "13px",
          color: "#475467",
          textDecoration: "none",
          fontFamily: "var(--font-inter, Inter, sans-serif)",
        }}
      >
        ← euclio.io
      </Link>
    </main>
  );
}
