import { useState } from "react";

const TOP_ITEM = {
  id: "top-1",
  dept: "PRODUCT",
  title: "Checkout redesign ships Thursday — two days behind schedule",
  rationale:
    "The team hit an integration issue with the payments provider late last week. Shipping on time means cutting the saved-cart recovery feature; shipping complete means slipping two days. Given the stated priority this quarter, the safer call is the short delay — the cut feature carries more downstream risk than a two-day slip.",
  policy: "Checked against: Q3 Company Priority — Reliability over speed",
  sources: "Based on: 3 GoodDay tickets, 1 Outlook thread (product-launch@)",
  impact: 92,
  confidence: 81,
};

const SECONDARY_ITEMS = [
  {
    id: "sec-1",
    dept: "FINANCE",
    summary: "Acme Corp contract renewal is 12 days overdue — Q3 revenue target at risk",
    impact: 74,
    detail:
      "The renewal was expected to close by the 12th. No signature yet, and the account team's last note was six days ago. If this slips into next quarter, the Q3 revenue number is short by roughly the contract's value.",
    policy: "Checked against: Q3 Revenue Target — Board Commitment",
    sources: "Based on: 1 mocked Finance signal (demo data)",
  },
  {
    id: "sec-2",
    dept: "OPERATIONS",
    summary: "Support ticket backlog up 18% this week — no SLA breach yet",
    impact: 51,
    detail:
      "Volume increase looks tied to the same checkout issue causing the Product delay. Worth watching, not yet urgent — no SLA breach has occurred and staffing can absorb another week at this rate.",
    policy: "Checked against: Customer Response Time SLA",
    sources: "Based on: 1 mocked Operations signal (demo data)",
  },
];

const PO_TASKS = [
  { id: "po-1", title: "Payments provider integration fix", status: "At risk", updated: "2h ago" },
  { id: "po-2", title: "Saved-cart recovery — scope decision pending", status: "Blocked", updated: "40m ago" },
  { id: "po-3", title: "Checkout QA pass", status: "On track", updated: "1d ago" },
  { id: "po-4", title: "Mobile checkout polish", status: "On track", updated: "2d ago" },
];

const STATUS_COLOR = { "On track": "var(--confirm)", "At risk": "var(--amber)", Blocked: "var(--risk)" };

function ImpactMeter({ value, size = "large" }) {
  const band = value >= 80 ? "var(--amber)" : value >= 60 ? "var(--steel)" : "var(--steel)";
  return (
    <div className={size === "large" ? "impact-block" : "impact-block-mini"}>
      <span className={size === "large" ? "impact-number" : "impact-number-mini"}>{value}</span>
      {size === "large" && <span className="impact-label">IMPACT</span>}
    </div>
  );
}

function DeptTag({ dept }) {
  return <span className="dept-tag">{dept}</span>;
}

