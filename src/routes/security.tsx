import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { LEGAL_CONTACT } from "@/lib/legal-content";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: "Security overview — Clause" },
      { name: "description", content: "Technical and organisational security controls in place for the Clause contract-review workspace." },
      { property: "og:title", content: "Security overview — Clause" },
      { property: "og:description", content: "Security controls for the Clause contract-review workspace." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <LegalPage
      title="Security overview"
      intro="Clause is operated by 2M-IT on a self-hosted stack (Postgres, object storage, and application servers). This page describes the security controls enabled on this instance."
    >
      <h2>Access &amp; authentication</h2>
      <ul>
        <li>Email + password sign-in with hashed credentials managed by the platform auth service.</li>
        <li>
          Three role layers: <strong>platform</strong> (instance operators), <strong>organization</strong>{" "}
          (owner / org admin / member), and <strong>workspace</strong> (owner / admin / reviewer / viewer).
          Organization membership gates tenant data; workspace roles control analysis permissions.
        </li>
        <li>Server functions re-validate the session on every request; organization and workspace membership are verified server-side before any read or write.</li>
      </ul>

      <h2>Data protection</h2>
      <ul>
        <li>Encryption in transit via TLS on all endpoints.</li>
        <li>Encryption at rest on the managed database and object storage.</li>
        <li>Signed decisions carry a SHA-256 fingerprint of the analysed documents and, once sealed, the signer's IP is recorded server-side to prevent client spoofing.</li>
        <li>Anyone can verify a report fingerprint on the public <a href="/verify">Verify page</a> without accessing workspace data.</li>
      </ul>

      <h2>AI safety</h2>
      <ul>
        <li>Every finding is grounded to a retrieved evidence chunk; ungrounded findings are demoted and marked as such.</li>
        <li>Agent output is validated against a strict JSON schema with a second-pass retry at temperature zero.</li>
        <li>Model choice, prompts and severity thresholds are configurable per workspace and stored in the audit log.</li>
      </ul>

      <h2>Operations</h2>
      <ul>
        <li>Public health endpoint at <code>/api/public/health</code> for uptime monitors.</li>
        <li>Stuck runs older than 15 minutes are automatically marked as failed by a scheduled job.</li>
        <li>Audit log records workspace membership changes, criteria edits and decision events.</li>
      </ul>

      <h2>Reporting a vulnerability</h2>
      <p>
        Send a description and reproduction steps to
        <a href={`mailto:${LEGAL_CONTACT.security}`}> {LEGAL_CONTACT.security}</a>. Please do not
        include real supplier contracts in your report. We aim to acknowledge within two business
        days.
      </p>

      <p className="text-xs">
        This page lists controls in place on this instance and is not an ISO/SOC certification.
      </p>
    </LegalPage>
  ),
});
