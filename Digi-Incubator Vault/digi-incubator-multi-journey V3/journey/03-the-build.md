# Stage 03 — The Build

> **Create Your First Version** · Stop planning. Make the smallest version that can be tested.

← [[02-the-blueprint|Stage 02]] · [[index|Journey Index]] · [[04-the-first-yes|Stage 04]] →

---

## The Story

This stage looks very different for different startups. If you're building an app, it's your first working prototype. If you're a food brand, it's your first batch of product. If you're running a service business, it's delivering the service manually to your first few customers. If you're making hardware, it's a working model.

The rule is the same for everyone: **build the smallest, simplest thing you can actually put in front of a real person.** Don't wait for it to be perfect. The first version exists to teach you what the real version needs to look like.

---

## The Business Type Question

> Before any Stage 3 agent runs, the platform asks: **"What kind of business are you building?"**

This answer is stored as `business_model_type` on the `startups` table. Every agent reads it before running. This is what makes the platform genuinely work for non-SaaS founders.

See [[decisions/non-saas-agent-design]] for the full reasoning.

The five types: [[business-types/saas|SaaS]] · [[business-types/physical-product|Physical product]] · [[business-types/service|Service]] · [[business-types/marketplace|Marketplace]] · [[business-types/deep-tech|Deep tech]]

---

## The Two Agents

### GTM Agent

Maps out how you reach your first customers — but the question it asks depends on your business type.

- **SaaS:** Which digital channels, what onboarding flow, what trial structure?
- **Physical product:** Which distributors, retailers, or D2C channels? What margin structure?
- **Service:** How do first clients find you? Referrals, local discovery, partnerships?
- **Marketplace:** Two separate GTM plans — one for supply side, one for demand side
- **Deep tech:** Who is your first pilot partner? Which grants match your TRL level?

See [[agents/gtm-agent]]

### Financial Projections Agent

Builds a cost-and-revenue model — but the model shape depends on your business type.

- **SaaS:** MRR growth, churn, CAC, LTV — subscription economics
- **Physical product:** Units × price − COGS = gross margin. Inventory, distribution margins
- **Service:** Capacity × utilisation × ticket. Staff cost as the primary variable
- **Marketplace:** GMV × take rate = revenue. Subsidy phase modelled separately
- **Deep tech:** Runway burn chart. Milestone timeline. No revenue projections yet

See [[agents/financial-projections-agent]]

---

## Team Joins Here

Stage 3 is when co-founders and first team members join the platform. Every agent run is stamped with `user_id` — so the history always shows who ran what and when. Nothing is overwritten when a team member re-runs an agent. Both runs are preserved.

---

## Mentor Connection

Mentors become relevant at Stage 3. Book a session with someone who has built your type of business before. They can review your GTM plan, challenge your financial assumptions, and tell you where first-time founders in your space usually go wrong.

Mentor booking is always free for founders.

---

*Next: [[04-the-first-yes|Stage 04 — The First Yes]]* · *Back to [[index|Journey Index]]*
