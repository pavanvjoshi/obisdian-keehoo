# My understanding, then the phases as stories

## What I understand

Kruise CRM already carries a customer from a first contact to an accepted quotation. Along the way, the salesperson learns a lot about the customer: why they were approached, their budget, authority, need and timeline, and what was said on calls. That knowledge is scattered across lead notes, custom fields, quotation history and the deal.

When the quotation is **accepted** (Deal Won), a separate **tech team** has to set up the customer's ERP, or do their interior design. Today they would start from scratch and ask the customer the same questions again.

This feature fixes that in three steps:

1. **Collect** everything into one context per Account and Deal, with provenance (who said it, when, from which call).
2. **Freeze** that context into an immutable snapshot the moment the quotation is accepted, and hand it to the tech team.
3. **Help the tech team onboard** with a checklist and a chat assistant that only reads and organises. People apply every change to the customer's setup themselves.

Three rules shape everything:

- Accept is never blocked or broken by this feature.
- Snapshots are never edited. Corrections are dated addenda.
- The assistant never writes a fact on its own. A person confirms each one.

---

## Phase 1: Context foundation ("one place to look")

**The story.** Meera is a salesperson. She has worked the lead Ravi Menon at Sundaram Textiles for three weeks. Over that time she has filled in Prospect Profiling, logged a discovery call and done the BANT assessment. Then she marks him SQL. A colleague asks, "What do we actually know about Sundaram?" Meera has to open four screens and still cannot say where the budget figure came from.

After phase 1, Meera opens the contact or deal and sees a **context panel**. It shows facts grouped by section: company profile, people, qualification, interactions, commercials. Next to "Budget: ₹18 lakh" it says *captured by Meera, from the discovery call on 12 Nov, not yet verified by the customer*. When she saves a journey step, the facts are written automatically. Nobody re-types anything.

The lead can run through the manual journey or the AI Kruise automated flow. Both write the **same fact structure**, so the panel looks identical either way.

**What gets built.** The `customer_context` module: the context record, facts with provenance, interactions, addenda, and the hooks from the lead steps that write facts. It also adds a read endpoint and the panel on the Contact, Deal and Quotation screens.

**Done when:** every SQL contact shows a context view with sources.

**Check this one:** Nothing existing is moved. The context *references* the current tables. That is the main way I'm avoiding a second source of truth.

---

## Phase 2: Handoff ("the day the deal is won")

**The story.** Sundaram's CFO says yes. Meera clicks **Accept** on the quotation. The deal moves to Won and the company goes to Master Data, as it does today. Then, in the background, the CRM **freezes a snapshot** of everything it knows, plus the accepted quotation revision and the negotiation notes.

Meera notices nothing extra. Suppose Master Data is down at that moment, or the freeze itself fails. Accept still succeeds. The freeze goes into a retry queue and a scheduled job picks it up a few minutes later. Whatever happens, there is **exactly one snapshot per accepted quotation**, even if the retry runs twice.

The next morning Arjun, from the tech team, opens the **Onboarding queue** and sees "Sundaram Textiles: Frozen: 72% complete". He reads the snapshot and sees the customer never said which GST registrations they have. He clicks **Return with gaps** and writes one question: "Do they have multiple GSTINs?" It goes to Meera.

Meera answers it as an **addendum**: "Two GSTINs, per call on 14 Nov." The snapshot itself stays untouched. She resubmits, and Arjun clicks **Accept**. Onboarding is now open for that customer.

If a quotation is rejected instead, there is no handoff. The context is kept for re-engagement.

**What gets built.** The `onboarding` module's handoff side: the snapshot, the statuses (Frozen → Accepted, or Returned → Resubmitted), addenda, the freeze hook after Accept, the retry job, the `crm.deal.won` event carrying a snapshot reference rather than the data, and the accept/return screens.

**Done when:** every accepted quotation yields exactly one snapshot, even when Master Data or the freeze fails first.

**Check this one:** This phase touches quotation code in one place only: a single optional call after the accept commits. If you want the strictest possible separation, say so.

---

## Phase 3: Onboarding workspace and templates ("the checklist")

