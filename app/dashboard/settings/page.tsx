import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAccountForCurrentUser } from "@/lib/account";
import { TimezoneForm } from "./timezone-form";

export const metadata = { title: "Settings — Euclio" };

export default async function SettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const account = await getOrCreateAccountForCurrentUser();

  return (
    <div className="page-pad">
      {/* Breadcrumb */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "13px",
          color: "var(--t3)",
          marginBottom: "24px",
        }}
      >
        <Link
          href="/dashboard"
          style={{ color: "var(--t3)", textDecoration: "none" }}
        >
          Dashboard
        </Link>
        <span>/</span>
        <span style={{ color: "var(--t1)" }}>Settings</span>
      </nav>

      <h1
        style={{
          fontSize: "18px",
          fontWeight: 600,
          color: "var(--t1)",
          marginBottom: "24px",
        }}
      >
        Settings
      </h1>

      {/* Timezone card */}
      <div
        style={{
          background: "var(--canvas)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          boxShadow: "var(--sh)",
          padding: "20px 24px",
          maxWidth: "560px",
        }}
      >
        <h2
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--t1)",
            marginBottom: "4px",
          }}
        >
          Account timezone
        </h2>
        <p
          style={{
            fontSize: "13px",
            color: "var(--t3)",
            marginBottom: "20px",
          }}
        >
          All timestamps and canary window calculations use this timezone unless
          a client or workflow sets its own.
        </p>

        <TimezoneForm currentTimezone={account.timezone} />
      </div>
    </div>
  );
}
