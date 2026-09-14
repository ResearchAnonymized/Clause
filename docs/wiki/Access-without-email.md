# Ticket: Access without email (request → approve → join)

**Status:** Implemented (Door 1) — public request, Admin → Requests, copy join link. Door 2 public “ask to join” is still later.  
**Depends on:** [Professional user management (Phase 1)](./Professional-user-management.md)  
**Not in this ticket:** SMTP, Brevo, MFA, SSO

Counterpart stays **invite-only**. Nobody gets a workspace because they filled a form. GPT-Lab (or the org owner) says yes, then the person joins with a **link** the same way they already can today.

---

## Why this instead of SMTP

Sending mail needs a mail vendor, DNS, and a `noreply@` identity. We do not have that yet. Finnish lawyers also often prefer a link in Teams, a university mailbox they already use, or a conversation with GPT-Lab — not a new `noreply` address.

So the product must work when **no email leaves the server**.

SMTP can be plugged in later. The join path does not change.

---

## The rule

```
Request  →  human approval  →  join link  →  create account or sign in  →  work
```

A request is **not** access. Approval does **not** open documents. Only after they open the link and sign in with the approved work email do they become a member.

GPT-Lab still never sees customer contracts in the normal UI.

---

## Two doors (keep them separate)

### Door 1 — New organization (GPT-Lab desk)

Who: a law firm, faculty, or procurement office that is **not** on the instance yet.

1. Responsible person opens **Request access** on the public site (or GPT-Lab creates the org themselves, as now).
2. They give: organization name, their work email, their name, one sentence on why (optional).
3. Request sits in **Admin → Requests** as `pending`. No org, no user, no workspace is created.
4. GPT-Lab checks they know this organization (phone, existing relationship, university directory).
5. **Approve** → system creates the org + owner invite (same as today’s “New organization”).
6. Screen shows the **join link**. GPT-Lab pastes it into Teams / their own mail / a meeting chat.
7. Owner opens the link → create account or sign in **with that work email** → Join → People & organization.

**Reject** leaves a short reason for the audit. Nothing is created.

GPT-Lab can still skip the form and use **New organization** when they already know the owner. Same join link at the end.

### Door 2 — Person joining an existing organization (owner desk)

Who: a colleague the owner wants in, or someone who asked the owner.

GPT-Lab does **not** approve everyday colleagues. That is the owner’s job (need-to-know, asianajosalaisuus).

1. Owner: **People → Invite** (already built). Copy the link. Send it however they already talk.
2. Optional later: colleague opens **Ask to join** + types the organization name and their work email. That request goes to the **org owner**, not to GPT-Lab.
3. Owner approves → same invite link, same workspaces they pick.
4. Colleague opens the link → sign up / sign in → Join.

**Out of the first build of Door 2:** public “ask to join” by org name (easy to fish for tenant names). First build is **owner-created copy-link only**. Add “ask to join” only if owners ask for it.

---

## What the person sees (easy)

Public, no login:

- Landing: **Request access** (Door 1) and **Sign in**.
- Request form: organization name, work email, full name, optional note. No personal identity number. No document upload.
- After submit: “GPT-Lab will review this. If approved, you will receive a join link from them.” We do **not** promise email from Counterpart.

Join (already exists, keep it):

- `/invite/accept?token=…`
- “Create account or sign in with *this* email”
- Then **Join {organization}**

Sign-in without a link stays invite-only. A pending request is not a login.

---

## What GPT-Lab sees (easy)

**Admin → Requests** (new list above Organizations):

| Column | Content |
|---|---|
| Organization | Name they typed |
| Contact | Work email + name |
| Note | Optional sentence |
| Requested | Time |
| Actions | Approve / Reject |

Approve asks once: first workspace name (default `General`). Then: **copy join link**.

The page still lists no run titles, files, or findings.

---

## Security (Finnish / EU alignment)

| Risk | What we do |
|---|---|
| Form creates a fake tenant | Request creates **only** a `access_requests` row. Org exists after Approve. |
| Anyone becomes a member | Join still requires the token **and** the invited email. |
| GPT-Lab reads contracts | Unchanged: platform UI has no documents. |
| Spam / bots | Rate limit (e.g. 5 requests / hour / IP). Same email + org name cannot stack pending rows. |
| Tenant name fishing | Door 2 “ask to join” is **not** in the first build. Door 1 does not list existing orgs. |
| Stale links | Invite still expires in 14 days. Owner / GPT-Lab can mint a new one. |
| Accountability | Audit: `access_requested`, `access_approved`, `access_rejected`, then existing invite events. |
| Data minimisation | Store only org name, work email, display name, note, IP (for abuse), timestamps. |
| Password reset without SMTP | Keep “copy link” for reset too, or GPT-Lab sets a one-time join/reset link from Admin. Do not pretend reset mail works. |

---

## What we keep from Phase 1

- GPT-Lab **New organization** + copyable owner link
- Owner **Invite person** + copyable link + workspace picker
- Viewer cannot change a review
- No self-serve “Create organization”

## What we do **not** do now

- SMTP / Brevo / DNS mail records
- Auto-email on approve (code may log the link; UI must show it)
- Public directory of organizations
- GPT-Lab approving individual reviewers inside a customer org
- Uploading a contract as part of the request

---

## Built (Door 1)

1. Public **Request access** (`/request`) + `access_requests` table + 5/hour/IP rate limit + audit.
2. **Admin → Requests** approve / reject. Approve calls `provisionOrganizationForOwnerInvite` and shows the join link (no email).
3. Landing CTA + FI/SV/EN. Sign-in copy: you need a join link from GPT-Lab or your organization contact.
4. Password reset: if SMTP is off, the form says so — no fake “we emailed you”.
5. Tests: request does not create an org; approve creates org and owner invite; reject does not; wrong email cannot accept.

Door 2 public “ask to join” is a later ticket.