**The story.** Arjun accepts Sundaram's handoff. He sees a checklist built from the **ERP template** and the snapshot: master data, process configuration, roles, company documents, and a customisation package for processes they want changed. Each item says whether it is **known**, **missing** or **customer-verified**. The completeness score is the same one he saw in the queue. Each track has an owner and a blocker field ("waiting for item master Excel").

Midway through, Sundaram's operations head asks for a gate-pass module that was not in the quotation. Arjun does not quietly absorb it. He raises a **change request** that goes to Meera, who may revise the quotation or add a new one.

Months later the company adds a new product line. Someone adds a template for it as **data**, and no deployment is needed.

**What gets built.** Templates as data, onboarding tracks and items, the completeness calculation, blockers and owners, change requests, and the ERP template. A mixed quote (SaaS plus goods) opens more than one track.

**Done when:** the tech team can run an ERP onboarding from the checklist without leaving the CRM.

**Check this one:** I still need the **product line** for each quote line. The catalogue has no such field today. My recommended path is a CRM-side mapping first. I also need to know how SaaS lines behave in the order saga, because today every confirmed line goes to Stock. The interior design template stays empty until that team defines it, and I will not invent its fields.

---

## Phase 4: Assistant ("a careful colleague who has read everything")

**The story.** Arjun types in the chat: "What did they say about their current system?" The assistant answers, "They run Tally plus spreadsheets for stock" and cites the 12 Nov discovery call. It is read-only and grounded in the snapshot and addenda.

Arjun asks, "What am I still missing?" It lists the gaps against the template and suggests the next question for him to ask the customer. Arjun asks it on a call, outside the chat.

After the call he pastes his notes. The assistant proposes three structured facts, such as "Two warehouses: Hosur and Salem". Arjun confirms two and rejects one that was wrong. Only the confirmed ones are saved, as addenda with their source.

He uploads the item master Excel. The assistant reports row-level errors ("row 41: HSN missing") but **does not load it**. When the facts are settled, it produces a **configuration worksheet**. Arjun applies the configuration by hand.

The assistant cannot touch the customer's setup, and it never sees identity-document contents. Every prompt and tool call is logged.

**What gets built.** A provider-neutral model port with an adapter (the OpenAI SDK is already in the stack), read-only use cases exposed as tools, a confirm-before-save flow, structured inputs in the chat, and prompt and tool-call logging.

**Done when:** no assistant output becomes a fact without a person confirming it.

**Check this one:** If the model provider changes, only the adapter changes.

---

## Phase 5: Deeper capture ("learning more, earlier")

**The story.** After SQL, Meera runs a structured **deep discovery** with Sundaram: which of the 14 modules they care about, ranked pain points, and a review of the standard process flows. For each step the customer marks **Use**, **Modify** or **Skip**, for example "we want steps 4 and 5 changed". A demo is held and its **recording and transcript** are attached to the deal, with consent noted.

All of this lands in the same context as facts. The Modify marks later feed the customisation package in Phase 3 directly. The interior design template is defined here too, once that team says what they need to know.

**What gets built.** A Demo step, a configurable discovery questionnaire, process review with Use/Modify/Skip, AI Kruise output mapping, and the interior design template.

**Check this one:** I'm assuming deep discovery happens after SQL and attaches to the deal. The code already calls that deal stage "discovery". That is an inference, not something I've confirmed.

---

## Phase 6: Customer-facing chat or portal (later, not planned now)

**The story.** One day Sundaram's staff could answer onboarding questions themselves in a portal. That needs an external customer identity, which the CRM does not have. It is out of scope for now. I only mention it so earlier phases don't block it.

---

## Where I'd like your review

1. **Order.** I would build phases 1 and 2 first. They are useful even with no assistant, and everything else depends on them.
2. **Hand-applied changes.** Is "the tech team applies every change by hand" firm for all phases?
3. **Return and resubmit.** Is a return-and-resubmit loop right, or should sales be able to answer gaps without a formal resubmit?
4. **Compliance.** Aadhar, recording consent and retention are still undecided, and they affect Phase 5 most.
5. **Overlap with Customer Onboarding.** The backlog's existing "Customer Onboaring" item (the CRM asking a customer questions to build a business profile) looks adjacent. I think it should share the fact model, but I haven't confirmed that with you.

Tell me what to change in any phase. I won't write code until you've approved this plan and answered the earlier questions about migrations and the service-line change.