import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { legalContact } from "@/lib/legal-content";
import { PRODUCT_NAME } from "@/config/instance";

export const Route = createFileRoute("/dpa")({
  head: () => ({
    meta: [
      { title: `Data Processing — ${PRODUCT_NAME}` },
      { name: "description", content: `Data processing terms and current sub-processors for ${PRODUCT_NAME}.` },
      { property: "og:title", content: `Data Processing — ${PRODUCT_NAME}` },
      { property: "og:description", content: `Data processing terms and sub-processors used by ${PRODUCT_NAME}.` },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => {
    const contact = legalContact();
    return (
    <LegalPage
      title="Data processing"
      intro={`${PRODUCT_NAME} processes uploaded documents on behalf of your organization as data processor. This page summarises the processing terms and lists current sub-processors.`}
    >
      <h2>Subject matter</h2>
      <p>
        Processing of reference packs, response packs and reviewer activity to produce
        requirement-level analyses, negotiation checklists and signed decision records.
      </p>

      <h2>Nature and purpose</h2>
      <ul>
        <li>Text extraction and semantic chunking of uploaded documents.</li>
        <li>Retrieval-augmented analysis by specialist agents (SLA, DPA, InfoSec, Pricing, Notice).</li>
        <li>Storage of findings, reviewer overrides, negotiation items and signed decisions.</li>
      </ul>

      <h2>Categories of data subjects</h2>
      <p>Reviewers, approvers and any individuals named in uploaded documents.</p>

      <h2>Sub-processors</h2>
      <table>
        <thead>
          <tr><th>Provider</th><th>Purpose</th><th>Location</th></tr>
        </thead>
        <tbody>
          <tr><td>Self-hosted PostgreSQL</td><td>Database and sessions</td><td>Customer-controlled</td></tr>
          <tr><td>MinIO / S3-compatible storage</td><td>Document storage</td><td>Customer-controlled</td></tr>
          <tr><td>OpenAI-compatible LLM API</td><td>LLM inference for agent analysis</td><td>Per provider configuration</td></tr>
        </tbody>
      </table>

      <h2>International transfers</h2>
      <p>
        Where a sub-processor operates outside the EEA, transfers rely on Standard Contractual
        Clauses and additional safeguards documented with each provider.
      </p>

      <h2>Security measures</h2>
      <p>See the <a href="/security">Security overview</a>.</p>

      <h2>Data subject requests</h2>
      <p>
        Requests are handled by {contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : contact.emailDisplay}.
        Reviewers can also self-serve data export and deletion from
        <em> Settings → Privacy &amp; Data</em>.
      </p>
    </LegalPage>
    );
  },
});
