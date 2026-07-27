import { clerkMiddleware } from "@clerk/nextjs/server";

// Next 16 renamed `middleware.ts` -> `proxy.ts` (same runtime hook, new filename).
// clerkMiddleware() attaches Clerk's auth context to every matched request so
// `auth()` / `currentUser()` work in Server Components and route handlers.
//
// Deliberately NO route protection here. Per Clerk's current guidance we protect
// "as close to the resource as possible" — i.e. inside app/dashboard/page.tsx via
// `auth()` — not with matchers in middleware. Keeps the auth decision next to the
// thing it guards, and keeps this file a single unconditional line.
export default clerkMiddleware();

export const config = {
  // Run on everything except Next internals and files with an extension,
  // plus always on API/TRPC routes. (Clerk's standard matcher.)
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
