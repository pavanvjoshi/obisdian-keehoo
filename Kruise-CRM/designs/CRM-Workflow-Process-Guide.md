# CRM Outreach Workflow — Process Guide

**Workflow name:** `crm-updated-workflow-v1`  
**Workflow ID:** `4c3410d7-86cc-4de6-aa88-71b2b3760299`  
**Audience:** CRM / sales team (new joiners)  
**Purpose:** Walk through what happens from the moment someone starts this workflow until it ends — human steps, AI steps, and every yes/no branch.

This guide explains the **business process only**. It does not cover APIs or technical setup.

---

## What this workflow is for

This is an end-to-end CRM sales workflow. It helps you:

1. Research a prospect on the web  
2. Score how well they fit your outreach reason  
3. Decide whether to email them  
4. Draft, review, and send an Outlook email  
5. Wait for their reply (with follow-ups if needed)  
6. Continue the conversation if the reply looks good  
7. Book a Teams meeting once interest is clear  
8. After the meeting, review transcript + email thread and decide the next sales stage  

Humans stay in control at every important decision. AI helps with research scoring, email drafting, reply judgment, meeting confirmation text, and stage recommendation.

---

## High-level journey (simple map)

```
Start
  → Collect research + approach details (HITL)
  → Tavily web research
  → AI fit score (out of 10)
  → Human: Email or Call?
        ├─ Call → END (no outreach)
        └─ Email → Email brief (HITL)
              → AI drafts email
              → Human: Send or Regenerate?
                    ├─ Regenerate → back to AI draft
                    └─ Send → Outlook email sent
                          → Wait / check for reply
                                ├─ No reply → Follow-up email → check again
                                │     ├─ Still no reply → END
                                │     └─ Reply → AI analyzes → Human: Good or Bad?
                                └─ Reply → AI analyzes → Human: Good or Bad?
                                      ├─ Bad → END
                                      └─ Good → Human composes sales reply → send
                                            → Wait / check Round 2 reply
                                                  ├─ No reply → Round 2 follow-up → check again
                                                  │     ├─ Still no → END
                                                  │     └─ Reply → AI analyzes → Good/Bad
                                                  └─ Reply → AI analyzes → Good/Bad
                                                        ├─ Bad → END
                                                        └─ Good → Enter meeting details
                                                              → Create Teams meeting
                                                              → AI meeting email → Human approve
                                                              → Send meeting confirmation in thread
                                                              → Paste Teams join URL (HITL)
                                                              → Fetch transcript (retries if needed)
                                                              → Read full email thread
                                                              → AI stage recommendation
                                                              → Human: Move to next stage or Reject
                                                                    → END
```

---

## Phase 1 — Start & collect inputs

### Step 1: Start the workflow

Someone on the CRM team starts a run of this workflow (from Kruise).

### Step 2: Collect CRM inputs (Human task)

You fill a form with:

| Field | Why it matters |
|---|---|
| Authorization | Tavily research access token (Bearer …) |
| Content-Type | Usually `application/json` |
| Search query | Who/what to research (e.g. person + company) |
| Topic | `general`, `news`, or `finance` |
| Search depth | `basic` or `advanced` |
| Max results | How many research results to pull |
| Include answer / raw content | How rich the research payload should be |
| **Why are you approaching this person?** | Your real outreach reason (investment, partnership, product sale, etc.) |

**Important:** The “approach reason” drives the fit score later. Be specific.

---

## Phase 2 — Research & fit score

### Step 3: Tavily research (automatic)

The workflow runs web research using the query and settings you entered.  
This gathers public information about the prospect / company.

### Step 4: CRM Approach Fit Scorer (AI agent)

An AI agent reviews:

- the Tavily research, and  
- your approach reason  

It produces roughly:

- a **score out of 10**  
- a **recommendation**  
- **reasoning** (why this person fits or does not fit)

### Step 5: Start conversation? (Human decision)

You see the score, recommendation, and reasoning.

You choose:

| Choice | What happens |
|---|---|
| **Email** | Continue — prepare outreach email |
| **Call** | End the workflow (no email outreach in this run) |

If you choose **Call**, the run ends at **End — Declined outreach**.

---

## Phase 3 — Compose and send first outreach email

### Step 6: Email brief (Human task)

You provide:

- **To** (prospect email)  
- **Mail content / intent** (what the email should achieve)  
- **Subject**  
- Optional **CC** / **BCC**

