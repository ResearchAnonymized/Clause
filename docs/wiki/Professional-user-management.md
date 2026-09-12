# Ticket: Professional user management (Phase 1)

**Status:** Ready to implement  
**Product:** Counterpart (GPT-Lab instance)  
**Related code:** `src/lib/organizations.*`, `src/lib/platform-admin.functions.ts`, `src/lib/auth/session.ts`, `src/routes/_authenticated/admin.tsx`, `src/routes/_authenticated/settings/organization.tsx`, `src/routes/api/auth.ts`, `db/schema.sql`, `db/migrate-organizations.sql`, `db/migrate-saas-identity.sql`

Two non-negotiable constraints for every screen and API in this ticket:

1. **Easy to use** — a GPT-Lab operator and a Finnish lawyer/procurement officer can finish the job without reading this document.
2. **Secure and aligned with Finnish / EU law** — need-to-know access, no silent operator reading of client files, auditable invites and access, EU tenancy already on Helsinki hosting.

This ticket is **Phase 1 only**. SSO, SCIM, MFA, seats, and billing are out of scope.

---

## 1. Why this ticket exists

Counterpart already has users, organizations, workspaces, and email invites. That is enough for a private demo. It is **not** yet the operating model GPT-Lab needs:

> GPT-Lab owns the product. GPT-Lab creates an organization for each customer. The responsible person in that organization adds their people. People then work in workspaces. GPT-Lab does not sit inside the customer’s contracts.

Today the gaps that break that story:

| Today | Problem |
|---|---|
| Any signed-in user can create an organization | Customers can spawn tenants; GPT-Lab is not the operator of tenancy |
| First signup = platform admin, no “create org for customer” console | Onboarding a law firm / faculty is a hallway process |
| Platform roles `reviewer` / `viewer` do nothing | Confusing badges next to real org/workspace roles |
| Invite lands on the **oldest** workspace only | New colleague may not see the workspace they were hired to use |
| Workspace `viewer` is mostly UI | A “reader” can still start, remap, or sign an analysis on the server |
| No membership audit a lawyer can show | Hard to answer “who was given access, when, by whom?” |

---

## 2. Operating model (the product story)

```
GPT-Lab (instance operator)
  └── Organization  (customer: law firm, faculty, procurement office)
        └── Responsible person  (org owner — named contact)
              ├── Org admins     (may invite and create workspaces)
              ├── Workspaces     (a team or a matter area)
              └── People
                    ├── Reviewer  — does the analysis work
                    └── Viewer    — reads reports only
```

Three stakeholder families. Do **not** show three overlapping role systems in the UI.

| Stakeholder | Product name in UI | Job |
|---|---|---|
| GPT-Lab staff | **Platform admin** | Run the instance. Create organizations. Deactivate compromised logins. Never browse customer documents in the normal UI. |
| Responsible person | **Organization owner** | Named customer contact. Owns people and workspaces. Appoints org admins. Cannot create other organizations. |
| Deputy | **Organization admin** | Invite / remove people, create workspaces. Cannot transfer ownership. |
| Working lawyer / officer | **Reviewer** | Upload packs, run analysis, map, comment, sign. Cannot invite the whole org. |
| Manager / counsel / auditor | **Viewer** | Read and export reports they are allowed to see. Cannot start, remap, or sign. |

**Rule:** GPT-Lab creates the organization and the first owner. After that, the owner runs the people. GPT-Lab only steps back in for lock-out, abuse, or off-boarding the whole tenant.

---

## 3. Design principles

### Easy to use

- One verb per job. GPT-Lab: **New organization**. Owner: **Invite person**.
- Invite form is four fields: email, role (Reviewer default), workspace(s), optional note.
- Hide platform `reviewer` / `viewer`. Platform admin is a staff flag, not a daily badge.
- Finnish, Swedish, and English copy for every new string (`src/locales/fi.ts`, `sv.ts`, `en.ts`).
- Defaults that match a small Finnish team: one workspace, invite as Reviewer, 14-day invite.
- Empty states say what to do next (“Invite the colleague who will review the next pack”).
- No settings page should mention `app_role`, `organization_role`, or SQL enums.

### Secure and aligned with Finnish lawyers

This is product/security alignment, not legal advice. Build so a Finnish lawyer can defend the access model.

