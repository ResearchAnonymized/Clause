import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { legalContact } from "@/lib/legal-content";
import { PRODUCT_NAME } from "@/config/instance";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: `Privacy notice — ${PRODUCT_NAME}` },
      { name: "description", content: `How ${PRODUCT_NAME} collects, uses and protects personal data during contract review.` },
      { property: "og:title", content: `Privacy notice — ${PRODUCT_NAME}` },
      { property: "og:description", content: `How ${PRODUCT_NAME} handles personal data for contract review.` },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => {
    const contact = legalContact();
    return (
    <LegalPage
      title="Privacy notice"
      intro={`This notice explains what personal data ${PRODUCT_NAME} processes for reviewers and anyone named in uploaded documents.`}
    >
      <h2>Who is the controller</h2>
      <p>
        {contact.orgDisplay} is the data controller for accounts and workspaces on this {PRODUCT_NAME}
        instance. Contact the {contact.role}{contact.email ? <> at <a href={`mailto:${contact.email}`}>{contact.email}</a></> : "."}
      </p>

      <h2>What we process</h2>
      <ul>
        <li><strong>Account data</strong> — email address, display name, workspace membership, role.</li>
        <li><strong>Contract content</strong> — reference and response documents uploaded for analysis, plus parsed text and semantic chunks.</li>
        <li><strong>Review activity</strong> — analysis runs, findings, reviewer notes, checklists, signed decisions and audit-log entries.</li>
        <li><strong>Operational logs</strong> — sign-in events, error traces and health metrics needed to run the service.</li>
      </ul>

      <h2>Legal basis</h2>
      <p>
        We rely on the contract to provide the workspace (Art. 6(1)(b) GDPR), and on legitimate
        interest (Art. 6(1)(f)) to keep the service secure and auditable. Uploaded documents are
        processed on behalf of your organization under a Data Processing Agreement.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Uploads and derived analyses: retained for the workspace's contractual retention period, then deleted on request or on workspace closure.</li>
        <li>Signed decision records and audit logs: retained for 7 years to preserve the integrity of the decision trail.</li>
        <li>Account data: kept while the account is active and deleted within 30 days of a verified deletion request.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        Reviewers can export their workspace data and request account deletion from
        <em> Settings → Privacy &amp; Data</em>. You also have the right to access, rectify,
        restrict, port or object to processing, and to lodge a complaint with a supervisory
        authority. Requests are handled within 30 days.
      </p>

      <h2>Sub-processors</h2>
      <p>
        The current list of sub-processors (hosting, database, AI model providers) is maintained on
        the <a href="/dpa">Data Processing page</a>. We notify workspace admins before adding a
        new sub-processor.
      </p>

      <h2>Security</h2>
      <p>
        See the <a href="/security">Security overview</a> for the technical and organisational
        measures in place on this instance.
      </p>
    </LegalPage>
    );
  },
});