You are describing intent; you do not have to write the full polished email yourself.

### Step 7: CRM Email Composer (AI agent)

The AI drafts a professional outreach email using:

- your brief  
- research  
- approach reason  

### Step 8: Review email draft (Human decision)

You review To / Subject / CC / BCC / Body.

| Choice | What happens |
|---|---|
| **Send mail** | Email is sent via Outlook |
| **Regenerate** | Goes back to the composer with your feedback so it can rewrite |

You can loop Send/Regenerate until the draft is right.

### Step 9: Send Outlook email (automatic)

The approved draft is sent from Outlook.

### Step 10: Save tracking details (automatic)

Behind the scenes the workflow stores conversation / message details so it can later:

- check for replies in the same thread  
- send follow-ups in the same conversation  

You do not fill these manually.

---

## Phase 4 — Wait for first reply (Round 1)

After the first email, the workflow looks for a prospect reply.

### How reply checking works

1. Check inbox/conversation for a reply  
2. If **no reply** → wait a short time → check again  
3. If still **no reply** after the second check → you are asked to write a **follow-up email**  
4. Follow-up is sent in the **same Outlook thread**  
5. Workflow checks again (two checks with a short wait)  
6. If still nothing → **End — No Reply After Follow-up**

If a reply is found at any check point, the flow continues to analysis.

> Note: In this current workflow version the waits between checks are short (about 1 minute). In real CRM usage you may treat that as “poll briefly / demo timing”; the process shape is what matters: check → wait → check → follow-up → check again.

### Step 11: Analyze Sales Reply (AI agent)

When a reply arrives, AI compares:

- what **we** originally asked for, vs  
- what the **prospect** replied  

It classifies the reply (roughly **good** vs **bad**) and suggests what to do next.

### Step 12: Review Sales Reply (Human decision)

You see:

- our original outreach  
- the prospect’s reply  
- AI classification + suggestion + reasoning  

| Choice | What happens |
|---|---|
| **Good** | Continue — you will compose a sales reply |
| **Bad** | End at **End — Bad Reply** |

### Step 13: Compose Sales Reply (Human task)

If Good:

- You write the **reply body**  
- Choose Reply All yes/no  
- AI suggestion is shown as help, but **you** write the final text  

### Step 14: Send Outlook reply (automatic)

Your reply is sent in the same email thread.

If send fails → **End — Send Failed**.

---

## Phase 5 — Wait for second reply (Round 2)

After our sales reply, the workflow again waits for the prospect.

Same pattern as Round 1:

1. Check for reply  
2. If none → wait → check again  
3. If still none → **Compose Round2 Follow-up** (HITL) → send follow-up  
4. Check again twice  
5. Still none → **End — No Reply After Round2 Follow-up**

### Step 15: Analyze Round2 Reply (AI agent)

Same style of analysis as Round 1, but against our latest sales email.

### Step 16: Review Round2 Reply (Human decision)

| Choice | What happens |
|---|---|
| **Good** | Prospect is engaged enough → move to meeting scheduling |
| **Bad** | End at **End — Bad Reply Round2** |

---

## Phase 6 — Schedule meeting & confirm

### Step 17: Enter Meeting Details (Human task)

You enter:

- Meeting subject  
- Start / end datetime  
- Timezone (default often `Asia/Kolkata`)  
- Optional location  
- Optional notes / agenda  

Prospect email is already known from the conversation.

### Step 18: Create Outlook / Teams meeting (automatic)

The workflow creates a calendar event (online Teams meeting) and invites the prospect.

If creation fails → **End — Meeting Creation Failed**.

### Step 19: Compose Readable Meeting Email (AI agent)

AI writes a clear meeting-confirmation email (subject + readable body) including time and Teams link.

If draft generation fails → **End — Email Draft Failed**.

### Step 20: Approve Meeting Email (Human decision)

You review meeting metadata + email preview.

| Choice | What happens |
|---|---|
| **Approve** | Confirmation is replied into the existing Outlook thread |
| **Reject** | End at **End — Meeting Email Rejected** |

### Step 21: Reply With Meeting Details (automatic)

Approved confirmation is sent to the prospect in-thread.

---

## Phase 7 — After meeting: transcript + stage decision

### Step 22: Enter Teams Join URL (Human task)

After the invite is sent, you paste the Microsoft Teams **join URL**.

