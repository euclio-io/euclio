import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrCreateAccountForCurrentUser } from "@/lib/account";
import { factsForQuietPeriod } from "@/lib/facts";
import { AllClearComposeForm } from "./all-clear-compose-form";

export default async function AllClearComposePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id: clientId } = await params;
  const account = await getOrCreateAccountForCurrentUser();
  const tz = account.timezone ?? "UTC";

  // Ownership-scoped: client must belong to this account.
  const client = await prisma.client.findFirst({
    where: { id: clientId, accountId: account.id, archivedAt: null },
    select: {
      id: true,
      name: true,
      timezone: true,
      createdAt: true,
    },
  });
  if (!client) notFound();

  // Guard: no open incidents (all-clear is only valid when quiet).
  const openIncidentCount = await prisma.incident.count({
    where: {
      status: "open",
      workflow: { clientId, client: { accountId: account.id } },
    },
  });
  if (openIncidentCount > 0) {
    // Redirect back to ledger — can't compose all-clear with open incidents.
    redirect(`/dashboard/clients/${clientId}`);
  }

  const clientTz = client.timezone ?? tz;

  // Determine quiet period start: last resolved incident, else first ping.
  const lastResolved = await prisma.incident.findFirst({
    where: {
      status: "resolved",
      workflow: { clientId, client: { accountId: account.id } },
    },
    orderBy: { resolvedAt: "desc" },
    select: { resolvedAt: true },
  });

  const firstPing = await prisma.ping.findFirst({
    where: { workflow: { clientId, client: { accountId: account.id } } },
    orderBy: { receivedAt: "asc" },
    select: { receivedAt: true },
  });

  const sinceDate: Date =
    lastResolved?.resolvedAt ?? firstPing?.receivedAt ?? client.createdAt;

  // Count check-ins since sinceDate.
  const checkinCount = await prisma.ping.count({
    where: {
      workflow: { clientId, client: { accountId: account.id } },
      receivedAt: { gte: sinceDate },
    },
  });

  // Count canary receipts verified since sinceDate (matched receipts only).
  const receiptsVerified = await prisma.canaryReceipt.count({
    where: {
      workflow: { clientId, client: { accountId: account.id } },
      receivedAt: { gte: sinceDate },
      expectationId: { not: null },
    },
  });

  const factLines = factsForQuietPeriod({
    sinceDate,
    checkinCount,
    receiptsVerified: receiptsVerified > 0 ? receiptsVerified : undefined,
    timezone: clientTz,
  });
  const slot1Prefill = factLines.join("\n");

  return (
    <div style={{ padding: "30px 44px 0", minWidth: 0 }}>
      {/* Breadcrumb */}
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: "9.5px",
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "var(--t3)",
          marginBottom: "8px",
        }}
      >
        <a href="/dashboard" style={{ color: "var(--t3)", textDecoration: "none" }}>Clients</a>
        {" / "}
        <a href={`/dashboard/clients/${clientId}`} style={{ color: "var(--t3)", textDecoration: "none" }}>{client.name}</a>
        {" / "}
        All-clear
      </div>
      <h1
        style={{
          fontSize: "22px",
          fontWeight: 600,
          letterSpacing: "-.01em",
          marginBottom: "22px",
        }}
      >
        Compose all-clear
      </h1>
      <AllClearComposeForm
        clientId={clientId}
        clientName={client.name}
        slot1Prefill={slot1Prefill}
        coversFrom={sinceDate.toISOString()}
        coversTo={new Date().toISOString()}
      />
    </div>
  );
}
