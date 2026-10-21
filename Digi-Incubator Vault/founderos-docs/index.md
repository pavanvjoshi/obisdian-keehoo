# FounderOS — Multi-Tenancy Architecture
## Reference Documentation for Engineering & Product Teams

> This document set was built from first-principles reasoning across all six FounderOS personas.  
> Every decision here has a "why" — not just a "what".

---

## How to read this

If you are **new to the codebase** → start with `01-what-is-multi-tenancy.md`, then `02-tenant-model.md`.  
If you are **adding a new persona** → read `02-tenant-model.md` + the relevant persona file in `personas/`.  
If you are **debugging a data leak** → jump straight to `06-security-model.md`.  
If you want to understand **why a decision was made** → `07-decisions-log.md` is your reference.

---

## File Map

```
founderos-docs/
│
├── index.md                          ← you are here
│
├── 01-what-is-multi-tenancy.md       ← plain english, no jargon
├── 02-tenant-model.md                ← the 3-layer identity model
├── 03-core-schema.md                 ← every table, every relationship
│
├── personas/
│   ├── 01-founder.md                 ← startup org, AI agents, ideation
│   ├── 02-investor-vc.md             ← vc firm, deal pipeline, observatory
│   ├── 03-investor-solo.md           ← solo angel, the silent org rule
│   ├── 04-bank.md                    ← loan pipeline, CGTMSE filters
│   ├── 05-government.md              ← scheme profiles, DPIIT matching
│   └── 06-mentor.md                  ← the user_id exception, marketplace
│
├── flows/
│   ├── 01-onboarding-ideation.md     ← Riya's full journey, step by step
│   ├── 02-multi-user-invite.md       ← how Arjun joins, new vs existing user
│   ├── 03-second-idea.md             ← workspace switching, data isolation
│   ├── 04-two-way-discovery.md       ← observatory + investor directory
│   └── 05-mentor-marketplace.md      ← booking, commission, reviews
│
├── 06-security-model.md              ← the one check that rules them all
└── 07-decisions-log.md               ← every key decision + the reasoning
```

---

## The 30-second summary

FounderOS supports six personas. All of them share the same three core tables.

| Core table | What it stores |
|---|---|
| `users` | One row per human being on the platform |
| `organizations` | One row per company, firm, bank, or govt body |
| `memberships` | Who belongs to which org, and in what role |

**Five personas** use `org_id` as their data tenant — startup, VC firm, solo angel, bank, government.  
**One persona** uses `user_id` as their tenant — mentor (and student).

The single security rule that protects everything:

> *Does a row exist in `memberships` where `user_id = this person` AND `org_id = this org`?  
> If yes → proceed. If no → 403.*

---

## Quick reference — org_type values

| `org_type` | Who | Tenant key |
|---|---|---|
| `startup` | Founders building a company | `org_id` |
| `vc_firm` | Multi-person VC or angel firm | `org_id` |
| `individual_investor` | Solo angel investor | `org_id` |
| `bank` | Lending institution | `org_id` |
| `govt` | Government body or scheme manager | `org_id` |
| *(no org)* | Mentor — individual expert | `user_id` |
| *(no org)* | Student — read-only learner | `user_id` |

---

## Quick reference — domain tables per persona

| Persona | Profile table | Pipeline / session table |
|---|---|---|
| Founder | `startups` | `agent_runs`, `startup_milestones` |
| Investor (any) | `investor_profiles` | `deal_pipeline` |
| Bank | `bank_profiles` | `loan_applications` |
| Government | `scheme_profiles` | `scheme_applications` |
| Mentor | `mentor_profiles` | `mentor_sessions` |
| Student | — | — |

---

*Last updated: 2026 · Maintained by the FounderOS platform team*