- The generated join URL is shown for convenience  
- You confirm/paste the full join URL  
- The workflow does **not** wait for the scheduled meeting end time by itself — you submit when you are ready to pull transcript (typically after the meeting has happened and transcript is available)

If join URL is missing/invalid path → **End — Join URL Missing**.

### Step 23: Get meeting transcript (automatic, with retries)

The workflow tries to fetch transcript content from Teams (up to 3 attempts, with short waits between).

| Result | What happens |
|---|---|
| Transcript available | Continue |
| Still unavailable after retries | **End — Transcript Not Available** |

### Step 24: Read full email conversation thread (automatic)

Pulls the whole Outlook conversation (outreach, replies, meeting confirmation, etc.) so the next AI step has full context — not just the meeting.

### Step 25: Analyze Email + Meeting for Stage (AI agent)

AI reviews:

- full email thread  
- meeting transcript  
- meeting metadata  

and recommends whether the prospect should move to the next sales stage, with:

- overall summary  
- email engagement summary  
- meeting summary  
- buying signals  
- risks / objections  
- suggested next action  

### Step 26: Decide Next Sales Stage (Human decision)

You review the AI recommendation and choose:

| Choice | What happens |
|---|---|
| **Move to next stage** | Workflow ends successfully at **End — Move to Next Stage** |
| **Reject** | Workflow ends at **End — Stage Rejected** |

> Today both choices **end this workflow**. Actual CRM stage update in an external CRM may be a later enhancement — for now this is the human decision checkpoint.

---

## All ending points (quick reference)

| End state | Meaning |
|---|---|
| End — Declined outreach | Human chose **Call** instead of emailing |
| End — Send Failed | Outreach / reply email send failed |
| End — No Reply After Follow-up | No reply after first email + follow-up checks |
| End — Bad Reply | First prospect reply judged Bad |
| End — Round2 Follow-up Send Failed | Round 2 follow-up could not be sent |
| End — No Reply After Round2 Follow-up | No reply after sales reply + Round 2 follow-up |
| End — Bad Reply Round2 | Second-round reply judged Bad |
| End — Meeting Creation Failed | Calendar / Teams meeting could not be created |
| End — Email Draft Failed | Meeting confirmation email draft failed |
| End — Meeting Email Rejected | Human rejected meeting confirmation email |
| End — Join URL Missing | Teams join URL not provided |
| End — Transcript Not Available | Transcript could not be fetched after retries |
| End — Follow-up Send Failed | First follow-up email send failed |
| End — Stage Rejected | Human rejected moving to next stage |
| End — Move to Next Stage | Human approved advancing the prospect |

---

## What humans do vs what the system does

### Humans (HITL) always do

- Enter research settings + approach reason  
- Decide Email vs Call after fit score  
- Provide email brief (To / intent / subject)  
- Approve or regenerate the outreach draft  
- Judge prospect replies Good / Bad  
- Write the actual sales reply and follow-ups  
- Enter meeting schedule details  
- Approve meeting confirmation email  
- Paste Teams join URL  
- Final stage decision (move forward or reject)

### System / AI does

- Web research (Tavily)  
- Fit scoring  
- First email drafting  
- Reply detection in Outlook  
- Reply quality analysis suggestions  
- Meeting creation in Outlook/Teams  
- Meeting confirmation drafting  
- Transcript fetch + email thread read  
- Stage eligibility recommendation  

---

## Practical tips for a new CRM teammate

1. **Be clear in “Why are you approaching this person?”** — scoring quality depends on it.  
2. **Treat AI drafts as assistants, not final truth** — always review before Send.  
3. **Good / Bad is your call** — AI suggests; you decide.  
4. **Keep everything in one thread** — follow-ups and replies stay in the same Outlook conversation so context is preserved.  
5. **Meeting join URL matters** — without it, transcript and stage analysis cannot run.  
6. **Transcript may take time after the meeting** — if the run ends with “Transcript Not Available”, the meeting may not have a ready transcript yet; re-run later or wait before submitting the join URL.  
7. **This workflow ends at stage decision** — it does not automatically rewrite an external CRM board by itself (yet).

---

## One-sentence summary

**Research the prospect → score fit → optional AI-assisted outreach → wait/follow-up for replies → continue only on good replies → book a Teams meeting → analyze email + transcript → human decides whether to move the deal forward.**
