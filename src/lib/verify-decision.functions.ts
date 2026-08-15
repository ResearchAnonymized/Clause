import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdminDb } from "@/db/client.server";
import { callerIp, enforceRateLimit } from "./rate-limit.server";

const Input = z.object({ hash: z.string().regex(/^[a-f0-9]{64}$/) });

/**
 * Public verification endpoint.
 * Looks up whether the given SHA-256 fingerprint matches a signed decision.
 */
export const verifyDecisionHash = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    await enforceRateLimit({
      bucket: "verify_decision",
      key: callerIp(),
      limit: 30,
      windowSeconds: 60,
    });

    const db = getAdminDb();
    const { data: rows, error } = await db.rpc("verify_decision_hash", { _hash: data.hash });
    if (error) return { matched: false, decision: null };
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return { matched: false, decision: null };
    return {
      matched: true,
      decision: {
        verdict: row.verdict as string,
        signed_at: (row.signed_at as string) ?? null,
        signer_role: (row.signer_role as string) ?? null,
        signer_name: (row.signer_name as string) ?? null,
      },
    };
  });
