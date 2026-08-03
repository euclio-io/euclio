import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AddClientForm } from "@/app/dashboard/add-client-form";

export default async function NewClientPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

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
        <Link href="/dashboard" style={{ color: "var(--ink-2)", textDecoration: "none" }}>
          Clients
        </Link>
        {" / "}
        New client
      </div>

      <h1
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: "25px",
          fontWeight: 500,
          letterSpacing: "-.005em",
          marginBottom: "6px",
        }}
      >
        Add a client
      </h1>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10.5px",
          color: "var(--ink-2)",
          marginBottom: "28px",
        }}
      >
        Each client gets their own ledger. Add workflows after.
      </p>

      <div
        style={{
          borderTop: "1px solid var(--hair)",
          paddingTop: "24px",
          maxWidth: "480px",
        }}
      >
        <AddClientForm />
      </div>
    </div>
  );
}
