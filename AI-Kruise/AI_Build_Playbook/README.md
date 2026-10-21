# AI Build Playbook

A shareable methodology for building any software product with an AI coding agent (Claude Code) — fast, consistent, and resilient across sessions and teammates. Product-agnostic: adopt the structure for your own product.

**Audience:** Product Owners (to adopt and run it) · PMO and leadership (for how delivery is structured and de-risked).

**Why it matters (leadership view):** faster delivery (no re-explaining context), consistent output across teams and people, far less rework (cheap text gates before expensive builds), and resilience — work survives session/team changes because knowledge lives in files, not chat.

> The example uses Keehoo ERP only to illustrate the *shape* (marked 🟧). Referenced ERP files (e.g. `HCM_BUILD §5`, `DDL`) are not included by design — copy the structure, not the content.

## What's in this folder

| File                                   | Read it for                                                                                                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AI_Product_Build_Playbook.md`         | **The method.** The four document classes, the seven principles, the workflow with gates, the bootstrap order for a new product, and copy-paste skeletons. Start here. |
| `AI_Product_Build_Playbook_Example.md` | **One module, end to end.** A single feature (Leave / approval) traced through every layer with short excerpts, so the method becomes concrete. Read second.           |

## How to use it

1. Read the **Playbook** — understand the four document classes and the seven principles.
2. Read the **Example** — see one module move through Requirements → Spec → Prompt → Build → Review.
3. Use the **bootstrap checklist** (Playbook Appendix D) to set up your own product's docs.
4. Build your **anchor module** first (your simplest end-to-end feature); lock the pattern; inherit it for the rest.

## Two ground rules when adopting

- **Copy the structure, not the content.** The example uses ERP content only to illustrate the *shape*. Markers in the example: 🟦 = methodology (copy it), 🟧 = product-specific (replace with yours). Don't carry ERP-specific rules into a product where they don't apply.
- **Knowledge lives in files, not chat.** That's the whole point — any fresh session or teammate resumes from the files. If something only exists in a conversation, it isn't done.

