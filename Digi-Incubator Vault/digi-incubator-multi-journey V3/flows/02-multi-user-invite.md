# Flow 02 — Multi-User Invite

> How a second person joins an existing org — existing or new user.



## The two paths through one flow

```mermaid
flowchart TD
    R[Riya sends invite\nto arjun@gmail.com]
    R --> INV[INSERT invites\norg-001 · arjun@gmail.com · admin\ntoken: abc123 · status: pending]
    INV --> EMAIL[Email sent to Arjun]
    EMAIL --> CLICK[Arjun clicks link]
    CLICK --> CHECK{Does arjun@gmail.com\nexist in users?}

    CHECK -->|Yes — existing user| PATH_A[Arjun logs in]
    CHECK -->|No — new user| PATH_B[Arjun sees signup form\ntoken kept in session]

    PATH_A --> REDEEM[POST /invites/redeem token=abc123]
    PATH_B --> SIGNUP[Arjun creates account]
    SIGNUP --> REDEEM

    REDEEM --> TXN[BEGIN TRANSACTION]
    TXN --> M[INSERT memberships\narjun → org-001 · admin]
    TXN --> UPD[UPDATE invites\nstatus = accepted]
    TXN --> COMMIT[COMMIT]

    COMMIT --> DASH[Arjun lands on org-001 dashboard\nSees all existing startup data]
```


## What Arjun sees vs what he owns

Arjun can see everything in org-001 the moment he joins. But ownership of existing data does not change.

| Data | Owner |
|---|---|
| Market research run by Riya 2 weeks ago | org-001 (shared) |
| New market research run by Arjun today | org-001 (shared) |
| `user_id` on each agent_run | Records who triggered it |
| `org_id` on each agent_run | Records who owns it |

Both runs belong to the startup. `user_id` is the audit trail, not the owner.


## Role permissions after joining

Arjun joins as `admin`. There is one action he cannot perform — flipping `is_discoverable`. Only the `owner` can do that.

```mermaid
sequenceDiagram
    participant A as Arjun (admin)
    participant API as API
    participant DB as Database

    A->>API: PATCH /startups/{id} {is_discoverable: true}
    API->>DB: SELECT role FROM memberships\nWHERE user_id=arjun AND org_id=org-001
    DB-->>API: role = admin
    API->>API: Check: is_discoverable update requires owner
    API-->>A: 403 Forbidden — insufficient role
```

*Back to [[index|Index]] · Next: [[03-second-idea|Second Idea]]*
