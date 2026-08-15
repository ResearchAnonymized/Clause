import { supabase } from "@/integrations/supabase/client";

/**
 * Fire-and-forget notification to a workspace's Slack or Microsoft Teams
 * incoming webhook. Runs from the browser using `no-cors` so we don't need a
 * server round-trip. Silently no-ops when no webhook is configured.
 */
export async function notifyWorkspaceWebhook(
  workspaceId: string,
  payload: { title: string; body: string; link?: string; severity: "critical" | "warning" | "ok" },
) {
  try {
    const { data: ws } = await supabase
      .from("workspaces")
      .select("slack_webhook_url, name")
      .eq("id", workspaceId)
      .maybeSingle();
    const url = ws?.slack_webhook_url;
    if (!url) return;

    const color = payload.severity === "critical" ? "#dc2626" : payload.severity === "warning" ? "#d97706" : "#16a34a";
    const emoji = payload.severity === "critical" ? "🔴" : payload.severity === "warning" ? "🟠" : "🟢";
    const isTeams = url.includes("office.com") || url.includes("webhook.office");

    const body = isTeams
      ? {
          "@type": "MessageCard",
          "@context": "https://schema.org/extensions",
          themeColor: color.replace("#", ""),
          summary: payload.title,
          title: `${emoji} ${payload.title}`,
          text: payload.body,
          potentialAction: payload.link
            ? [{ "@type": "OpenUri", name: "Open in Clause", targets: [{ os: "default", uri: payload.link }] }]
            : undefined,
        }
      : {
          text: `${emoji} *${payload.title}*\n${payload.body}${payload.link ? `\n<${payload.link}|Open in Clause>` : ""}`,
        };

    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Non-fatal — user sees the in-app bell regardless.
  }
}
