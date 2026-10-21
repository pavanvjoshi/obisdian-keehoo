# AI Chief of Staff — POC Proposal

## The Idea, in Plain English

A system that quietly reads what's already happening across the company — emails, chats, tickets — and every day tells leadership one thing: **"here's what most needs your attention right now, and here's why."** It doesn't act on its own. It recommends. A human always decides.

## The Problem This Solves

Right now, knowing "is the company drifting off course?" means someone manually piecing together signals from Product, Finance, Operations, and HR — each in a different tool, each moving at its own pace. By the time the pattern is obvious, it's often already expensive. This system's job is to do that piecing-together continuously, and only interrupt leadership when something genuinely matters.

## What "Decision" Means Here

This is the core of the system, so it's worth being precise: **the recommendation isn't "what should Product do" or "what should Finance do" in isolation.** It's a running comparison *across* everything happening in the company, answering one question every day: **"Of everything going on right now, what's most likely to pull us off our stated vision, or hurt revenue, if nobody looks at it today?"**

That means the system has to see a little bit of everything to compare it — not just go deep on one department in isolation.

---

## POC Scope — What We're Actually Building First

To keep this buildable in weeks, not months, we go **deep in one place and shallow everywhere else**, just deep enough to prove the cross-comparison actually works:

| Area | Depth in POC |
|---|---|
| **Product** | Full integration — real data from GoodDay (goodday.work) and Outlook email |
| **Finance / Operations** | Lightweight, mocked or manually-fed signals — just enough that the system has something real to compare Product against |
| **HR** | **Not included** in this phase (see below) |
| **Personas** | CEO / Management view (cross-department), and Product Owner view (their own lane only) |
| **Policy & vision grounding** | Based on the actual policy/vision documents Management owns and provides |
| **Action taken by the system** | None. It recommends; a human approves every time before anything moves |

**Why this shape:** it's the smallest version of the system that still proves the actual point — that it can compare unlike things (a shipping delay vs. a budget signal) and rank them by real company impact, not just summarize one silo.

---

## Non-Negotiable Guardrails

These came out of deliberately stress-testing the idea for how it could go wrong before we build anything. They're not "nice to have" — they're conditions for building this responsibly:

1. **No silent surfacing of sensitive personnel matters.** Since HR is out of scope for this phase, this is naturally satisfied for now — but it's the reason HR waits until we've proven trust with lower-stakes departments first.
2. **Every recommendation shows its sources and its confidence.** Never just "trust me" — always "based on these 3 emails and this ticket, here's my read."
3. **The system reports what it *couldn't* see, too.** If a data source is stale or a connector failed, the briefing says so — it never quietly presents a partial picture as a complete one.
4. **Nothing is sent, changed, or actioned automatically.** Every output is a draft recommendation for a human to approve.
5. **There's a built-in way to disagree.** A department head or the CEO can push back on a recommendation, and that disagreement gets recorded — it doesn't just disappear.
6. **The policy/vision documents it's grounded in are owned and can be changed by Management** — never silently hardcoded or treated as fixed truth.
7. **Cross-department conflicts get surfaced, not resolved for people.** If Product wants to ship and Finance flags budget risk, the system presents the tension — it doesn't quietly pick a winner.

---

## What This POC Deliberately Leaves Out (for now)

- HR data and HR integration entirely
- Teams meeting transcription/ingestion (chat only, if used at all)
- Board-level view or reporting
- Full, deep integration for every department (Finance/Ops stay lightweight/mocked)
- Any autonomous action — sending, updating, or deciding without a human

Calling these out explicitly so scope doesn't quietly creep during the build.

---

## What We Still Need

- The actual policy/vision document(s) from Management, in written form, that recommendations should be checked against
- Confirmation on GoodDay API access (it has a documented REST API v2, so direct integration is feasible — just needs an account/token)
- Sign-off that HR stays excluded for this phase specifically, so it's a documented decision, not an oversight

---

## What Success Looks Like

The CEO opens a daily briefing that names **one clear top-priority item**, pulled from comparing signals across Product and (mocked) Finance/Ops — with a plain-English reason tied to the company's actual stated vision or revenue trajectory, a confidence/source note, and nothing that happens without their sign-off.
