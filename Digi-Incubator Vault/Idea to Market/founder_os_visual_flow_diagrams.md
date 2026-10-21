# FounderOS — Visual Flow Diagrams

**Purpose:** Visual, step-by-step flows for the two primary personas (Founder, VC) and their two login impressions (First‑time, Returning). These flows map screens, CTAs, decision nodes, and micro‑interactions so the team has a single visual reference for implementation and QA.

---

## How to use this document
- Each flow is a small, readable diagram followed by a mapping table that lists the screens/components involved and micro‑interaction notes.  
- The flows are *non‑rigid* — they show primary happy paths and high‑priority branches. Use them as the canonical UX blueprint for the MVP.

---

## Legend
- [Screen] = UI screen / modal
- (Action) = user action / CTA
- -> = navigation or state change
- {Decision} = branching point
- *Note* = micro-animation / UX affordance

---

## 1 — Founder flow (First‑time login)

```
[Landing / Sign up] -- (Choose role: Founder) --> [First-time Founder Card]
  [First-time Founder Card] -- (Primary CTA: Publish in 60s) --> [Quick Publish Modal]
  [Quick Publish Modal] -- (Submit) --> [Marketplace Listing Created]
  [Marketplace Listing] -- (AI Match) --> [Match Results Panel]
  [Match Results Panel] -- (Request Intro) --> [Intro Draft Modal] --> (Send/Save)
  [Marketplace Listing] -- (View Pitch) --> [Pitch Viewer (modal)]

{After publish} -> [Dashboard with Guided Journey visible]
```

### Mapping (screens & components)
- **First-time Founder Card** — GlassCard, CTA pulse (220ms), dismissible.  
- **Quick Publish Modal** — 3-field form (name, one-liner, sector) + optional upload/generate deck. Autosave draft. *Micro-interaction*: modal open slide-up (260ms).  
- **Marketplace Listing** — StartupCard with micro-metrics and primary CTA `AI Match`. Card hover lift (120ms).  
- **Match Results Panel** — ephemeral glass panel with 3 matches (vc, score, reason). *Action*: `Request Intro` opens editable email draft modal.  
- **Pitch Viewer** — modal, left thumbnails, right comments; comments saved per slide. *Animation*: slide fade (200ms) + panel slide-up (260ms).

---

## 2 — Founder flow (Returning / Daily use)

```
[Login] --> [Dashboard]
  [Dashboard] shows -> {Next Action Card}
    {Next Action Card} -> (Complete step) -> update Guided Journey -> toast + AI message
  [Dashboard] -> (Open Marketplace) -> [Marketplace Listing] -> (AI Match / View Pitch)
  [Dashboard] -> (Open Copilot input) -> [Copilot suggestion] -> (Apply suggestion e.g., generate deck)
```

### Mapping & priority
- **Next Action Card** (top of Dashboard): single focused CTA (e.g., "Finish Pilot checklist"). Use small animation when content updates (metric pulse).  
- **Copilot**: persistent bottom input. If suggestion applies, show inline `Apply` button. *Micro-interaction*: inline confirmation toast (160ms).

---

## 3 — VC flow (First‑time login)

```
[Landing / Sign up] -- (Choose role: VC) --> [First-time VC Card]
  [First-time VC Card] -- (Primary CTA: Explore top deals) --> [VC Dashboard Demo State]
  [VC Dashboard Demo State] -> shows Kanban with sample deals -> (Click card) -> [Startup Detail] -> (View Pitch / Comment)
```

### Mapping
- **First-time VC Card** — short tour that highlights Kanban and quick actions.  
- **VC Dashboard Demo State** — populate sample startups in columns; allow quick drag demo. *Micro-interaction*: column highlight on hover, card wiggle on demo mode.  
- **Startup Detail** — show traction strip, `Request Intro`, `Quick Fund` actions.

---

## 4 — VC flow (Returning / Daily use)

```
[Login] --> [VC Dashboard]
  [VC Dashboard] shows -> {Pipeline summary + top matches}
  [VC Dashboard] -> (Triage 3 Interested deals) -> for each deal: (Open pitch -> Leave comment -> Move to Due Diligence)
  [VC Dashboard] -> (Fund action) -> [Fund modal] -> confirm -> add to Reports
```

### Mapping & priority
- **Pipeline summary**: top strip with counts per column + quick filter (stage/sector).  
- **Triage action**: allow bulk select + `Move` or `Flag` actions. *Micro-interaction*: animate-to-place (300ms).  
- **Fund modal**: confirm fund and amount, requires VC confirmation. Emit audit log and create `funds` record.

---

## 5 — Cross-role flows (shared)

- **Request Intro**: Founder triggers intro request → creates draft email and a `match` record; VC receives notification in activity feed.  
- **Comments**: VC or Founder can add slide-level comments → persists to `comments` and shows in pitch viewer.  
- **Match**: LLM match runs server-side; front-end shows results in Match Results Panel and stores in `matches` table.

---

## 6 — Guided Journey (visual decision map)

```
[Startup: Stage=A] --> [GuidedJourney shows suggestions] --> (Pick suggested stage) --> update startup.stage
  |-> (Enter custom stage) --> update startup.stage
  |-> (Open checklist for chosen stage) --> [Checklist modal] -> check items -> persist
```

- Checklist items are lightweight 1–3 tasks (e.g., "Validate 10 users", "Run pilot").  
- Completion of checklist items triggers small metric pulses and notes in the activity feed.

---

## 7 — UI element & micro-animation quick reference
- **GlassCard hover**: lift `translateY(-6px)` + `box-shadow` growth (120ms).  
- **Primary CTA press**: quick `scale(0.98)` (80ms).  
- **Modal open**: backdrop fade (200ms) + panel slide-up (260ms).  
- **List add**: fade-in + pulse (200ms).  
- **Drag & drop**: animate-to-place with ease (300ms).  

---

## 8 — Acceptance criteria (visual flow verification)
1. First-time Founder can publish a listing in one flow and see it appear in Marketplace.  
2. Founder sees Guided Journey and can set next stage and open the stage checklist.  
3. VC can triage deals in Kanban, open pitch viewer, add slide comments and mark Invested.  
4. Match results panel appears within the listing and allows one-click intro requests.  

---

## 9 — Next steps / Deliverables
- Export these diagrams into a clickable Figma board (I can generate tokenized frames and export JSON for Figma import).  
- Produce PNG/SVG flowcharts for stakeholder slides.  
- Implement visual test cases in Storybook (one Story per major screen + interaction).

---

If you want I can now:
- Generate PNG/SVG versions of the flows (ready for slides).  
- Create a Figma importable JSON with frames, components, and annotations.  
- Add the flow diagrams directly into the existing `FounderOS — UI/UX Inspiration & Design System` document as embedded visuals.

Which of these output formats would you like next?