| Requirement | Why it matters | What we implement |
|---|---|---|
| Need-to-know | Client files; asianajosalaisuus (advocate professional secrecy) | Viewer cannot mutate runs. Reviewer cannot invite. Org admin cannot see other orgs. |
| No silent operator access | GPT-Lab is **processor**; the customer organization is **controller** of uploaded contracts | Platform admin UI lists orgs and users, not documents, findings, or report text |
| Tenant isolation | GDPR Art. 5 / 32; Finnish Data Protection Act 1050/2018 | Keep existing org/workspace checks; close `/api/db` gaps for org lists and criteria |
| Purpose limitation | Analysis of *this* workspace’s packs only | Runs stay workspace-scoped; invites must name workspace(s) |
| Accountability | “Who got access?” | Append-only membership audit: invite, accept, role change, remove, deactivate |
| Data minimisation | Do not collect extra identity fields | Invite = work email + role + workspace. No personal ID numbers. |
| Lawful access to the login | Invite-only instance; email must match the invite | Keep `AUTH_SIGNUP_MODE=invite-only` in production |
| Integrity of the account | Stolen or leftover accounts | Org remove + platform deactivate; sessions destroyed on deactivate |
| Transparency | Users know who operates the instance | Existing legal pages; operator name/email from env |
| EU residency | Public-sector and law-firm expectation | Do not move storage or DB out of the EU instance (Helsinki today) |
| Erasure path | GDPR Art. 17 | Removing a member revokes workspace access immediately. Full account deletion stays a logged request to GPT-Lab (already exists) — do not silently wipe another user’s audit trail from an org admin click |

**Explicitly out of Phase 1:** SSO, MFA, SCIM, break-glass “view this run as support”, automated GDPR wipe of all documents.

If a GPT-Lab person needs to see a customer file, that is a **later, logged, time-boxed support grant** — not part of this ticket. Until then the answer is: they cannot.

---

## 4. Who does what (access matrix)

Server must enforce every cell. UI hiding is not enough.

| Action | GPT-Lab (platform admin) | Org owner | Org admin | Reviewer | Viewer |
|---|---|---|---|---|---|
| Create organization + first owner | **Yes** | No | No | No | No |
| Rename organization | No | Yes | Yes | No | No |
| Transfer org ownership | No | Yes | No | No | No |
| Invite / revoke / remove people | Exception: deactivate login | Yes | Yes | No | No |
| Create workspace | No | Yes | Yes | No | No |
| Change workspace LLM / prompts / pipeline | Instance defaults only | If also workspace admin | If also workspace admin | No | No |
| Upload packs, start / re-run analysis | No | If they are a reviewer in that workspace | Same | **Yes** | No |
| Override mapping, sign review, reopen | No | If reviewer+ in that workspace | Same | **Yes** | No |
| Read report / export PDF or CSV | No | Yes | Yes | Yes | **Yes** |
| Create public report share | No | Yes | Yes | Yes | No |
| Switch org / workspace they belong to | n/a | Yes | Yes | Yes | Yes |
| See another organization’s data | **No** (not even as platform admin in Phase 1) | No | No | No | No |
| Deactivate / reactivate a login | **Yes** | No | No | No | No |

**Invite roles the owner may grant:** `admin` (org admin), `member` mapped in the UI as **Reviewer** or **Viewer**. Do not invite as `owner`.

**Workspace role mapping on invite (keep it simple):**

| UI choice | `organization_role` | `workspace_role` on selected workspaces |
|---|---|---|
| Organization admin | `admin` | `admin` |
| Reviewer (default) | `member` | `reviewer` |
| Viewer | `member` | `viewer` |

Org `owner` is only assigned at provision time (or by ownership transfer).

---

## 5. User journeys (this is the UX)

### 5.1 GPT-Lab onboards a customer (happy path)

1. Platform admin opens **Admin → Organizations** (new section next to today’s user list).
2. Clicks **New organization**.
3. Fills: organization name, owner work email, optional first workspace name (default: `General`).
4. Submits. System creates the org, a workspace, and an **owner invite** (14 days).
5. Screen shows: “Invite sent to *name@firm.fi*” plus a copyable link if mail is not configured.
6. Owner opens the link, sets a password, lands in that organization. They cannot create another org.

**Ease:** three fields, one button. No “personal vs company” puzzle for GPT-Lab.

### 5.2 Owner adds a colleague

