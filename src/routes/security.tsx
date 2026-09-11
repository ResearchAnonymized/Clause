import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { legalContact } from "@/lib/legal-content";
import { PRODUCT_NAME } from "@/config/instance";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: `Security overview — ${PRODUCT_NAME}` },
      { name: "description", content: `Technical and organisational security controls for the ${PRODUCT_NAME} workspace.` },
      { property: "og:title", content: `Security overview — ${PRODUCT_NAME}` },
      { property: "og:description", content: `Security controls for the ${PRODUCT_NAME} workspace.` },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => {
    const contact = legalContact();
    return (
    <LegalPage
      title="Security overview"
      intro={`${PRODUCT_NAME} is operated as a self-hosted stack (Postgres, object storage, and application servers). This page describes the security controls enabled on this instance.`}
    >
      <h2>Access &amp; authentication</h2>
      <ul>
        <li>Email + password sign-in with hashed credentials. New accounts are invite-only after the first operator is created.</li>
        <li>
          Three role layers: <strong>platform</strong> (instance operators), <strong>organization</strong>{" "}
          (owner / org admin / member), and <strong>workspace</strong> (owner / admin / reviewer / viewer).
        </li>
        <li>Server functions re-validate the session on every request; organization and workspace membership are verified before any read or write.</li>
      </ul>

      <h2>Data protection</h2>
      <ul>
        <li>Encryption in transit via TLS on all endpoints.</li>
        <li>Encryption at rest on the managed database and object storage.</li>
        <li>Signed decisions carry a SHA-256 fingerprint of the analysed documents.</li>
        <li>Anyone can verify a report fingerprint on the public <a href="/verify">Verify page</a> without accessing workspace data.</li>
      </ul>

      <h2>AI safety</h2>
      <ul>
        <li>Every finding is grounded to a retrieved evidence chunk; ungrounded findings are demoted.</li>
        <li>Agent output is validated against a JSON schema.</li>
        <li>Model choice, prompts and severity thresholds are configurable per workspace.</li>
      </ul>

      <h2>Operations</h2>
      <ul>
        <li>Public health endpoint at <code>/api/public/health</code>.</li>
        <li>Stuck runs older than 15 minutes are marked failed by a scheduled job.</li>
        <li>Audit log records membership changes, criteria edits, auth events and decisions.</li>
      </ul>

      <h2>Reporting a vulnerability</h2>
      <p>
        Send a description and reproduction steps to{" "}
        {contact.security ? <a href={`mailto:${contact.security}`}>{contact.security}</a> : contact.securityDisplay}.
        Please do not include real contracts. We aim to acknowledge within two business days.
      </p>
    </LegalPage>
    );
  },
});
