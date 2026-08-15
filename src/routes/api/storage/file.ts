import { createFileRoute } from "@tanstack/react-router";
import { getSessionFromRequest } from "@/lib/auth/session";
import { createStorageBucket } from "@/db/storage";

/**
 * Stream a stored object as binary (not base64 JSON).
 * Avoids socket hang-ups when opening PDFs via /api/db download.
 *
 * GET /api/storage/file?bucket=contracts&path=user/run/file.pdf
 */
export const Route = createFileRoute("/api/storage/file")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSessionFromRequest();
        if (!session) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const url = new URL(request.url);
        const bucket = url.searchParams.get("bucket") || "contracts";
        const objectPath = url.searchParams.get("path") || "";
        if (!objectPath || objectPath.includes("..")) {
          return new Response(JSON.stringify({ error: "Invalid path" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Only allow the signed-in user to read their own objects (path prefix).
        if (!objectPath.startsWith(`${session.user.id}/`)) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          });
        }

        const result = await createStorageBucket(bucket).download(objectPath);
        if (result.error || !result.data) {
          return new Response(
            JSON.stringify({ error: result.error?.message ?? "Not found" }),
            { status: 404, headers: { "Content-Type": "application/json" } },
          );
        }

        const ab = await result.data.arrayBuffer();
        const filename = objectPath.split("/").pop() || "file";
        const contentType =
          result.data.type ||
          guessMime(filename) ||
          "application/octet-stream";

        return new Response(ab, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Content-Length": String(ab.byteLength),
            "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
            "Cache-Control": "private, max-age=60",
          },
        });
      },
    },
  },
});

function guessMime(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".md")) return "text/markdown";
  return null;
}