1. **Settings → People** (today: Organization settings — retitle so lawyers find it).
2. **Invite person:** work email, role (Reviewer default), which workspace(s) (current workspace pre-checked).
3. Colleague accepts. They see only those workspaces.
4. Owner can later add them to another workspace without a new email (Phase 1: “Add to workspace” on the member row is enough).

### 5.3 Viewer opens a report

Viewer can open dashboard, run list, and report. Start analysis, mapping override, and Sign are hidden **and** rejected by the server with a plain message: “Viewers can read this review but cannot change it.”

### 5.4 Someone leaves

- Owner/admin **Remove from organization** → memberships and workspace access gone; sessions stay until password change unless GPT-Lab deactivates.
- If the login must die (lost laptop, former employee): GPT-Lab **Deactivate**. All sessions destroyed (already implemented).

---

## 6. What to change in the product

### 6.1 Stop self-serve organization create

- Remove / hide “Create organization” from Organization settings for everyone except platform admin.
- `createOrganization` server function: **platform admin only**, or replace it with `provisionOrganization` below.
- Signup without an invite still allowed **only** when the instance is empty (first GPT-Lab operator). After that, production stays invite-only.

### 6.2 Platform: provision organization

New server function, e.g. `provisionOrganizationForOwner`:

- Input: `{ name, ownerEmail, workspaceName? }`
- Auth: `requirePlatformAdmin`
- Creates `organizations` (`kind = company`), default workspace, owner invite (`role` conceptually owner-on-accept)
- Today `createOrganizationInvite` refuses `role: owner`. Extend accept/provision so the **first** member of a GPT-Lab-created org becomes `owner`, or allow a single use “owner invite” created only by platform admin.
- Does **not** put GPT-Lab staff into the customer org.

Admin UI additions:

- Table of organizations: name, owner email, member count, created at. **No document names.**
- Button: New organization.
- Keep existing user table: deactivate, grant/revoke **platform admin** only. Remove the platform Reviewer/Viewer dropdown.

### 6.3 Invites name workspaces

- Invite payload: `workspaceIds: uuid[]` (min 1). Default = current workspace.
- On accept: add `organization_members` + `workspace_members` for **those** workspaces only.
- Creating a **new** workspace: add org owners/admins automatically; do **not** auto-add every member (that over-shares client matters).
- Member row: “Workspaces” + add/remove (org owner/admin only).

### 6.4 Enforce reviewer vs viewer on work

Server-side, workspace-scoped, for at least:

- create / enqueue run
- re-analyse
- mapping override
- sign / reopen

Allow: workspace `owner` | `admin` | `reviewer`  
Deny: workspace `viewer`  

Read paths (report, export, list runs) stay open to any workspace member.

### 6.5 Membership audit

New table (additive migration), e.g. `organization_audit_events`:

- `organization_id`, `actor_user_id`, `actor_email`, `event`, `target_email`, `meta jsonb`, `created_at`
- Events: `org_provisioned`, `invite_sent`, `invite_revoked`, `invite_accepted`, `role_changed`, `member_removed`, `workspace_created`, `workspace_access_changed`

Show last 50 events on the People page to org owner/admin. Platform admin can see the same for support (“when was this person invited?”) **without** seeing run content.

Reuse patterns from `auth_events` (`db/migrate-saas-identity.sql`). Do not log document text or findings.

### 6.6 Copy and IA

- Admin subtitle: this page is for **GPT-Lab operators**, not for inviting a colleague.
- Organization settings title → **People & organization**.
- Role labels in FI/SV/EN: *Katselija / Viewer / Visare*, *Tarkastaja / Reviewer / Granskare*, *Organisaation ylläpitäjä / Organization admin*.
- Invite-only empty signup: “Ask your organization contact for an invite” — not “create an account”.

---

## 7. Implementation checklist

Work in this order so the instance never goes “open signup” and never leaks documents to platform admin.

