import { SignUp } from "@clerk/nextjs";

// Catch-all route so Clerk owns its sub-paths under /sign-up. Mounted on our
// domain per the M0 decision.
export default function SignUpPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <SignUp />
    </main>
  );
}