function DecisionPanel({ item }) {
  const [decision, setDecision] = useState(null); // 'approved' | 'reject-pending' | 'disagree-pending' | 'rejected' | 'disagreed'
  const [reason, setReason] = useState("");
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (decision === "approved") {
    return <div className="decision-line decision-confirm">✓ Approved by you · {timeStr}</div>;
  }
  if (decision === "rejected") {
    return (
      <div className="decision-line decision-reject">
        ✕ Rejected by you · {timeStr}
        <div className="decision-reason">“{reason}”</div>
      </div>
    );
  }
  if (decision === "disagreed") {
    return (
      <div className="decision-line decision-disagree">
        ⟲ Flagged as disagreement · {timeStr}
        <div className="decision-reason">“{reason}”</div>
      </div>
    );
  }

  if (decision === "reject-pending" || decision === "disagree-pending") {
    const isReject = decision === "reject-pending";
    return (
      <div className="reason-panel">
        <label className="reason-label">
          {isReject ? "Why are you rejecting this?" : "What do you see differently?"}
        </label>
        <textarea
          className="reason-input"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Required — a reason is recorded with every decision"
        />
        <div className="action-row">
          <button
            className="btn btn-ghost"
            onClick={() => {
              setDecision(null);
              setReason("");
            }}
          >
            Cancel
          </button>
          <button
            className={isReject ? "btn btn-reject" : "btn btn-disagree"}
            disabled={reason.trim().length === 0}
            onClick={() => setDecision(isReject ? "rejected" : "disagreed")}
          >
            Confirm {isReject ? "rejection" : "disagreement"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="action-row">
      <button className="btn btn-approve" onClick={() => setDecision("approved")}>
        Approve
      </button>
      <button className="btn btn-reject-outline" onClick={() => setDecision("reject-pending")}>
        Reject
      </button>
      <button className="btn btn-disagree-outline" onClick={() => setDecision("disagree-pending")}>
        Disagree
      </button>
    </div>
  );
}

function SecondaryRow({ item, rank }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="secondary-item">
      <button className="secondary-row" onClick={() => setOpen(!open)}>
        <span className="rank-index">#{rank}</span>
        <DeptTag dept={item.dept} />
        <span className="secondary-summary">{item.summary}</span>
        <ImpactMeter value={item.impact} size="mini" />
      </button>
      {open && (
        <div className="secondary-detail">
          <p className="item-rationale">{item.detail}</p>
          <div className="policy-line">{item.policy}</div>
          <div className="source-line">{item.sources}</div>
          <DecisionPanel item={item} />
        </div>
      )}
    </div>
  );
}

function CeoView() {
  return (
    <>
      <div className="eyebrow">DAILY BRIEFING · MONDAY, JULY 24</div>
      <h1 className="headline">One thing needs your attention today.</h1>

      <div className="priority-card">
        <div className="tag-row">
          <DeptTag dept={TOP_ITEM.dept} />
          <span className="confidence-note">{TOP_ITEM.confidence}% confidence</span>
        </div>
        <div className="priority-top">
          <div className="priority-text">
            <h2 className="item-title">{TOP_ITEM.title}</h2>
            <p className="item-rationale">{TOP_ITEM.rationale}</p>
            <div className="policy-line">{TOP_ITEM.policy}</div>
            <div className="source-line">{TOP_ITEM.sources}</div>
          </div>
          <ImpactMeter value={TOP_ITEM.impact} size="large" />
        </div>
        <DecisionPanel item={TOP_ITEM} />
      </div>

      <div className="secondary-section-title">Also on the radar</div>
      <div className="secondary-list">
        {SECONDARY_ITEMS.map((item, i) => (
          <SecondaryRow key={item.id} item={item} rank={i + 2} />
        ))}
      </div>

      <div className="sources-strip">
        <span>
          <i className="dot dot-live" /> Product — live (GoodDay + Outlook)
        </span>
        <span>
          <i className="dot dot-demo" /> Finance — demo data
        </span>
        <span>
          <i className="dot dot-demo" /> Operations — demo data
        </span>
        <span>
          <i className="dot dot-excluded" /> HR — excluded this phase
        </span>
      </div>
    </>
  );
}

function ProductOwnerView() {
  return (
    <>
      <div className="eyebrow">PRODUCT · DAILY QUEUE · MONDAY, JULY 24</div>
      <h1 className="headline">Your team's open items.</h1>
      <div className="po-list">
        {PO_TASKS.map((t) => (
          <div className="po-row" key={t.id}>
            <span className="po-status-dot" style={{ background: STATUS_COLOR[t.status] }} />
            <span className="po-title">{t.title}</span>
            <span className="po-status-label">{t.status}</span>
            <span className="po-updated">{t.updated}</span>
          </div>
        ))}
      </div>
      <div className="sources-strip">
        <span>
          <i className="dot dot-live" /> Scoped to Product only — cross-department data isn't visible from this view
        </span>
      </div>
    </>
  );
}

export default function ChiefOfStaffApp() {
  const [persona, setPersona] = useState("ceo");

  return (
    <div className="cos-app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600;8..60,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');

        .cos-app {
          --ink: #14202E;
          --ink-soft: #2C3742;
          --paper: #FAFAF8;
          --paper-2: #F3F2ED;
          --steel: #5C6B7A;
          --hairline: #DDE2E6;
          --amber: #C17F2A;
          --confirm: #3F6B4F;
          --risk: #8C3B33;
          background: var(--paper);
          color: var(--ink);
          min-height: 100vh;
          font-family: 'IBM Plex Sans', sans-serif;
        }
        .cos-app * { box-sizing: border-box; }
        @media (prefers-reduced-motion: reduce) {
          .cos-app * { transition: none !important; }
        }

        .topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 32px; border-bottom: 1px solid var(--hairline);
        }
        .wordmark {
          font-family: 'Source Serif 4', serif; font-weight: 600; font-size: 18px;
          letter-spacing: 0.02em; color: var(--ink);
        }
        .wordmark span { color: var(--steel); font-weight: 500; }
        .persona-switch { display: flex; border: 1px solid var(--hairline); border-radius: 4px; overflow: hidden; }
        .persona-switch button {
          background: transparent; border: none; padding: 8px 16px; font-family: 'IBM Plex Sans';
          font-size: 13px; letter-spacing: 0.02em; color: var(--steel); cursor: pointer;
        }
        .persona-switch button.active { background: var(--ink); color: var(--paper); }
        .persona-switch button:focus-visible { outline: 2px solid var(--amber); outline-offset: -2px; }
        .persona-switch button:not(.active):hover { background: var(--paper-2); }

        .main { max-width: 760px; margin: 0 auto; padding: 44px 24px 90px; }

        .eyebrow {
          font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.09em;
          text-transform: uppercase; color: var(--steel); margin-bottom: 10px;
        }
        .headline {
          font-family: 'Source Serif 4', serif; font-size: 32px; font-weight: 600;
          line-height: 1.25; margin: 0 0 32px; color: var(--ink);
        }

        .priority-card {
          border: 1px solid var(--hairline); border-left: 4px solid var(--amber);
          padding: 28px 30px; margin-bottom: 44px; background: var(--paper);
        }
        .tag-row { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
        .dept-tag {
          font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.07em;
          text-transform: uppercase; border: 1px solid var(--steel); color: var(--steel);
          padding: 3px 8px; display: inline-block;
        }
        .confidence-note {
          font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--steel);
        }
        .priority-top { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
        .priority-text { flex: 1; min-width: 0; }
        .item-title {
          font-family: 'Source Serif 4', serif; font-size: 22px; font-weight: 600;
          margin: 0 0 12px; color: var(--ink); line-height: 1.35;
        }
        .item-rationale {
          font-size: 15px; line-height: 1.65; color: var(--ink-soft); margin: 0 0 16px; max-width: 58ch;
        }
        .policy-line {
          font-size: 13px; color: var(--steel); border-left: 2px solid var(--hairline);
          padding-left: 10px; margin-bottom: 10px;
        }
        .source-line {
          font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; color: var(--steel); margin-bottom: 22px;
        }

        .impact-block { text-align: right; flex-shrink: 0; }
        .impact-number {
          font-family: 'IBM Plex Mono', monospace; font-size: 42px; font-weight: 600;
          color: var(--ink); line-height: 1; display: block;
        }
        .impact-label {
          font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; letter-spacing: 0.08em;
          color: var(--steel);
        }
        .impact-block-mini { flex-shrink: 0; width: 36px; text-align: right; }
        .impact-number-mini {
          font-family: 'IBM Plex Mono', monospace; font-size: 16px; font-weight: 600; color: var(--ink);
        }

        .action-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 4px; }
        .btn {
          font-family: 'IBM Plex Sans'; font-size: 13.5px; font-weight: 500;
          padding: 9px 16px; border-radius: 3px; border: 1px solid; cursor: pointer;
          background: transparent; letter-spacing: 0.01em;
        }
        .btn:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
        .btn-approve { background: var(--confirm); border-color: var(--confirm); color: white; }
        .btn-approve:hover { background: #345a41; }
        .btn-reject-outline { border-color: var(--hairline); color: var(--risk); }
        .btn-reject-outline:hover { border-color: var(--risk); background: #FBF1EF; }
        .btn-disagree-outline { border-color: var(--hairline); color: var(--steel); }
        .btn-disagree-outline:hover { background: var(--paper-2); }
        .btn-ghost { border-color: transparent; color: var(--steel); }
        .btn-reject { background: var(--risk); border-color: var(--risk); color: white; }
        .btn-disagree { background: var(--steel); border-color: var(--steel); color: white; }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .reason-panel { margin-top: 14px; border: 1px solid var(--hairline); padding: 14px; background: var(--paper-2); }
        .reason-label { display: block; font-size: 12.5px; color: var(--steel); margin-bottom: 8px; }
        .reason-input {
          width: 100%; font-family: 'IBM Plex Sans'; font-size: 13.5px; padding: 8px;
          border: 1px solid var(--hairline); resize: vertical; margin-bottom: 10px; background: var(--paper);
        }

        .decision-line {
          font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; margin-top: 6px;
        }
        .decision-confirm { color: var(--confirm); }
        .decision-reject { color: var(--risk); }
        .decision-disagree { color: var(--steel); }
        .decision-reason { font-family: 'IBM Plex Sans'; color: var(--ink-soft); font-size: 13px; margin-top: 4px; font-style: italic; }

        .secondary-section-title {
          font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.08em;
          text-transform: uppercase; color: var(--steel); margin: 0 0 4px;
          border-top: 1px solid var(--hairline); padding-top: 28px;
        }
        .secondary-list { margin-bottom: 8px; }
        .secondary-item { border-bottom: 1px solid var(--hairline); }
        .secondary-row {
          width: 100%; display: flex; align-items: center; gap: 16px; padding: 16px 0;
          background: transparent; border: none; cursor: pointer; text-align: left;
        }
        .secondary-row:focus-visible { outline: 2px solid var(--amber); outline-offset: -2px; }
        .secondary-row:hover .secondary-summary { color: var(--ink); }
        .rank-index { font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: var(--steel); width: 22px; }
        .secondary-summary { flex: 1; font-size: 14.5px; color: var(--ink-soft); }
        .secondary-detail { padding: 0 0 22px 38px; }

        .sources-strip {
          margin-top: 40px; padding-top: 18px; border-top: 1px solid var(--hairline);
          font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; color: var(--steel);
          display: flex; gap: 20px; flex-wrap: wrap;
        }
        .sources-strip span { display: flex; align-items: center; gap: 6px; }
        .dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
        .dot-live { background: var(--confirm); }
        .dot-demo { background: var(--steel); }
        .dot-excluded { background: var(--risk); }

        .po-list { border-top: 1px solid var(--hairline); }
        .po-row {
          display: flex; align-items: center; gap: 14px; padding: 16px 0; border-bottom: 1px solid var(--hairline);
        }
        .po-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .po-title { flex: 1; font-size: 15px; color: var(--ink); }
        .po-status-label {
          font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; letter-spacing: 0.05em;
          text-transform: uppercase; color: var(--steel);
        }
        .po-updated { font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; color: var(--steel); width: 64px; text-align: right; }

        @media (max-width: 560px) {
          .priority-top { flex-direction: column; }
          .impact-block { text-align: left; }
          .headline { font-size: 26px; }
        }
      `}</style>

      <div className="topbar">
        <div className="wordmark">
          CHIEF OF STAFF <span>· Product</span>
        </div>
        <div className="persona-switch">
          <button className={persona === "ceo" ? "active" : ""} onClick={() => setPersona("ceo")}>
            CEO view
          </button>
          <button className={persona === "po" ? "active" : ""} onClick={() => setPersona("po")}>
            Product Owner view
          </button>
        </div>
      </div>

      <div className="main">{persona === "ceo" ? <CeoView /> : <ProductOwnerView />}</div>
    </div>
  );
}
