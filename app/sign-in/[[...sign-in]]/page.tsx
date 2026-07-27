import { SignIn } from "@clerk/nextjs";

// Catch-all route ([[...sign-in]]) so Clerk can own its own sub-paths (factor-two,
// SSO callback, etc.) under /sign-in. Mounted on our domain per the M0 decision.
export default function SignInPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <SignIn />
    </main>
  );
}
