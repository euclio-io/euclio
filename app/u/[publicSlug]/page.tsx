import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

// No auth — this page is intentionally public.
// The publicSlug is the access token; it's unguessable (24 random bytes).

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export default async function PublicReceiptPage({
  params,
}: {
  params: Promise<{ publicSlug: string }>;
}) {
  const { publicSlug } = await params;

  const update = await prisma.clientUpdate.findUnique({
    where: { publicSlug },
    select: {
      bodyText: true,
      sentAt: true,
      createdAt: true,
      author: { select: { name: true } },
    },
  });

  if (!update) notFound();

  const displayDate = update.sentAt ?? update.createdAt;
  const authorName = update.author.name ?? "Your freelancer";

  return (
    <main className="min-h-screen bg-paper px-6 py-16 max-w-xl mx-auto">
      {/* Body — plain text, pre-wrap, no Euclio branding */}
      <pre className="font-mono text-sm text-ink/80 whitespace-pre-wrap leading-relaxed mb-12">
        {update.bodyText}
      </pre>

      {/* Footer — minimal */}
      <div className="border-t border-hair pt-6">
        <p className="font-mono text-xs text-ink/40">
          Sent {formatDate(displayDate)} · {authorName}
        </p>
      </div>
    </main>
  );
}
