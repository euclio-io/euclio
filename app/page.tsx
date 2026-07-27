import Link from "next/link";

// Minimal M0 landing. The real surface is /dashboard (auth-guarded); this just
// routes the freelancer there. No client-facing content — Euclio is invisible
// to the client by design.
export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Euclio</h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        Heartbeat monitoring for the automations you run for your clients.
      </p>
      <Link
        href="/dashboard"
        className="flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-background transition-colors hover:opacity-90"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
