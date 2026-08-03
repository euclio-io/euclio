import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrCreateAccountForCurrentUser } from "@/lib/account";
import { factsForIncident } from "@/lib/facts";
import { ComposeForm } from "./compose-form";

export default async function ComposePage({
  params,
}: {
  params: Promise<{ id: string; incidentId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id: clientId, incidentId } = await params;
  const account = await getOrCreateAccountForCurrentUser();
  const tz = account.timezone ?? "UTC";

  // Ownership-scoped: incident → workflow → client → accountId
  const incident = await prisma.incident.findFirst({
    where: {
      id: incidentId,
      workflow: { client: { id: clientId, accountId: account.id } },
    },
    select: {
      id: true,
      source: true,
      status: true,
      openedAt: true,
      resolvedAt: true,
      workflow: {
        select: {
          name: true,
          client: {
            select: { id: true, name: true, timezone: true },
          },
        },
      },
    },
  });

  if (!incident) notFound();

  const clientTz = incident.workflow.client.timezone ?? tz;
  const workflowName = incident.workflow.name;
  const clientName = incident.workflow.client.name;

  // Pre-fill slot 1 from facts — no errorText, no interpretation.
  const factLines = factsForIncident(
    workflowName,
    incident.source as "heartbeat" | "explicit_fail",
    incident.openedAt,
    incident.resolvedAt ?? null,
    clientTz,
  );
  const slot1Prefill = factLines.join("\n");

  return (
    <div style={{ padding: "30px 44px 0", minWidth: 0 }}>
      {/* Breadcrumb */}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "9.5px",
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "var(--ink-2)",
          marginBottom: "8px",
        }}
      >
        <a href="/dashboard" style={{ color: "var(--ink-2)", textDecoration: "none" }}>Clients</a>
        {" / "}
        <a href={`/dashboard/clients/${clientId}`} style={{ color: "var(--ink-2)", textDecoration: "none" }}>{clientName}</a>
        {" / "}
        Compose
      </div>
      <h1
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: "25px",
          fontWeight: 500,
          letterSpacing: "-.005em",
          marginBottom: "22px",
        }}
      >
        Client note
      </h1>
      <ComposeForm
        clientId={clientId}
        clientName={clientName}
        incidentId={incidentId}
        workflowName={workflowName}
        slot1Prefill={slot1Prefill}
      />
    </div>
  );
}
