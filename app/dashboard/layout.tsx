import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { prisma } from "@/lib/prisma";
import { getOrCreateAccountForCurrentUser } from "@/lib/account";

/**
 * Dashboard shell — 64px pine rail + content area.
 * Matches the rail spec across all six v6 design files.
 *
 * Rail (top → bottom):
 *   Euclio logomark (links home)
 *   Client monograms (34px circles; active = pine-2 fill; open incident = 7px amber dot)
 *   ── spacer ──
 *   Gear icon (settings placeholder)
 *   User avatar (account initials)
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("https://euclio.io");

  const account = await getOrCreateAccountForCurrentUser();

  const clients = await prisma.client.findMany({
    where: { accountId: account.id, archivedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      workflows: {
        where: { archivedAt: null },
        select: {
          incidents: {
            where: { status: "open" },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });

  const accountInitials = account.name
    .split(/\s+/)
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "64px 1fr",
        minHeight: "100vh",
        background: "var(--page-bg)",
      }}
    >
      {/* ── Rail ── */}
      <aside
        style={{
          background: "var(--pine)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "16px 0 14px",
          gap: "4px",
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
        }}
      >
        {/* Logomark */}
        <Link
          href="/dashboard"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "10px",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 64 64" aria-label="Euclio">
            <g
              fill="none"
              stroke="#F5F6F4"
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
        </Link>

        {/* Client monograms */}
        {clients.map((client) => {
          const hasIncident = client.workflows.some(
            (w) => w.incidents.length > 0,
          );
          const initials = client.name
            .split(/\s+/)
            .map((w: string) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();

          return (
            <Link
              key={client.id}
              href={`/dashboard/clients/${client.id}`}
              title={client.name}
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--rail-muted)",
                position: "relative",
                margin: "3px 0",
                textDecoration: "none",
              }}
            >
              {initials}
              {hasIncident && (
                <span
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    background: "var(--amber)",
                    border: "1.5px solid var(--pine)",
                  }}
                />
              )}
            </Link>
          );
        })}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Gear */}
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--rail-muted)", marginBottom: "12px" }}
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>

        {/* User avatar */}
        <SignOutButton redirectUrl="https://euclio.io">
          <button
            title={`${account.name} — click to sign out`}
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "50%",
              background: "var(--pine-2)",
              color: "var(--rail-text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "10px",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            {accountInitials}
          </button>
        </SignOutButton>
      </aside>

      {/* ── Content ── */}
      <div style={{ minWidth: 0, overflowY: "auto", background: "var(--canvas)" }}>
        {children}
      </div>
    </div>
  );
}
