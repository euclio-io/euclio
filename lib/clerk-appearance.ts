import type { ComponentProps } from "react";
import type { ClerkProvider } from "@clerk/nextjs";

/**
 * Euclio v6 Clerk appearance config.
 *
 * Defined once here, consumed by <ClerkProvider appearance={clerkAppearance}>
 * in app/layout.tsx so every Clerk surface (sign-in, sign-up, user-button,
 * factor-two, etc.) inherits it automatically.
 *
 * Design tokens sourced from app/globals.css :root — never invent values here.
 *
 * ⚠️  Clerk version note: these keys use the Clerk v7 `elements` API.
 *     After a @clerk/nextjs dependency bump, if auth pages lose branding,
 *     check the appearance.elements mapping first — Clerk can silently rename
 *     or remove element keys between major versions.
 *
 * Clerk v7 Appearance API (differs from v4/v5):
 *   - `layout` property is gone; socialButtonsVariant / logoImageUrl are
 *     top-level properties on the appearance object.
 *   - Variables: colorText / colorTextSecondary / colorInputBackground /
 *     colorInputText are NOT valid in v7. Correct names:
 *       colorNeutral        → base text/border/neutral color
 *       colorInput          → input background
 *       colorInputForeground → input text
 */
export const clerkAppearance: NonNullable<
  ComponentProps<typeof ClerkProvider>["appearance"]
> = {
  // Options (v7 — was "layout" in v4/v5; now nested under "options" in Theme)
  options: {
    socialButtonsVariant: "blockButton",
    logoImageUrl: "/euclio-mark.svg",
  },

  variables: {
    colorPrimary: "#1E362B",
    colorNeutral: "#101828",
    colorBackground: "#FFFFFF",
    colorInput: "#FFFFFF",
    colorInputForeground: "#101828",
    borderRadius: "8px",
    fontFamily: "Inter, sans-serif",
    fontSize: "14px",
  },

  elements: {
    // Card shell
    card: {
      background: "#FFFFFF",
      border: "1px solid #EAECF0",
      borderRadius: "10px",
      boxShadow: "0 1px 2px rgba(16, 24, 40, .05)",
    },

    // Primary action button (sign in / continue)
    formButtonPrimary: {
      background: "#1E362B",
      color: "#FFFFFF",
      fontSize: "13px",
      fontWeight: "600",
      textTransform: "none", // kill Clerk's default uppercase
      "&:hover": {
        background: "#24402F",
      },
    },

    // Social / OAuth block buttons (Google, etc.)
    socialButtonsBlockButton: {
      background: "#FFFFFF",
      border: "1px solid #D0D5DD",
      boxShadow: "0 1px 2px rgba(16, 24, 40, .05)",
      color: "#475467",
      fontWeight: "600",
    },

    // Card header title
    headerTitle: {
      fontSize: "20px",
      fontWeight: "600",
      letterSpacing: "-0.01em",
    },

    // Card header subtitle
    headerSubtitle: {
      fontSize: "13px",
      color: "#475467",
    },

    // Footer "sign up / sign in" link
    footerActionLink: {
      color: "#1E362B",
      fontWeight: "500",
    },
  },
};
