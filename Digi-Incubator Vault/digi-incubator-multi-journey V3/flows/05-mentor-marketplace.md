# Flow 05 — Mentor Marketplace

> How a founder books a mentor session and how the commission flows.


## End-to-end booking flow

```mermaid
sequenceDiagram
    actor R as Riya (Startup · org-001)
    actor D as Deepak (Mentor · user-040)
    participant API as API
    participant DB as Database
    participant PAY as Payment Gateway

    R->>API: GET /mentors?domain=gtm&sector=edtech
    API->>DB: SELECT * FROM mentor_profiles\nWHERE is_visible_to_founders=true\nAND 'gtm' = ANY(domains)
    DB-->>R: Deepak's card (no email shown)

    R->>API: POST /mentor-sessions\n{mentor_user_id: deepak\nslot: Sat 10am · 60 mins}
    API->>PAY: Charge Riya ₹2,500
    PAY-->>API: Payment confirmed

    API->>DB: INSERT mentor_sessions\n(mentor_user_id: uuid-deepak\nfounder_org_id: uuid-org-001\nscheduled_at: Sat 10am\ngross: 2500\nplatform_fee: 375\npayout: 2125\nstatus: confirmed\npayout_status: pending)

    API-->>R: Booking confirmed — Deepak's email now visible
    API-->>D: Session notification — Riya's email now visible

    Note over R,D: Session happens

    R->>API: POST /mentor-sessions/{id}/complete
    API->>DB: UPDATE mentor_sessions SET status=completed
    API->>PAY: Release ₹2,125 to Deepak
    API->>DB: UPDATE mentor_sessions SET payout_status=paid

    R->>API: POST /mentor-reviews\n{session_id, rating: 5, comment: ...}
    API->>DB: INSERT mentor_reviews\n(reviewer_org_id: org-001\nreviewed_user_id: uuid-deepak\nrating: 5)
```



## The commission calculation

```
gross_amount    = session_rate × (duration_mins / 60)
platform_fee    = gross_amount × 0.15   -- 15% commission
mentor_payout   = gross_amount - platform_fee
```

These values are calculated once at booking and stored as fixed integers. They do not change if the rate changes later. This makes refund and dispute logic unambiguous.



## The bridge row

`mentor_sessions` is the only table in Digi Incubator where both tenancy models appear in the same row:

```
mentor_sessions {
  mentor_user_id   → user-040  (user-scoped tenant)
  founder_org_id   → org-001   (org-scoped tenant)
}
```

This is deliberate. The mentor is personal (`user_id`). The startup booking the session is organizational (`org_id`). Neither model can be collapsed into the other here.



## Reviews build the mentor's public reputation

Reviews accumulate on the mentor's profile. They are shown to any founder browsing the Mentor Directory. More sessions → more reviews → higher placement in search results. This is the reputation flywheel for the marketplace.

```mermaid
flowchart LR
    MS[mentor_sessions\nstatus: completed] -->|founder reviews| MR[mentor_reviews\nreviewed_user_id: deepak]
    MR -->|aggregated| MP[mentor_profiles\navg_rating: 4.8\ntotal_sessions: 12]
    MP -->|visible in| DIR[Mentor Directory]
    DIR -->|more bookings| MS
```


*Back to [[index|Index]] · Next: [Security Model](../06-security-model.md)*
