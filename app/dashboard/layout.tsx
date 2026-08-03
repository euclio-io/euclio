import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { prisma } from "@/lib/prisma";
import { getOrCreateAccountForCurrentUser } from "@/lib/account";

/**
 * Dashboard shell — the 64px dark rail sidebar + content area.
 * Matches euclio-home-view.html / euclio-setup-view.html / euclio-answer-view.html.
 *
 * Rail contents (top → bottom):
 *   Euclio logo mark
 *   Client avatar buttons (initials, amber dot if any workflow is down)
 *   ── spacer ──
 *   Gear (settings placeholder)
 *   User avatar (account initials)
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const account = await getOrCreateAccountForCurrentUser();

  // Fetch clients for the rail avatars — include open incident count so we
  // can show the amber dot on clients with active incidents.
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

  // Account initials for the user avatar (up to 2 chars)
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
        background: "var(--paper)",
      }}
    >
      {/* ── Rail ── */}
      <aside
        style={{
          background: "var(--rail)",
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
        {/* Logo mark */}
        <Link href="/dashboard" style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "10px" }}>
          <svg width="20" height="20" viewBox="0 0 64 64" aria-label="Euclio">
            <g fill="none" stroke="#F6F2E9" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="32" cy="32" r="26.5" />
              <path d="M22 16 V48" />
              <path d="M22 16 H44" />
              <path d="M22 32 H27 L30 24 L33 40 L36 32 H43" />
              <path d="M22 48 H44" />
            </g>
          </svg>
        </Link>

        {/* Client avatars */}
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
                width: "34px",
                height: "34px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                color: "var(--rail-muted)",
                position: "relative",
                margin: "3px 0",
                textDecoration: "none",
                background: "transparent",
                transition: "background 0.15s",
              }}
            >
              {initials}
              {hasIncident && (
                <span
                  style={{
                    position: "absolute",
                    right: "2px",
                    top: "2px",
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: "var(--amber)",
                  }}
                />
              )}
            </Link>
          );
        })}

        {/* Add client button */}
        <Link
          href="/dashboard/clients/new"
          title="Add client"
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-mono)",
            fontSize: "16px",
            color: "var(--rail-muted)",
            textDecoration: "none",
            border: "1px dashed rgba(246,242,233,.2)",
            marginTop: "4px",
          }}
        >
          +
        </Link>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Logout */}
        <SignOutButton redirectUrl="/sign-in">
          <button
            title="Sign out"
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--rail-muted)",
              fontSize: "13px",
              marginBottom: "8px",
            }}
          >
            ↪
          </button>
        </SignOutButton>

        {/* User avatar */}
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            background: "var(--rail-2)",
            color: "var(--rail-text)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-mono)",
            fontSize: "9px",
          }}
          title={account.name}
        >
          {accountInitials}
        </div>
      </aside>

      {/* ── Content ── */}
      <div style={{ minWidth: 0, overflowY: "auto" }}>
        {children}
      </div>
    </div>
  );
}
