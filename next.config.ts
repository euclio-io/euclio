import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

// withSentryConfig wires build-time source-map upload and tunneling.
// org/project/authToken come from env: authToken (a secret) is BUILD-TIME ONLY
// and only needed to upload source maps for readable prod stack traces — the app
// runs fine without it (uploads are simply skipped, with a warning). silent
// keeps local builds quiet when the token isn't set.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
});
