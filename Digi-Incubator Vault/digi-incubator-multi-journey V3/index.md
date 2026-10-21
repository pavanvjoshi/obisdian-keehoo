# Digi Incubator — Platform Documentation

## Reference for Engineering, Product & Strategy Teams


## How to read this

| If you are…                                        | Start here                                            |
| -------------------------------------------------- | ----------------------------------------------------- |
| New to the codebase                                | [[01-what-is-multi-tenancy]] → [[02-tenant-model]]    |
| Adding a new persona                               | [[02-tenant-model]] + relevant file in `personas/`    |
| Debugging a data leak                              | [[06-security-model]]                                 |
| Understanding why a decision was made              | [[07-decisions-log]]                                  |
| Migrating from the POC schema                      | [[08-poc-migration]] — read before touching any table |
| Working on billing or feature gating               | [[09-pricing-architecture]]                           |
| Reviewing architecture risks before implementation | [[10-inversion-tenancy]] + [[11-inversion-pricing]]   |


## File map

```
digi-incubator-docs/
│
├── index.md                          ← you are here
│
├── 01-what-is-multi-tenancy.md       ← plain english, the apartment analogy
├── 02-tenant-model.md                ← 3-layer identity model + diagrams
├── 03-core-schema.md                 ← every table, every relationship, full ERD
│
├── personas/
│   ├── 01-founder.md                 ← startup org, AI agents, ideation, pricing
│   ├── 02-investor-vc.md             ← vc firm, deal pipeline, observatory, pricing
│   ├── 03-investor-solo.md           ← solo angel, silent org rule, pricing
│   ├── 04-bank.md                    ← loan pipeline, CGTMSE, enterprise pricing
│   ├── 05-government.md              ← scheme profiles, DPIIT, MoU pricing
│   └── 06-mentor.md                  ← user_id exception, marketplace, commission
│
├── flows/
│   ├── 01-onboarding-ideation.md     ← Riya's full journey, session → org promotion
│   ├── 02-multi-user-invite.md       ← Arjun joins, new vs existing user
│   ├── 03-second-idea.md             ← workspace switching, data isolation
│   ├── 04-two-way-discovery.md       ← observatory + investor directory
│   └── 05-mentor-marketplace.md      ← booking, commission, review flywheel
│
├── 06-security-model.md              ← the one check that rules them all
├── 07-decisions-log.md               ← 10 architecture decisions + reasoning
├── 08-poc-migration.md               ← POC schema → multi-tenant migration plan
├── 09-pricing-architecture.md        ← four revenue streams, all six personas
│
├── 10-inversion-tenancy.md           ← inversion analysis: what could break the design
└── 11-inversion-pricing.md           ← inversion analysis: what could break the pricing
```



## The 30-second summary

Digi Incubator supports six personas. All share the same three core tables.

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

| `org_type`            | Who                               | Tenant key |
| --------------------- | --------------------------------- | ---------- |
| `startup`             | Founders building a company       | `org_id`   |
| `vc_firm`             | Multi-person VC or angel firm     | `org_id`   |
| `individual_investor` | Solo angel investor               | `org_id`   |
| `bank`                | Lending institution               | `org_id`   |
| `govt`                | Government body or scheme manager | `org_id`   |
| *(no org)*            | Mentor — individual expert        | `user_id`  |
| *(no org)*            | Student — read-only learner       | `user_id`  |



## Quick reference — domain tables per persona

| Persona | Profile table | Pipeline / session table |
|---|---|---|
| Founder | `startups` | `planning_data`, `startup_milestones` |
| Investor (any) | `investor_profiles` | `deal_pipeline` |
| Bank | `bank_profiles` | `loan_applications` |
| Government | `scheme_profiles` | `scheme_applications` |
| Mentor | `mentor_profiles` | `mentor_sessions` |
| Student | — | — |

> `planning_data` is the POC name retained in the codebase. It maps to `agent_runs` conceptually — one row per AI panel execution, scoped to `org_id` + `user_id`. See [[08-poc-migration]] for the full mapping.



## Known gaps — tracked from inversion analysis

These are open items from [[10-inversion-tenancy]] and [[11-inversion-pricing]]. Each has a priority level and a fix documented in those files.

### Architecture gaps (P0 — before production data)

| Gap | File | Status |
|---|---|---|
| PostgreSQL Row Level Security not implemented | [[10-inversion-tenancy]] | ❌ Open |
| No soft deletes — `deleted_at` missing on all entity tables | [[10-inversion-tenancy]] | ❌ Open |
| No `agent_version` on `planning_data` — silent JSONB failures | [[10-inversion-tenancy]] | ❌ Open |

### Architecture gaps (P1 — before enterprise onboarding)

| Gap | File | Status |
|---|---|---|
| Three critical composite indexes missing | [[10-inversion-tenancy]] | ❌ Open |
| Observatory is a code whitelist, not a DB view | [[10-inversion-tenancy]] | ❌ Open |
| No audit log table | [[10-inversion-tenancy]] | ❌ Open |
| No Observatory rate limiting | [[10-inversion-tenancy]] | ❌ Open |

### Pricing gaps (before investor fundraising)

| Gap | File | Status |
|---|---|---|
| No CAC model anywhere in docs | [[11-inversion-pricing]] | ❌ Open |
| No churn / LTV by cohort — unit economics unconfirmed | [[11-inversion-pricing]] | ❌ Open |
| No founding member pricing tier for launch phase | [[11-inversion-pricing]] | ❌ Open |



## Standing decisions

| Decision | Status | Reference |
|---|---|---|
| Product is a SaaS tool, not an incubator program | ✅ Confirmed | [[11-inversion-pricing]] |
| Name: Digi Incubator (was FounderOS) | ✅ Confirmed | [[11-inversion-pricing]] |
| Org-as-tenant for all org-based personas | ✅ Confirmed | [[07-decisions-log]] D-01 |
| Row-level isolation (not schema-per-tenant) | ✅ Confirmed | [[07-decisions-log]] D-02 |
| Sequential persona switching | ✅ Confirmed | [[07-decisions-log]] D-03 |
| Mentor uses user_id as tenant | ✅ Confirmed | [[07-decisions-log]] D-05 |
| Observatory opt-in always free for founders | ✅ Confirmed | [[09-pricing-architecture]] PD-02 |



*Last updated: 2026 · Maintained by the Digi Incubator platform team*
