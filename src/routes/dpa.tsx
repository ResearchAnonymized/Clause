import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { LEGAL_CONTACT } from "@/lib/legal-content";

export const Route = createFileRoute("/dpa")({
  head: () => ({
    meta: [
      { title: "Data Processing — Clause" },
      { name: "description", content: "Data processing terms and current sub-processors for the Clause contract-review service." },
      { property: "og:title", content: "Data Processing — Clause" },
      { property: "og:description", content: "Data processing terms and sub-processors used by Clause." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <LegalPage
      title="Data processing"
      intro="Clause processes uploaded contracts on behalf of 2M-IT as data processor. This page summarises the processing terms and lists current sub-processors."
    >
      <h2>Subject matter</h2>
      <p>
        Processing of supplier contracts, customer templates and reviewer activity to produce
        clause-level analyses, negotiation checklists and signed decision records.
      </p>

      <h2>Nature and purpose</h2>
      <ul>
        <li>Text extraction and semantic chunking of uploaded documents.</li>
        <li>Retrieval-augmented analysis by specialist agents (SLA, DPA, InfoSec, Pricing, Notice).</li>
        <li>Storage of findings, reviewer overrides, negotiation items and signed decisions.</li>
      </ul>

      <h2>Categories of data subjects</h2>
      <p>Reviewers, approvers and any individuals named in uploaded contracts.</p>

      <h2>Sub-processors</h2>
      <table>
        <thead>
          <tr><th>Provider</th><th>Purpose</th><th>Location</th></tr>
        </thead>
        <tbody>
          <tr><td>Self-hosted PostgreSQL</td><td>Database and sessions</td><td>Customer-controlled</td></tr>
          <tr><td>MinIO / S3-compatible storage</td><td>Contract document storage</td><td>Customer-controlled</td></tr>
          <tr><td>OpenAI-compatible LLM API</td><td>LLM inference for agent analysis</td><td>Per provider configuration</td></tr>
          <tr><td>Python analysis worker</td><td>LangGraph orchestration</td><td>Customer-controlled</td></tr>
        </tbody>
      </table>
      <p className="text-xs">
        Workspace admins are notified in-app before a new sub-processor is added.
      </p>

      <h2>International transfers</h2>
      <p>
        Where a sub-processor operates outside the EEA, transfers rely on Standard Contractual
        Clauses and additional safeguards documented with each provider.
      </p>

      <h2>Security measures</h2>
      <p>See the <a href="/security">Security overview</a>.</p>

      <h2>Data subject requests</h2>
      <p>
        Requests are handled by <a href={`mailto:${LEGAL_CONTACT.email}`}>{LEGAL_CONTACT.email}</a>.
        Reviewers can also self-serve data export and deletion from
        <em> Settings → Privacy &amp; Data</em>.
      </p>
    </LegalPage>
  ),
});
