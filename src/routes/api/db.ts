import { createFileRoute } from "@tanstack/react-router";
import { getSessionFromRequest } from "@/lib/auth/session";
import { QueryBuilder, runRpc } from "@/db/builder";
import { createStorageBucket } from "@/db/storage";
import { getSql } from "@/db/pool";

type DbRequest =
  | {
      kind: "query";
      table: string;
      action: "select" | "insert" | "update" | "delete";
      select?: string;
      selectOpts?: { count?: "exact"; head?: boolean };
      returning?: string | null;
      filters?: Array<{ type: string; col: string; value: unknown }>;
      orders?: Array<{ col: string; ascending: boolean }>;
      limit?: number;
      offset?: number;
      preferSingle?: "none" | "maybe" | "single";
      rows?: Record<string, unknown> | Record<string, unknown>[];
      patch?: Record<string, unknown>;
      upsertOnConflict?: string;
    }
  | { kind: "rpc"; fn: string; args?: Record<string, unknown> }
  | {
      kind: "storage";
      op: "upload" | "download" | "remove";
      bucket: string;
      path?: string;
      paths?: string[];
      bodyBase64?: string;
      contentType?: string;
    };

export const Route = createFileRoute("/api/db")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await getSessionFromRequest();
        if (!session) {
          return new Response(JSON.stringify({ error: { message: "Unauthorized" } }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        const body = (await request.json()) as DbRequest;

        try {
          if (body.kind === "rpc") {
            if (body.fn === "set_current_workspace") {
              const workspaceId = body.args?._workspace_id as string;
              const sql = getSql();
              const mem = await sql`
                SELECT w.organization_id
                FROM workspace_members wm
                JOIN workspaces w ON w.id = wm.workspace_id
                JOIN organization_members om
                  ON om.organization_id = w.organization_id AND om.user_id = ${session.user.id}
                WHERE wm.workspace_id = ${workspaceId} AND wm.user_id = ${session.user.id}
                LIMIT 1
              `;
              if (!mem.length) {
                return Response.json({ data: null, error: { message: "Not a workspace member" } });
              }
              await sql`
                UPDATE profiles
                SET current_workspace_id = ${workspaceId},
                    current_organization_id = ${mem[0].organization_id}
                WHERE id = ${session.user.id}
              `;
              return Response.json({ data: null, error: null });
            }
            if (body.fn === "log_audit_event") {
              const sql = getSql();
              const args = body.args ?? {};
              await sql`
                INSERT INTO audit_logs (workspace_id, actor_id, actor_name, action, entity_type, entity_id, entity_label, details)
                VALUES (
                  ${args._workspace_id as string},
                  ${session.user.id},
                  ${session.user.user_metadata.full_name ?? session.user.email},
                  ${args._action as string},
                  ${args._entity_type as string},
                  ${args._entity_id as string},
                  ${args._entity_label as string},
                  ${sql.json((args._details as object) ?? {})}
                )
              `;
              return Response.json({ data: null, error: null });
            }
            const result = await runRpc(body.fn, body.args ?? {});
            return Response.json(result);
          }

          if (body.kind === "storage") {
            const bucket = createStorageBucket(body.bucket);
            if (body.op === "upload") {
              const bytes = Buffer.from(body.bodyBase64 ?? "", "base64");
              const result = await bucket.upload(body.path!, bytes, { upsert: true });
              return Response.json(result);
            }
            if (body.op === "download") {
              const result = await bucket.download(body.path!);
              if (result.error || !result.data) return Response.json(result);
              const ab = await result.data.arrayBuffer();
              return Response.json({
                data: { base64: Buffer.from(ab).toString("base64") },
                error: null,
              });
            }
            if (body.op === "remove") {
              return Response.json(await bucket.remove(body.paths ?? []));
            }
          }

          if (body.kind === "query") {
            const qb = new QueryBuilder(body.table);
            if (body.action === "select") qb.select(body.select ?? "*", body.selectOpts);
            if (body.action === "insert") {
              if (body.upsertOnConflict) qb.upsert(body.rows!, { onConflict: body.upsertOnConflict });
              else qb.insert(body.rows!);
            }
            if (body.action === "update") qb.update(body.patch ?? {});
            if (body.action === "delete") qb.delete();
            if (body.returning) qb.select(body.returning);

            const filters = [...(body.filters ?? [])];

            if (body.table === "user_roles" && body.action !== "select") {
              const sql = getSql();
              const admin = await sql`
                SELECT 1 FROM user_roles
                WHERE user_id = ${session.user.id} AND role = 'admin'::app_role
                LIMIT 1
              `;
              if (!admin.length) {
                return Response.json({ data: null, error: { message: "Platform admin only" } }, { status: 403 });
              }
            }

            if (body.table === "profiles" && (body.action === "update" || body.action === "delete")) {
              const self = filters.some((f) => f.col === "id" && f.value === session.user.id);
              if (!self) filters.push({ type: "eq", col: "id", value: session.user.id });
            }

            // Soft workspace isolation: for workspace-scoped tables, require membership
            // and inject workspace_id when the client omitted it.
            const WORKSPACE_TABLES = new Set([
              "runs",
              "run_documents",
              "run_packs",
              "run_clause_pairs",
              "findings",
              "agent_events",
              "audit_checklist_items",
              "doc_chunks",
              "report_templates",
              "decisions",
              "negotiation_items",
              "error_logs",
              "analysis_schedules",
              "prompt_versions",
              "llm_usage",
              "audit_logs",
              "notifications",
            ]);
            if (WORKSPACE_TABLES.has(body.table)) {
              const sql = getSql();
              const profiles = await sql`
                SELECT current_workspace_id, current_organization_id
                FROM profiles WHERE id = ${session.user.id} LIMIT 1
              `;
              const wsId = profiles[0]?.current_workspace_id as string | undefined;
              const orgId = profiles[0]?.current_organization_id as string | undefined;
              if (wsId) {
                // Tenant isolation: workspace membership AND org membership required
                const mem = await sql`
                  SELECT w.organization_id
                  FROM workspace_members wm
                  JOIN workspaces w ON w.id = wm.workspace_id
                  JOIN organization_members om
                    ON om.organization_id = w.organization_id AND om.user_id = ${session.user.id}
                  WHERE wm.workspace_id = ${wsId} AND wm.user_id = ${session.user.id}
                  LIMIT 1
                `;
                if (!mem.length) {
                  return Response.json({ data: null, error: { message: "Not a workspace member" } }, { status: 403 });
                }
                // Prevent cross-org context drift
                if (orgId && mem[0].organization_id && orgId !== mem[0].organization_id) {
                  return Response.json(
                    { data: null, error: { message: "Workspace/organization context mismatch" } },
                    { status: 403 },
                  );
                }
                const hasWsFilter = filters.some((f) => f.col === "workspace_id");
                // report_templates / error_logs may include global (null) rows via .or()
                if (!hasWsFilter && body.table !== "report_templates" && body.table !== "error_logs") {
                  filters.push({ type: "eq", col: "workspace_id", value: wsId });
                }
                if (body.action === "insert") {
                  const rows = Array.isArray(body.rows) ? body.rows : body.rows ? [body.rows] : [];
                  for (const row of rows) {
                    if (row && row.workspace_id == null && body.table !== "report_templates") {
                      (row as any).workspace_id = wsId;
                    }
                  }
                }
              }
            }

            // Org-scoped tables: only members of current organization
            const ORG_TABLES = new Set([
              "organizations",
              "organization_members",
              "organization_invites",
            ]);
            if (ORG_TABLES.has(body.table) && body.table !== "organizations") {
              const sql = getSql();
              const profiles = await sql`
                SELECT current_organization_id FROM profiles WHERE id = ${session.user.id} LIMIT 1
              `;
              const orgId = profiles[0]?.current_organization_id as string | undefined;
              if (orgId) {
                const mem = await sql`
                  SELECT 1 FROM organization_members
                  WHERE organization_id = ${orgId} AND user_id = ${session.user.id}
                  LIMIT 1
                `;
                if (!mem.length) {
                  return Response.json({ data: null, error: { message: "Not an organization member" } }, { status: 403 });
                }
                const hasOrgFilter = filters.some((f) => f.col === "organization_id");
                if (!hasOrgFilter) {
                  filters.push({ type: "eq", col: "organization_id", value: orgId });
                }
              }
            }

            for (const f of filters) {
              const fn = (qb as any)[f.type];
              if (typeof fn === "function") fn.call(qb, f.col, f.value);
            }
            for (const o of body.orders ?? []) qb.order(o.col, { ascending: o.ascending });
            if (body.limit != null) qb.limit(body.limit);
            if (body.offset != null) {
              (qb as any).offsetN = body.offset;
            }
            if (body.preferSingle === "maybe") qb.maybeSingle();
            if (body.preferSingle === "single") qb.single();

            const result = await qb.execute();
            return Response.json(result);
          }

          return Response.json({ error: { message: "Unknown request" } }, { status: 400 });
        } catch (err: any) {
          return Response.json(
            { data: null, error: { message: String(err?.message ?? err) } },
            { status: 500 },
          );
        }
      },
    },
  },
});
