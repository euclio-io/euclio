// Public process-alive check for Railway's healthcheck (railway.json ->
// healthcheckPath). No auth. Deliberately NO DB round-trip: Railway gates deploy
// promotion on this endpoint, and a transient Neon blip shouldn't flap deploys
// for a reason unrelated to the process itself being alive.
//
// force-dynamic so it always executes (never statically cached) and reports the
// current time — a cached "ok" would defeat the point of a liveness probe.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
