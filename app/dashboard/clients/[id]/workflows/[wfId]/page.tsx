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

/**
 * Workflow setup page — "Add the check-in"
 * Matches euclio-setup-view.html:
 *   breadcrumb / heading / token
 *   tabs: n8n | Make | Zapier | Node | Python | curl | Coding agent
 *   left: capture-error checkbox + snippet + /fail section
 *   right: listening status + canary config
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

  // Ownership-scoped fetch
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
    <div style={{ padding: "30px 44px 0", minWidth: 0 }}>
      {/* ── Breadcrumb ── */}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "9.5px",
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "var(--ink-2)",
        }}
      >
        <Link
          href="/dashboard"
          style={{ color: "var(--ink-2)", textDecoration: "none" }}
        >
          Clients
        </Link>
        {" / "}
        <Link
          href={`/dashboard/clients/${workflow.client.id}`}
          style={{ color: "var(--ink-2)", textDecoration: "none" }}
        >
          {workflow.client.name}
        </Link>
        {" / "}
        {workflow.name}
      </div>

      {/* ── Heading ── */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "16px",
          marginTop: "8px",
          marginBottom: "22px",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "25px",
            fontWeight: 500,
          }}
        >
          Add the check-in
        </h1>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10.5px",
            color: "var(--ink-2)",
          }}
        >
          {workflow.token.slice(0, 10)} ↗
        </span>
      </div>

      {/* ── Two-column grid ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.35fr 1fr",
          borderTop: "1px solid var(--hair)",
          paddingTop: "8px",
          paddingBottom: "40px",
          gap: "0",
        }}
      >
        {/* ── Left: snippet ── */}
        <div style={{ paddingRight: "40px" }}>
          {/* Snippet tabs + code */}
          <SnippetTabs pingUrl={pingUrl} failUrl={failUrl} />

          {/* /fail section */}
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "8.5px",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: "var(--ink-2)",
              padding: "18px 0 8px",
              borderBottom: "1px solid var(--hair-2)",
            }}
          >
            Optional · report failures explicitly
          </div>
          <div style={{ padding: "14px 0 0" }}>
            <div
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--ink)",
              }}
            >
              In your own error handling
            </div>
            <div
              style={{
                fontSize: "11.5px",
                color: "var(--ink-2)",
                margin: "4px 0 9px",
                lineHeight: "1.55",
                maxWidth: "52ch",
              }}
            >
              A failure ping opens the incident immediately, no waiting for
              silence. Add to your catch block or platform error route:
            </div>
            <code
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10.5px",
                color: "var(--pine)",
                borderBottom: "1px solid var(--hair)",
                paddingBottom: "2px",
              }}
            >
              POST {failUrl}
            </code>
          </div>

          {/* Simulate failure */}
          {workflow.status !== "down" && (
            <div style={{ marginTop: "20px" }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "8.5px",
                  letterSpacing: ".12em",
                  textTransform: "uppercase",
                  color: "var(--ink-2)",
                  paddingBottom: "8px",
                  borderBottom: "1px solid var(--hair-2)",
                  marginBottom: "10px",
                }}
              >
                Test
              </div>
              <SimulateFailureForm workflowId={workflow.id} />
            </div>
          )}

          {workflow.incidents[0] && (
            <div style={{ marginTop: "12px" }}>
              <Link
                href={`/dashboard/incidents/${workflow.incidents[0].id}`}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "var(--amber-deep)",
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
        <div
          style={{
            borderLeft: "1px solid var(--hair-2)",
            paddingLeft: "40px",
          }}
        >
          {/* Listening */}
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "8.5px",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: "var(--ink-2)",
              padding: "18px 0 8px",
              borderBottom: "1px solid var(--hair-2)",
            }}
          >
            Listening
          </div>

          {workflow.lastPingAt ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "9px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "12px",
                  color: "var(--green)",
                  padding: "14px 0 0",
                }}
              >
                <span
                  style={{
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    background: "var(--green)",
                    flexShrink: 0,
                    position: "relative",
                    top: "-1px",
                  }}
                />
                test ping received · {workflow.lastPingAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: "var(--ink-2)",
                  marginTop: "8px",
                  lineHeight: "1.9",
                }}
              >
                {workflow.name} · marked {workflow.status}
                <br />
                expected every {workflow.expectedIntervalMinutes} min
              </div>
            </>
          ) : (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                color: "var(--ink-2)",
                padding: "14px 0 0",
              }}
            >
              Waiting for first ping…
              <br />
              <span style={{ fontSize: "9px" }}>
                Paste the snippet above and run your workflow once.
              </span>
            </div>
          )}

          {/* Canary */}
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "8.5px",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: "var(--ink-2)",
              padding: "26px 0 8px",
              borderBottom: "1px solid var(--hair-2)",
              marginTop: "26px",
            }}
          >
            Canary · optional
          </div>

          {workflow.canaryAddress ? (
            <div style={{ paddingTop: "4px" }}>
              {[
                {
                  k: "Silent recipient address",
                  v: workflow.canaryAddress,
                  mono: true,
                },
                { k: "Stores", v: "arrival times only", mono: false },
              ].map(({ k, v, mono }) => (
                <div
                  key={k}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: "14px",
                    padding: "10px 0",
                    borderBottom: "1px solid var(--hair-2)",
                  }}
                >
                  <span
                    style={{ fontSize: "12.5px", color: "var(--ink-2)", flexShrink: 0 }}
                  >
                    {k}
                  </span>
                  <span
                    style={{
                      fontFamily: mono ? "var(--font-mono)" : undefined,
                      fontSize: "10.5px",
                      color: "var(--ink)",
                      textAlign: "right",
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
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: "14px",
                      padding: "10px 0",
                      borderBottom: "1px solid var(--hair-2)",
                    }}
                  >
                    <span style={{ fontSize: "12.5px", color: "var(--ink-2)" }}>
                      Expected
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "10.5px",
                        color: "var(--ink)",
                      }}
                    >
                      {e.rule} · ±{e.windowMins}m
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ paddingTop: "12px" }}>
                  <AddExpectationForm workflowId={workflow.id} />
                </div>
              )}
            </div>
          ) : (
            <div style={{ paddingTop: "12px" }}>
              <EnableCanaryForm workflowId={workflow.id} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
