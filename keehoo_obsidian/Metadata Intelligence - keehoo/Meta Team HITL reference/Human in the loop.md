
## Human Feedback Methods in ML Models

**Providing feedback to ML models:** Humans can provide feedback to ML models, which can help the models to learn and improve. This can be done through a variety of methods, such as:

- **Active learning:** In active learning, the ML model selects the data that it wants to be labeled by a human. This can help to improve the efficiency of the labeling process.
- **Reinforcement learning:** In reinforcement learning, the ML model learns by trial and error. Humans can provide feedback to the model on its actions, which can help it to learn more effectively.

## HITL vs HOTL Definitions

**Human-in-the-loop (HITL)** means humans are actively and continuously involved in the operation or decision-making of the system, refining its output in real-time.

**Human-on-the-loop (HOTL)** involves human supervision, where humans monitor automated processes and only intervene when issues or anomalies arise.

"When we talk about human in the loop, we're really referring to a system where human judgment is directly involved in the decision making. Human on the loop is a little different. It's where the system can operate autonomously, but there's a human monitoring the process and able to intervene if needed."

## HITL vs HOTL Comparison

| **Approach**               | **Human-in-the-Loop (HITL)**                                                                                                                      | **Human-on-the-Loop**                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Human Involvement**      | Active and continuous involvement. Humans are integrated into the flow of the AI process.                                                         | Monitors the AI system. Only intervenes when necessary.                                                                                |
| **Timing of Intervention** | Human input is required before presenting the results to the end-user. AI results are blocked until human review.                                 | AI results are presented directly to the end-user, even if not perfect. Human intervention happens afterwards.                         |
| **Nature of Involvement**  | Humans provide feedback, correct errors, and guide the AI model throughout the process. Human input shapes the AI's output and future processing. | Humans have a more supervisory role, correcting the results after they have been generated and presented to users.                     |
| **Use Cases**              | Suitable for use cases where high accuracy is crucial. Examples: credit loan risk assessment, medical diagnosis.                                  | Suitable for use cases where some errors are acceptable and speed is a priority. Examples: labelling documents and content moderation. |
| **Error Tolerance**        | Low tolerance for errors.                                                                                                                         | Higher tolerance for errors.                                                                                                           |
| **Goal**                   | To maximise accuracy, reliability, and ethical considerations, while enabling continuous learning of the AI model.                                | To quickly provide AI results, with some human supervision.                                                                            |
| **Feedback**               | Human feedback actively modifies the AI's output to be more correct.                                                                              | Human feedback corrects errors in the output after its generation.                                                                     |

## Detailed Workflow for decision and correction done by Human

### 1. Store Human Feedback

- Every review action (approve/reject/correct) gets **stored first** in `human_feedback[]`.
- Example:

```json
"human_feedback": [ 
  {     
    "user": "data_architect_01",   
    "decision": "incorrect",    
    "correction": {   
      "target_table_name": "Constituents",    
      "linking_column": "constituent_id"     
    },  
    "comment": "customer_no confused with constituent_id",
    "timestamp": "2025-09-01T15:00:00Z",    
    "validated": false   
  } 
]
```

✅ Feedback is **captured but not yet applied**.

### 2. Validate the Feedback Request

- Run **validation checks** before applying:
    - **Schema validation**: Does the correction reference existing tables/columns?
    - **User validation**: Is the reviewer trusted?
    - **Format validation**: Is the feedback structured (decision + correction)?
    - **Approval workflow**: Optionally require multiple reviewers.

After validation → mark feedback as: `"validated": true`

### 3. Apply Changes

- Once validated, the system:
    - Updates the document (`foreign_keys_referencing_tables`).
    - Keeps **original LLM inference** for audit.
    - Adds `validation_status = "human_validated"`.

### 4. Reflect in Connected Docs

- Propagation service updates:
    - Target table docs.
    - Metadata catalogs.

## Flow for LLM-Inferred Decision + Correction

### 1. Human Input (Minimal)

The reviewer only writes a **comment**:

```json
"human_feedback": [   
  {     
    "user": "data_architect_01",
    "comment": "customer_no confused with constituent_id",    
    "timestamp": "2025-09-01T15:00:00Z",    
    "validated": false   
  } 
]
```

### 2. LLM Infers Decision + Correction

You prompt the LLM:

**Prompt Example**

```
Given the human comment: "customer_no confused with constituent_id"  
Task: 
1. Decide whether the  inference is correct or incorrect. 
2. If incorrect, propose a structured correction in JSON. 
3. Explain briefly WHY the decision was made.
```

**LLM Output**:

```json
{   
  "decision": "incorrect",  
  "correction": {    
    "target_table_name": "Constituents",  
    "linking_column": "constituent_id",   
    "relation_description": "Correct mapping to Constituents table.",   
    "relationship": "many-to-one"   
  },  
  "reason": "The comment indicates that 'customer_no' was mistakenly used instead of 'constituent_id'. This correction aligns the transaction with the correct Constituent table." 
}
```

