// "payload size-capped" (CLAUDE.md) enforced against the ACTUAL byte stream,
// not just a (possibly absent or spoofed) Content-Length header — App Router
// route handlers get a bare Fetch Request with no framework-level body-size
// backstop to lean on.

const MAX_PAYLOAD_BYTES = 2048; // "a small non-sensitive metric only"

export class PayloadTooLargeError extends Error {}

export async function readCappedBody(request: Request): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_PAYLOAD_BYTES) {
    throw new PayloadTooLargeError();
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PAYLOAD_BYTES) {
      await reader.cancel();
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
}