1. **Migration** — audit table; any invite/workspace columns needed (`workspace_ids` on invite can be `jsonb` or a join table `organization_invite_workspaces`).
2. **Permissions helpers** — one module: `canMutateRun(workspaceRole)`, `canManageOrg`, `isPlatformAdmin`. Use it in server functions, not only in React.
3. **Lock `createOrganization`** to platform admin; add `provisionOrganizationForOwner` + owner-on-accept.
4. **Invite + workspace membership** — selected workspaces; stop “add everyone to every new workspace”; add “add to workspace”.
5. **Deny viewer mutations** on run/sign/mapping/reopen.
6. **Admin Organizations UI** + slim platform user UI.
7. **People page** — invite fields, workspace picker, audit list, hide self-serve create org.
8. **i18n** — en / fi / sv.
9. **Tests** — see §8.
10. **Do not** copy laptop `.env` to production; do not change `AUTH_SIGNUP_MODE` on the live instance.

---

## 8. Tests (must stay green)

| Test | What it proves |
|---|---|
| Unit: role helpers | Viewer cannot mutate; reviewer can; org member cannot invite |
| Integration (`pnpm test:db`) | User in org A cannot read org B; provisioned owner is only owner; invite without workspace fails; viewer enqueue/sign rejected |
| Existing tenant isolation tests | Still pass |
| Playwright smoke | Landing, `/auth` invite-only message, admin org form **not** required in CI (no platform user in e2e) |

Add cases next to `src/lib/organizations.test.ts` and `src/lib/organizations.integration.test.ts`.

---

## 9. Acceptance criteria

- [ ] A platform admin can create an organization by name + owner email and get a copyable invite link.
- [ ] A non-admin user cannot create an organization (UI gone, API 403).
- [ ] Owner invite accept makes that user org `owner` and workspace `owner` of the first workspace.
- [ ] Owner invites a Reviewer to workspace W only; that user does not see workspace V.
- [ ] Viewer can open a report and cannot start, remap, or sign (API error, not only hidden button).
- [ ] New workspace does not auto-add every org member.
- [ ] People page shows invite / role / remove audit events.
- [ ] Platform admin screens never list run titles, document names, or finding text.
- [ ] Production remains invite-only. First-empty-instance bootstrap still works for a new GPT-Lab install.
- [ ] FI / SV / EN strings present. No raw enum names in the UI.
- [ ] `pnpm test` and `pnpm test:db` pass. No `.env` committed.

---

## 10. Out of scope (later tickets)

- SSO / SAML / OIDC, MFA, SCIM
- Seat limits and billing
- Time-boxed GPT-Lab support access to a run
- Full GDPR erasure of documents from the org-admin UI
- Postgres RLS (defense in depth; app checks first)
- Email verification (schema already exists — separate ticket)
- Changing Hetzner / OpenShift topology

---

## 11. Rollout

1. Land on `main` behind the same invite-only production policy.
2. Existing orgs stay. Existing members keep their roles.
3. After deploy: GPT-Lab uses **New organization** for the next customer. Do not migrate historical self-created orgs unless a customer asks.
4. Existing “Create organization” button disappears; tell current demo users in one sentence if they used it.
5. Deploy the usual way: tarball + linux/amd64 image, keep server `.env`, CX22 compose, additive migrate. No `compose down -v`.

---

## 12. Open questions (defaults if nobody answers)

| Question | Default for implementation |
|---|---|
| May one person belong to two customer orgs? | Yes, if invited; they switch org. They still cannot create orgs. |
| May the org owner also be a reviewer? | Yes. Owner can do reviewer work in workspaces they belong to. |
| Personal orgs (`kind = personal`)? | Stop creating new ones. Leave old rows alone. |
| Should GPT-Lab staff have an org of their own for internal demos? | Yes — provision “GPT-Lab” like any other customer, with a Lab owner. Do not use platform admin as a workspace role. |

---

## 13. Suggested first files to touch

- `src/lib/platform-admin.functions.ts` — provision org
- `src/lib/organizations.server.ts` / `.functions.ts` — lock create; invite workspaces; audit write
- `src/lib/organizations.ts` — `canMutateRun` / UI role labels
- `src/routes/_authenticated/admin.tsx` — Organizations section
- `src/routes/_authenticated/settings/organization.tsx` — People page
- `src/lib/reopen-run.functions.ts` and run create / sign / mapping functions — viewer deny
- `db/migrate-org-audit.sql` (new, idempotent)
- `src/locales/{en,fi,sv}.ts`
- `src/lib/organizations.test.ts`, `organizations.integration.test.ts`

Do not reintroduce Lovable / Supabase client packages. Auth stays cookie session (`clause_session`). Data stays `/api/db` + `src/db/*`.