### 3. Validation Layer

Before applying:

- **Schema Validation**: Check if `"Constituents"` exists as a valid table and `"constituent_id"` exists as a column.
- **Confidence Validation**: Ensure LLM output fits schema format and reasoning is coherent.
- **Optional 2nd Human Approval**: Only if automated checks fail.

If valid → mark feedback entry as: `"validated": true, "applied": true`

### 4. Update + Propagate

- Apply corrected mapping in the main doc.
- Update connected docs (both sides of FK).
- Retain **audit trail** (original inference, LLM-inferred correction, reasoning, validation status).

## Why This Approach Makes Sense

### 1. Minimizing Human Cognitive Load

- In schema/metadata governance, the **bottleneck is human review time**.
- If you force humans to **decide + structure corrections manually**, they become clerks instead of reviewers.
- By letting the **LLM infer "decision + correction" from a comment**, you:
    - Reduce human effort to just leaving hints.
    - Speed up validation cycles.
    - Scale review across hundreds of tables.

### 2. Consistency in Structured Output

- Humans may phrase corrections differently ("point it to Constituent table" vs. "use `constituent_id`").
- LLM ensures **uniform JSON schema output** that your doc store can consume.
- Prevents data integrity issues caused by inconsistent formats.

### 3. Traceability with Reasoning

- A `"reason"` field makes every decision auditable.
- If a correction later turns out wrong, you can **see why the LLM made that choice** (e.g., misinterpreted comment).
- This is critical in enterprise data governance (audit, compliance, explainability).

### 4. Safe Guardrails via Validation

- LLM can hallucinate — so we **don't apply changes directly**.
- Instead:
    - Schema validation → check if corrected table/column exists.
    - Business rules → confirm relationships make sense (e.g., `transaction_id` should never point to `product_id`).
- Only **validated outputs get applied**.
- This combines **AI assistance with enterprise safety nets**.

### 5. Scalable Path Toward RLHF

- By storing (comment → LLM inferred decision/correction → validated), you're creating a **training dataset**.
- Later, you can fine-tune or RLHF your model to **directly predict decisions + corrections without human hints**.
- Smooth migration path: **start simple HITL → evolve into RLHF → reduce human effort further**.

## Implementation Strategy

- You already have a **system that generates FKs & referencing tables**.
- Your **risk tolerance is low** → one wrong foreign key can break pipelines.
- You're also **building a feedback dataset** that can power automation later.

Therefore:

- **Short-term (bootstrapping):** **Interactive ML (IML)** → every inference gets reviewed and corrected, building a golden dataset.
- **Medium-term (scaling):** Introduce **Active Learning** → humans only review uncertain mappings, system auto-applies high-confidence ones.
- **Long-term (automation):** Combine with **RLHF** → model improves automatically, humans just oversee edge cases.

## Research Paper Summaries

### Human-in-the-loop machine learning: a state of the art

[Springer Link](https://link.springer.com/article/10.1007/s10462-022-10246-w?utm_source=chatgpt.com) – A comprehensive survey of HITL ML, mapping interaction types between humans and algorithms (Mosqueira-Rey & Hernández-Pereira, 2023).

Depending on who is in control of the learning process, we can identify different approaches to HITL-ML:

- **Active learning (AL)**, in which the system remains in control of the learning process and treats humans as oracles to annotate unlabeled data.
- **Interactive machine learning (IML)**, in which there is a closer interaction between users and learning systems, with people interactively supplying information in a more focused, frequent, and incremental way compared to traditional machine learning.
- **Machine teaching (MT)**, where human domain experts have control over the learning process by delimiting the knowledge that they intend to transfer to the machine learning model.

**Reasoning** Also, we must also bear in mind that, in certain domains, it is advisable that the algorithms should explain their results to humans. We are not only interested in the ability of an algorithm to solve a problem with a given accuracy, but also in the ability to explain why a given solution was chosen. This is called **Explainable AI (XAI)** and is a research field that aims to make the results of AI systems more understandable to humans.

### Applications, challenges, and future directions of human-in-the-loop learning

[IEEE Link](https://ieeexplore.ieee.org/abstract/document/10530996/?utm_source=chatgpt.com) – Explores how HITL systems combine domain expertise with ML automation for improved prediction models, highlighting diverse implementations and open challenges (Kumar et al., 2024).

Designers should (1) list what people do, (2) automate what they can, (3) study where people fail, and (4) give support to reduce failures. Then repeat if necessary until the system is safe enough.

![[Pasted image 20250906192624.png]]


## How current applications are working

chat gpt

![[Pasted image 20250906193124.png]]

Claude
![[Pasted image 20250906193239.png]]