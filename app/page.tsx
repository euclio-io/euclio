import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

// Root route: authenticated users go to /dashboard; everyone else goes to the
// marketing site. Euclio has no public landing page inside the app.
export default async function Home() {
  const { userId } = await auth();
  if (userId) {
    redirect("/dashboard");
  } else {
    redirect("/sign-in");
  }
}
