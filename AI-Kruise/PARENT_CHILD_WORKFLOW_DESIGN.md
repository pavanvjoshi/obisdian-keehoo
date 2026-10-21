# Parent-Child Workflow Pattern — Design & Implementation Guide

**Status:** Proposed  
**Scope:** `keehoo_ai_kruise_backend`  
**Pattern:** Upload Job → Parent Graph → Fan-out to N Child Graphs (one per record)

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Current State — What Already Works](#2-current-state--what-already-works)
3. [Target Architecture](#3-target-architecture)
4. [Gap Analysis](#4-gap-analysis)
5. [Architectural Changes Required](#5-architectural-changes-required)
6. [Data Model Changes](#6-data-model-changes)
7. [New Components](#7-new-components)
8. [Sequence Flows](#8-sequence-flows)
9. [Effort Estimation](#9-effort-estimation)
10. [Implementation Phases](#10-implementation-phases)
11. [Constraints and Risks](#11-constraints-and-risks)

---

## 1. Problem Statement

The target pattern is:

```
Upload Job #1001
       ↓
Parent Graph
       ↓
Read CSV (10,000 rows)
       ↓
Fan-out → Child Graph G001 (Employee E001)
        → Child Graph G002 (Employee E002)
        → ...
        → Child Graph G10000 (Employee E10000)
```

Each child graph:
- Owns one business record (one employee)
- Runs independently with its own state
- Can pause for human approval (HITL)
- Resumes via callback when approved
- Reports completion back to the parent

The parent graph:
- Waits for all (or a quorum of) children to finish
- Aggregates results
- Continues its own downstream logic

---

## 2. Current State — What Already Works

The foundation for this pattern already exists. The following five capabilities are production-ready.

```mermaid
graph TD
    subgraph "Already Built"
        A[WorkflowInstance entity<br/>pause_at_node / resume_from_node]
        B[HITL task rows<br/>_workflow_hitl_tasks.py]
        C[Public wait tokens<br/>public_wait_router.py]
        D[Atomic resume guard<br/>findOneAndUpdate + conflict 409]
        E[sub_workflow node<br/>sub_workflow.py — inline, blocking]
        F[for_each node<br/>loop.py — in-memory, max 1000]
        G[correlation_id field<br/>WorkflowInstance.correlation_id]
    end

    A --> B
    B --> C
    C --> D
```

| Capability | File | Notes |
|---|---|---|
| Instance lifecycle (pause/resume/complete) | `executions/domain/entities.py` | Solid — `pause_at_node`, `resume_from_node`, `complete`, `fail` |
| HITL tasks + completion data | `_workflow_hitl_tasks.py` | Stores every approval decision as a row |
| Public tokenized resume | `public_wait_router.py` | GET + POST `/public/wait/{token}` |
| Idempotent resume (atomic claim) | `_workflow_execution.py:358` | `findOneAndUpdate` with status guard → HTTP 409 on conflict |
| Sub-workflow invocation | `node_handlers/sub_workflow.py` | Runs ONE child synchronously |
| Iteration | `node_handlers/loop.py` | `for_each` (max 1000), `repeat` |
| Record identity | `WorkflowInstance.correlation_id` | Present but not uniquely enforced |

---

## 3. Target Architecture

### 3.1 High-Level Flow

```mermaid
flowchart TD
    Upload["Upload Job #1001<br>(CSV with 10,000 rows)"]
    Parent["Parent WorkflowInstance<br>wf_id: payroll_processing<br>inst_id: P-001"]
    Parse["Parse CSV Node<br>→ stores row refs in fan_out_collection"]
    FanOut["fan_out Node<br>(NEW)<br>spawns N child instances"]
    Wait["__wait_children marker<br>Parent status: waiting_for_children"]

    subgraph "MongoDB: fan_out_batches"
        Batch["fan_out_job_id: FOJ-001<br>parent_instance_id: P-001<br>total: 10000<br>completed: 0<br>failed: 0"]
    end

    subgraph "Child Instances (10,000)"
        C1["G001<br>Employee E001<br>status: running"]
        C2["G002<br>Employee E002<br>status: waiting_for_input"]
        C3["G003<br>Employee E003<br>status: completed"]
        Cdot["..."]
        CN["G10000<br>Employee E10000<br>status: pending"]
    end

    Resume["Parent resumes<br>when all children done"]

    Upload --> Parent
    Parent --> Parse
    Parse --> FanOut
    FanOut --> Wait
    FanOut --> C1
    FanOut --> C2
    FanOut --> C3
    FanOut --> Cdot
    FanOut --> CN
    Wait --> Batch
    C1 --> Resume
    C2 --> Resume
    C3 --> Resume
    CN --> Resume
```

### 3.2 Child Instance with HITL

```mermaid
flowchart LR
    subgraph "Child Graph G002 — Employee E002"
        CS[Start]
        CV[Validate Data]
        CA[Approval Node<br>status: waiting_for_input]
        CP[Process Payroll]
        CE[End]
    end

    subgraph "HITL"
        TK[Wait Token<br>created]
        EM[Email sent<br>to manager]
        AP[Manager approves<br>POST /public/wait/token]
    end

    CB["Child completion callback<br>→ check fan_out_batch counter<br>→ if all done: resume parent"]

    CS --> CV --> CA
    CA --> TK --> EM --> AP
    AP --> CP --> CE
    CE --> CB
```

---

## 4. Gap Analysis

### What Is Missing Today

```mermaid
graph LR
    subgraph "Exists"
        E1[Instance creation]
        E2[HITL pause/resume]
        E3[Idempotent resume]
        E4[sub_workflow — 1 child, blocking]
        E5[for_each — in-memory, max 1000]
        E6[correlation_id field]
    end

    subgraph "Missing — Must Build"
        M1["fan_out node handler<br>(async, fire-and-forget)"]
        M2["parent_instance_id field<br>on WorkflowInstance"]
        M3["fan_out_batches collection<br>(progress tracker)"]
        M4["child completion callback<br>(resume parent when all done)"]
        M5["Large dataset storage<br>(row refs out of context)"]
        M6["record_id field<br>(one-record-per-child enforcement)"]
    end

    E1 -.enables.-> M1
    E2 -.enables.-> M4
    E6 -.extends to.-> M2
```

| Gap | Severity | Reason |
|---|---|---|
| No `fan_out` node | **Blocker** | `sub_workflow` is synchronous and one-at-a-time |
| `for_each` cap is 1,000 | **Blocker** | Hard limit at `loop.py:28`; fails at row 1,001 |
| `sub_workflow` rejects paused children | **Blocker** | `sub_workflow.py:73` raises `ValueError` if child HITL pauses |
| No `parent_instance_id` on entity | **Required** | Children cannot notify parent without this link |
| No fan-out progress tracker | **Required** | Parent cannot know when all children are done |
| Context size limit 512KB | **Required** | 10,000 rows inline in context will hit `_CONTEXT_MAX_BYTES` |
| No child completion hook | **Required** | Nothing triggers parent resume today |

---

## 5. Architectural Changes Required

### 5.1 Overview

```mermaid
graph TD
    subgraph "Layer 1 — Domain"
        D1["WorkflowInstance entity<br>+ parent_instance_id: Optional[str]<br>+ record_id: Optional[str]<br>+ fan_out_job_id: Optional[str]"]
    end

    subgraph "Layer 2 — New Collection"
        D2["fan_out_batches collection<br>(MongoDB)<br>fan_out_job_id, parent_instance_id,<br>total, completed, failed, status"]
    end

    subgraph "Layer 3 — New Node Handler"
        D3["fan_out node<br>app/shared_kernel/infrastructure/<br>node_handlers/fan_out.py<br><br>1. Write rows → fan_out_row_refs<br>2. Create child instances in batches<br>3. Insert fan_out_batch doc<br>4. Return __wait_children marker"]
    end

    subgraph "Layer 4 — Child Completion Hook"
        D4["_on_child_completed()<br>called from _workflow_execution.py<br>when instance transitions to<br>completed / failed<br><br>→ findOneAndUpdate fan_out_batch counter<br>→ if all done: resume parent"]
    end

    subgraph "Layer 5 — Registry"
        D5["registry.py<br>+ 'fan_out': fan_out.handle_fan_out"]
    end

    subgraph "Layer 6 — Executor Wait Handler"
        D6["_workflow_executor.py<br>+ detect __wait_children marker<br>→ pause with status 'waiting_for_children'"]
    end

    D1 --> D2
    D2 --> D3
    D3 --> D4
    D4 --> D6
    D3 --> D5
```

### 5.2 Changes to Existing Files

| File | Change Type | What Changes |
|---|---|---|
| `executions/domain/entities.py` | **Extend** | Add `parent_instance_id`, `record_id`, `fan_out_job_id` fields |
| `executions/infrastructure/adapters/driven/persistence/repository.py` | **Extend** | Map new fields in `_doc_to_entity` / `_entity_to_doc` |
| `shared_kernel/infrastructure/node_handlers/registry.py` | **Extend** | Register `"fan_out": fan_out.handle_fan_out` |
| `workflows/infrastructure/adapters/driven/persistence/_workflow_executor.py` | **Extend** | Detect `__wait_children` context marker → `pause_at_node` with status `waiting_for_children` |
| `workflows/infrastructure/adapters/driven/persistence/_workflow_execution.py` | **Extend** | Call `_on_child_completed()` at the end of `run_instance()` when instance is a child |
| `node_handlers/loop.py` | **Optional** | Raise `_HARD_MAX_ITERATIONS` or bypass for fan-out use case |

### 5.3 New Files to Create

| File | Purpose |
|---|---|
| `shared_kernel/infrastructure/node_handlers/fan_out.py` | New node handler — fan-out logic |
| `shared_kernel/infrastructure/fan_out_service.py` | Batch creation, progress tracking, parent resume |
| MongoDB migration | Add indexes on `parent_instance_id`, `fan_out_job_id` |

---

## 6. Data Model Changes

### 6.1 WorkflowInstance Entity

```mermaid
classDiagram
    class WorkflowInstance {
        +str instance_id
        +str workflow_id
        +str org_id
        +str status
        +str started_by
        +Optional[str] current_node
        +dict context
        +Optional[str] correlation_id
        
        %% NEW FIELDS
        +Optional[str] parent_instance_id
        +Optional[str] record_id
        +Optional[str] fan_out_job_id
        
        +pause_at_node(node_id)
        +resume_from_node()
        +complete()
        +fail(error)
    }

    class FanOutBatch {
        +str fan_out_job_id
        +str parent_instance_id
        +str parent_node_id
        +str org_id
        +str child_workflow_id
        +int total
        +int completed
        +int failed
        +int pending
        +str status
        +datetime created_at
        +datetime updated_at
        +Optional[datetime] completed_at
        +str completion_mode
    }

    class FanOutRowRef {
        +str fan_out_job_id
        +str record_id
        +str child_instance_id
        +dict row_data
        +str status
    }

    WorkflowInstance "1" --> "0..1" FanOutBatch : fan_out_job_id
    FanOutBatch "1" --> "N" FanOutRowRef : fan_out_job_id
    WorkflowInstance "N" --> "0..1" WorkflowInstance : parent_instance_id
```

### 6.2 MongoDB Indexes Required

```
// New indexes
workflow_instances: { parent_instance_id: 1, status: 1 }
workflow_instances: { fan_out_job_id: 1 }
workflow_instances: { record_id: 1, workflow_id: 1, org_id: 1 }  // enforces 1-record-1-instance

fan_out_batches: { fan_out_job_id: 1 }          // unique
fan_out_batches: { parent_instance_id: 1 }

fan_out_row_refs: { fan_out_job_id: 1, record_id: 1 }   // unique
fan_out_row_refs: { child_instance_id: 1 }
```

---

## 7. New Components

### 7.1 `fan_out` Node Handler

**File:** `app/shared_kernel/infrastructure/node_handlers/fan_out.py`

**Node config (set in canvas):**
```json
{
  "child_workflow_id": "wf_employee_payroll",
  "array_key": "employees",
  "record_id_key": "employee_id",
  "context_keys": ["employee_id", "name", "department", "salary"],
  "batch_size": 50,
  "completion_mode": "all_of"
}
```

**Execution logic:**

```mermaid
flowchart TD
    A[fan_out node called]
    B{array_key in context?}
    C[Read rows from context<br>or fan_out_row_refs collection]
    D[Create fan_out_batch doc<br>status: in_progress]
    E[Loop: create child instances<br>in batches of 50]
    F[Each child: insert_workflow_instance<br>with parent_instance_id, record_id,<br>fan_out_job_id, initial_context=row_data]
    G[Fire-and-forget: run_instance<br>asyncio.create_task per child batch]
    H[Write __wait_children to context<br>with fan_out_job_id]
    I[Return context → executor detects<br>__wait_children → pauses parent]

    A --> B
    B -->|Yes| C
    B -->|No| ERR[raise ValueError]
    C --> D
    D --> E
    E --> F
    F --> G
    G --> H
    H --> I
```

### 7.2 Child Completion Callback

**File:** `app/shared_kernel/infrastructure/fan_out_service.py`

Called from `_workflow_execution.py` at every instance terminal state transition.

```mermaid
flowchart TD
    A["Instance reaches terminal state<br>(completed / failed / cancelled)"]
    B{Has parent_instance_id<br>and fan_out_job_id?}
    C[Skip — not a child instance]
    D["findOneAndUpdate fan_out_batch<br>$inc: completed or failed<br>atomic — no race condition"]
    E{All children done?<br>completed + failed == total}
    F[Leave parent waiting]
    G[Resume parent instance<br>run_instance(parent_instance_id,<br>skip_current=True)]

    A --> B
    B -->|No| C
    B -->|Yes| D
    D --> E
    E -->|No| F
    E -->|Yes| G
```

### 7.3 Parent Executor — `__wait_children` Detection

**File:** `_workflow_executor.py` (extend existing wait detection block)

```python
# Existing pattern already handles __wait_approval, __wait_form
# Add:
if "__wait_children" in context:
    fan_out_job_id = context["__wait_children"].get("fan_out_job_id")
    await db.workflow_instances.update_one(
        {"instance_id": instance_id},
        {"$set": {"status": "waiting_for_children", "fan_out_job_id": fan_out_job_id}}
    )
    return  # parent is now paused
```

---

## 8. Sequence Flows

### 8.1 Full Fan-Out Lifecycle

```mermaid
sequenceDiagram
    actor User
    participant API
    participant ParentExec as Parent Executor<br/>_workflow_executor.py
    participant FanOut as fan_out Node<br/>fan_out.py
    participant DB as MongoDB
    participant ChildExec as Child Executor<br/>(async tasks)
    participant HITL as HITL System<br/>(existing)
    participant Callback as fan_out_service<br/>_on_child_completed()

    User->>API: POST /workflows/{id}/start<br>body: {csv_upload_id}
    API->>ParentExec: run_instance(P-001)
    ParentExec->>ParentExec: walk DAG nodes
    ParentExec->>FanOut: execute fan_out node
    FanOut->>DB: insert fan_out_batch<br>{total: 10000, completed: 0}
    FanOut->>DB: insert_workflow_instance × 10000<br>(in batches of 50)
    FanOut->>ChildExec: asyncio.create_task(run_instance)<br>× 10000 fire-and-forget
    FanOut-->>ParentExec: return context with __wait_children
    ParentExec->>DB: update parent status<br>→ waiting_for_children
    ParentExec-->>API: return {status: waiting_for_children}

    Note over ChildExec,HITL: Each child runs independently

    ChildExec->>DB: advance nodes, pause at HITL
    ChildExec->>HITL: create_tasks_for_pause()
    HITL-->>ChildExec: email sent to approver

    actor Manager
    Manager->>HITL: POST /public/wait/{token}
    HITL->>ChildExec: resume_instance_via_wait_token()
    ChildExec->>DB: child completes<br>status: completed

    ChildExec->>Callback: _on_child_completed(child_instance_id)
    Callback->>DB: findOneAndUpdate fan_out_batch<br>$inc completed

    Note over Callback,DB: Last child triggers parent resume

    Callback->>DB: all done? completed + failed == 10000
    Callback->>ParentExec: run_instance(P-001, skip_current=True)
    ParentExec->>DB: parent continues downstream nodes
    ParentExec->>DB: parent status → completed
```

### 8.2 Partial Failure Handling

```mermaid
flowchart TD
    FJ["fan_out_batch<br>total: 10000"]

    subgraph "completion_mode: all_of"
        A1[Wait until<br>completed + failed == total]
        A2[Parent resumes<br>with failed count in context]
    end

    subgraph "completion_mode: any"
        B1[Resume as soon as<br>first child completes]
    end

    subgraph "completion_mode: threshold"
        C1[Resume when<br>completed >= threshold%]
        C2[e.g. 95% → resume<br>even if 500 still running]
    end

    FJ --> A1
    FJ --> B1
    FJ --> C1
```

---

## 9. Effort Estimation

### Summary

| Work Item | Effort | Risk |
|---|---|---|
| Domain entity changes (`parent_instance_id`, `record_id`, `fan_out_job_id`) | 0.5 day | Low |
| Repository mapping updates | 0.5 day | Low |
| `fan_out_batches` collection + indexes | 0.5 day | Low |
| `fan_out.py` node handler | 2 days | Medium |
| `fan_out_service.py` — completion callback + parent resume | 2 days | Medium–High |
| `_workflow_executor.py` — `__wait_children` detection | 0.5 day | Low |
| `_workflow_execution.py` — hook child terminal transitions | 1 day | Medium |
| Registry registration | 0.5 day | Low |
| Large dataset: row ref storage (avoid 512KB context limit) | 1 day | Medium |
| Tests (unit + integration) | 2 days | Medium |
| **Total** | **~10.5 days** | |

### Effort Breakdown by Layer

```mermaid
gantt
    title Parent-Child Implementation Plan
    dateFormat  YYYY-MM-DD
    section Domain
    WorkflowInstance entity fields     :d1, 2024-01-01, 1d
    Repository mapping                 :d2, after d1, 1d
    section Infrastructure
    fan_out_batches collection + indexes :i1, after d2, 1d
    fan_out.py node handler              :i2, after i1, 2d
    fan_out_service.py callback          :i3, after i2, 2d
    section Executor
    __wait_children detection            :e1, after i3, 1d
    Child terminal hook                  :e2, after e1, 1d
    section Polish
    Large dataset row ref storage        :p1, after e2, 1d
    Tests                                :p2, after p1, 2d
```

---

## 10. Implementation Phases

### Phase 1 — Domain Foundation (1.5 days)
Extend `WorkflowInstance` with `parent_instance_id`, `record_id`, `fan_out_job_id`. Update repository mappers. Create MongoDB indexes. No behaviour change yet.

**Files:**
- `executions/domain/entities.py`
- `executions/infrastructure/adapters/driven/persistence/repository.py`
- DB migration script

### Phase 2 — Fan-Out Node (2.5 days)
Build `fan_out.py` handler and register it. Supports: `array_key`, `record_id_key`, `child_workflow_id`, `batch_size`, `completion_mode`. Writes `fan_out_batch` doc. Spawns children via `asyncio.create_task`. Returns `__wait_children` marker.

**Files:**
- `shared_kernel/infrastructure/node_handlers/fan_out.py` *(new)*
- `shared_kernel/infrastructure/node_handlers/registry.py`
- `workflows/infrastructure/adapters/driven/persistence/_workflow_executor.py`

### Phase 3 — Child Completion Callback (2 days)
Build `fan_out_service._on_child_completed()`. Hook it into the terminal state transitions of `run_instance()`. Atomically increment `fan_out_batch.completed` / `.failed`. When `completed + failed == total`, call `run_instance(parent_instance_id, skip_current=True)`.

**Files:**
- `shared_kernel/infrastructure/fan_out_service.py` *(new)*
- `workflows/infrastructure/adapters/driven/persistence/_workflow_execution.py`

### Phase 4 — Scale & Robustness (2 days)
Move large row sets out of context into `fan_out_row_refs` collection. Add APScheduler job to catch orphaned `waiting_for_children` parents whose batch counters stalled (e.g. due to crash mid-fan-out). Add `completion_mode: threshold` support.

### Phase 5 — Tests (2 days)
- Unit: `fan_out.py` handler with mocked DB
- Integration: Parent → 5 children → all complete → parent resumes
- Edge cases: child crash, partial failure, duplicate callback

---

## 11. Constraints and Risks

### Scale Constraints

| Constraint | Current Limit | Required for 10k Children |
|---|---|---|
| `for_each` hard cap | 1,000 iterations | Not used in new approach — `fan_out` bypasses it |
| Context size | 512KB | Row data stored in `fan_out_row_refs`, not in context |
| `_MAX_STEPS` per instance | 100 nodes | Each child is independent — not affected |
| MongoDB `workflow_instances` | No cap | Index on `parent_instance_id` required for query performance |
| `asyncio.create_task` flood | No internal cap | Batch creation in groups of 50 prevents task queue explosion |

### Architectural Risks

```mermaid
graph TD
    R1["Risk: asyncio task flood<br>10,000 create_task calls at once"]
    R2["Risk: parent resume race<br>two children complete simultaneously<br>both trigger resume"]
    R3["Risk: orphaned waiting_for_children<br>parent stalls if callback crashes mid-batch"]
    R4["Risk: child context bloat<br>full parent context copied to each child"]

    M1["Mitigation: batch creation<br>groups of 50 with asyncio.sleep(0)<br>between batches"]
    M2["Mitigation: atomic findOneAndUpdate<br>only triggers resume when counter<br>hits exact total — idempotent"]
    M3["Mitigation: APScheduler job<br>scan waiting_for_children older than<br>N minutes, recheck batch counter"]
    M4["Mitigation: context_keys config<br>fan_out node only copies listed keys<br>to child context, not full parent context"]

    R1 --> M1
    R2 --> M2
    R3 --> M3
    R4 --> M4
```

### What This Pattern Does NOT Change

- The existing `sub_workflow` node is unchanged — it remains for single, synchronous, non-HITL child calls.
- The existing HITL system in children is entirely reused — children pause, get HITL tasks, resume via public wait tokens exactly as they do today.
- The parent-child link is purely via `parent_instance_id` — there is no LangGraph subgraph nesting or checkpoint sharing.
- No changes to the public API shape — fan-out is an internal node execution detail.
