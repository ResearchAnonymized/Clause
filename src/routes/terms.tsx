import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { LEGAL_CONTACT } from "@/lib/legal-content";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of use — Clause" },
      { name: "description", content: "The terms that govern use of the Clause contract-review workspace by 2M-IT reviewers." },
      { property: "og:title", content: "Terms of use — Clause" },
      { property: "og:description", content: "Terms governing use of the Clause workspace." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <LegalPage
      title="Terms of use"
      intro="These terms apply to reviewers who sign in to Clause to analyse supplier contracts on behalf of 2M-IT."
    >
      <h2>Acceptable use</h2>
      <ul>
        <li>Upload only contracts and supporting documents you are authorised to review.</li>
        <li>Do not attempt to bypass access controls, extract other workspaces' data or reverse-engineer the service.</li>
        <li>Use analysis output as decision support — a signed decision requires human review and approval.</li>
      </ul>

      <h2>AI-generated content</h2>
      <p>
        Findings, evidence quotes and recommendations are produced by large-language-model agents.
        They are grounded to source text via retrieval, but may still contain mistakes. Reviewers
        are responsible for validating findings before signing a decision.
      </p>

      <h2>Data ownership</h2>
      <p>
        2M-IT and its workspaces own the contracts they upload and the analyses derived from them.
        Clause processes this content solely to provide the review workspace under the Data
        Processing Agreement.
      </p>

      <h2>Availability</h2>
      <p>
        We operate the service with reasonable care but do not guarantee uninterrupted
        availability. Live status is exposed at <code>/api/public/health</code>.
      </p>

      <h2>Termination</h2>
      <p>
        Reviewers may close their account from <em>Settings → Privacy &amp; Data</em>. 2M-IT may
        suspend accounts that breach these terms. On termination, personal data is deleted
        following the retention schedule in the <a href="/privacy">Privacy notice</a>.
      </p>

      <h2>Governing law &amp; contact</h2>
      <p>
        These terms are governed by the laws of Finland. Questions:
        <a href={`mailto:${LEGAL_CONTACT.email}`}> {LEGAL_CONTACT.email}</a>.
      </p>
    </LegalPage>
  ),
});
