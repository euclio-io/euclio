import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getOrCreateAccountForCurrentUser } from "@/lib/account";
import { getBaseUrl } from "@/lib/base-url";
import { AddExpectationForm } from "@/app/dashboard/add-expectation-form";
import { EnableCanaryForm } from "@/app/dashboard/enable-canary-form";
import { SimulateFailureForm } from "@/app/dashboard/simulate-failure-form";
import { SnippetTabs } from "./snippet-tabs";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

/**
 * Workflow setup page — "Add the check-in"
 * Matches euclio-setup-view.html (v6 design system):
 *   breadcrumb / heading / token badge
 *   tabs: n8n | Make | Zapier | Node | Python | curl | Coding agent
 *   left: snippet card (capture-error checkbox + code + copy) + fail card
 *   right: listening card + canary card
 */
export default async function WorkflowSetupPage({
  params,
}: {
  params: Promise<{ id: string; wfId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id: clientId, wfId } = await params;
  const account = await getOrCreateAccountForCurrentUser();

  const workflow = await prisma.workflow.findFirst({
    where: {
      id: wfId,
      client: { id: clientId, accountId: account.id },
      archivedAt: null,
    },
    select: {
      id: true,
      name: true,
      token: true,
      status: true,
      lastPingAt: true,
      expectedIntervalMinutes: true,
      canaryAddress: true,
      client: { select: { id: true, name: true } },
      expectations: {
        where: { active: true },
        select: { id: true, rule: true, windowMins: true },
      },
      incidents: {
        where: { status: "open" },
        take: 1,
        select: { id: true },
      },
    },
  });

  if (!workflow) notFound();

  const baseUrl = await getBaseUrl();
  const pingUrl = `${baseUrl}/api/ping/${workflow.token}`;
  const failUrl = `${baseUrl}/api/ping/${workflow.token}/fail`;

  return (
    <div style={{ padding: "28px 32px 40px", minWidth: 0 }}>
      {/* ── Breadcrumb ── */}
      <div
        style={{
          fontSize: "13px",
          color: "var(--t3)",
          display: "flex",
          gap: "6px",
          alignItems: "center",
        }}
      >
        <Link
          href={`/dashboard/clients/${workflow.client.id}`}
          style={{ color: "var(--t2)", fontWeight: 500, textDecoration: "none" }}
        >
          {workflow.client.name}
        </Link>
        <span>/</span>
        <span style={{ color: "var(--t3)" }}>{workflow.name}</span>
      </div>

      {/* ── Heading ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "14px",
          marginTop: "6px",
          marginBottom: "18px",
        }}
      >
        <span
          style={{ fontSize: "20px", fontWeight: 600, letterSpacing: "-.01em" }}
        >
          Add the check-in
        </span>
        {/* Token badge — mono, quiet style */}
        <span
          style={{
            position: "relative",
            top: "2px",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "12px",
            fontWeight: 500,
            borderRadius: "999px",
            padding: "3px 9px",
            border: "1px solid var(--border)",
            color: "var(--t2)",
            background: "var(--subtle)",
            fontFamily: "var(--mono)",
          }}
        >
          {workflow.token.slice(0, 10)}
        </span>
      </div>

      {/* ── Two-column grid ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.35fr 1fr",
          gap: "14px",
        }}
      >
        {/* ── Left: snippet + fail ── */}
        <div>
          {/* Snippet card with tabs */}
          <SnippetTabs pingUrl={pingUrl} failUrl={failUrl} />

          {/* Report failures explicitly card */}
          <Card style={{ marginTop: "14px" }}>
            <CardHeader title="Report failures explicitly" count="Optional" />
            <div style={{ padding: "14px 16px 16px" }}>
              <div
                style={{
                  fontSize: "13.5px",
                  color: "var(--t2)",
                  lineHeight: "1.6",
                  maxWidth: "56ch",
                }}
              >
                A failure ping opens the incident immediately, no waiting for
                silence. Add to your catch block or platform error route:
              </div>
              <div
                style={{
                  marginTop: "10px",
                  fontFamily: "var(--mono)",
                  fontSize: "12.5px",
                  background: "var(--subtle)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  display: "inline-block",
                  color: "var(--t1)",
                }}
              >
                POST {failUrl}
              </div>
            </div>
          </Card>

          {/* Simulate failure */}
          {workflow.status !== "down" && (
            <div style={{ marginTop: "14px" }}>
              <SimulateFailureForm workflowId={workflow.id} />
            </div>
          )}

          {workflow.incidents[0] && (
            <div style={{ marginTop: "12px" }}>
              <Link
                href={`/dashboard/incidents/${workflow.incidents[0].id}`}
                style={{
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--amber-tx)",
                  textDecoration: "underline",
                  textUnderlineOffset: "3px",
                }}
              >
                View open incident →
              </Link>
            </div>
          )}
        </div>

        {/* ── Right: listening + canary ── */}
        <div>
          {/* Listening card */}
          <Card>
            <CardHeader title="Listening" />
            {workflow.lastPingAt ? (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "9px",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--green-tx)",
                    padding: "15px 16px 0",
                  }}
                >
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "var(--green)",
                      flexShrink: 0,
                    }}
                  />
                  Test ping received ·{" "}
                  {workflow.lastPingAt.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: true,
                  })}
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: "var(--t2)",
                    padding: "8px 16px 15px",
                    lineHeight: "1.8",
                  }}
                >
                  {workflow.name} · marked {workflow.status}
                  <br />
                  Expected every {workflow.expectedIntervalMinutes} min ·{" "}
                  <Link
                    href="#"
                    style={{
                      color: "var(--pine)",
                      fontWeight: 500,
                      textDecoration: "none",
                    }}
                  >
                    Edit
                  </Link>
                </div>
              </>
            ) : (
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--t2)",
                  padding: "14px 16px 16px",
                  lineHeight: "1.7",
                }}
              >
                Waiting for first ping…
                <br />
                <span style={{ fontSize: "12px", color: "var(--t3)" }}>
                  Paste the snippet above and run your workflow once.
                </span>
              </div>
            )}
          </Card>

          {/* Canary card */}
          <Card style={{ marginTop: "14px" }}>
            <CardHeader title="Canary" count="Optional" />
            {workflow.canaryAddress ? (
              <>
                {/* kv rows */}
                {[
                  {
                    k: "Silent recipient",
                    v: workflow.canaryAddress,
                    mono: true,
                  },
                  { k: "Stores", v: "Arrival times only", mono: false },
                ].map(({ k, v, mono }) => (
                  <div
                    key={k}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "180px 1fr",
                      gap: "12px",
                      padding: "11px 16px",
                      borderBottom: "1px solid var(--border)",
                      fontSize: "13.5px",
                      alignItems: "baseline",
                    }}
                  >
                    <span
                      style={{ color: "var(--t2)", fontWeight: 500, fontSize: "13px" }}
                    >
                      {k}
                    </span>
                    <span
                      style={{
                        fontFamily: mono ? "var(--mono)" : undefined,
                        fontSize: mono ? "12px" : "13.5px",
                        color: "var(--t1)",
                        wordBreak: "break-all",
                      }}
                    >
                      {v}
                    </span>
                  </div>
                ))}

                {workflow.expectations.length > 0 ? (
                  workflow.expectations.map((e) => (
                    <div
                      key={e.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "180px 1fr",
                        gap: "12px",
                        padding: "11px 16px",
                        borderBottom: "1px solid var(--border)",
                        fontSize: "13.5px",
                        alignItems: "baseline",
                      }}
                    >
                      <span
                        style={{
                          color: "var(--t2)",
                          fontWeight: 500,
                          fontSize: "13px",
                        }}
                      >
                        Expected
                      </span>
                      <span style={{ fontSize: "13.5px", color: "var(--t1)" }}>
                        {e.rule} · window {e.windowMins} min{" "}
                        <Link
                          href="#"
                          style={{
                            color: "var(--pine)",
                            fontWeight: 500,
                            fontSize: "13px",
                            textDecoration: "none",
                          }}
                        >
                          Edit
                        </Link>
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: "14px 16px" }}>
                    <AddExpectationForm workflowId={workflow.id} />
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: "14px 16px" }}>
                <EnableCanaryForm workflowId={workflow.id} />
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
