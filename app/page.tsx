import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

// Root route — two intents, two destinations:
//   1. Arriving without a session (trying to enter the app) → /sign-in.
//   2. Signing out (leaving the app) → handled separately by
//      <SignOutButton redirectUrl="https://euclio.io"> in
//      app/dashboard/layout.tsx. That button bypasses this route entirely,
//      so the marketing-site redirect lives there, not here.
export default async function Home() {
  const { userId } = await auth();
  if (userId) {
    redirect("/dashboard");
  } else {
    redirect("/sign-in");
  }
}
