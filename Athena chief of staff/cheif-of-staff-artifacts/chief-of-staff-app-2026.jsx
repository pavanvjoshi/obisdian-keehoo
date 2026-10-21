import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Search, Sun, Moon, Sparkles } from "lucide-react";

const TOP_ITEM = {
  id: "top-1",
  dept: "Product",
  deptColor: "blue",
  title: "Checkout redesign ships Thursday — two days behind schedule",
  rationale:
    "The team hit an integration issue with the payments provider late last week. Shipping on time means cutting the saved-cart recovery feature; shipping complete means slipping two days. Given the stated priority this quarter, the safer call is the short delay — the cut feature carries more downstream risk than a two-day slip.",
  policy: "Checked against: Q3 Company Priority — Reliability over speed",
  sources: "Based on 3 GoodDay tickets + 1 Outlook thread",
  impact: 92,
  confidence: 81,
};

const SECONDARY_ITEMS = [
  {
    id: "sec-1",
    dept: "Finance",
    deptColor: "violet",
    summary: "Acme Corp contract renewal is 12 days overdue — Q3 revenue target at risk",
    impact: 74,
    detail:
      "The renewal was expected to close by the 12th. No signature yet, and the account team's last note was six days ago. If this slips into next quarter, the Q3 revenue number is short by roughly the contract's value.",
    policy: "Checked against: Q3 Revenue Target — Board Commitment",
    sources: "Based on 1 mocked Finance signal (demo data)",
  },
  {
    id: "sec-2",
    dept: "Operations",
    deptColor: "teal",
    summary: "Support ticket backlog up 18% this week — no SLA breach yet",
    impact: 51,
    detail:
      "Volume increase looks tied to the same checkout issue causing the Product delay. Worth watching, not yet urgent — no SLA breach has occurred and staffing can absorb another week at this rate.",
    policy: "Checked against: Customer Response Time SLA",
    sources: "Based on 1 mocked Operations signal (demo data)",
  },
];

const PO_TASKS = [
  { id: "po-1", title: "Payments provider integration fix", status: "At risk", updated: "2h ago" },
  { id: "po-2", title: "Saved-cart recovery — scope decision pending", status: "Blocked", updated: "40m ago" },
  { id: "po-3", title: "Checkout QA pass", status: "On track", updated: "1d ago" },
  { id: "po-4", title: "Mobile checkout polish", status: "On track", updated: "2d ago" },
];

const HISTORY = [
  { id: "h1", label: "Yesterday — Payment gateway delay", resolvedOn: "Jul 23, 4:12 PM", decision: "Approved" },
  { id: "h2", label: "Jul 18 — Finance quarter close variance", resolvedOn: "Jul 18, 11:02 AM", decision: "Approved" },
  { id: "h3", label: "Jul 12 — Support backlog spike", resolvedOn: "Jul 12, 9:45 AM", decision: "Disagreed" },
];

const STATUS_COLOR = { "On track": "var(--confirm)", "At risk": "var(--accent)", Blocked: "var(--risk)" };
const DEPT_DOT = { blue: "#4C6FD6", violet: "#B45CC2", teal: "#1D9A9A" };

function ImpactRing({ value, size = 68 }) {
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 80 ? "var(--accent)" : "var(--text-secondary)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="var(--card-border)" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
      <text
        x="50%"
        y="52%"
        textAnchor="middle"
        dy="0.35em"
        fontFamily="'IBM Plex Mono', monospace"
        fontWeight="600"
        fontSize={size * 0.28}
        fill="var(--text-primary)"
      >
        {value}
      </text>
    </svg>
  );
}

function DeptPill({ dept, color }) {
  return (
    <span className={`dept-pill dept-${color}`}>
      <span className="dept-dot" style={{ background: DEPT_DOT[color] }} />
      {dept}
    </span>
  );
}

function DecisionPanel() {
  const [decision, setDecision] = useState(null);
  const [reason, setReason] = useState("");
  const timeStr = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (decision === "approved") return <div className="decision-line decision-confirm">✓ Approved · {timeStr}</div>;
  if (decision === "rejected")
    return (
      <div className="decision-line decision-reject">
        ✕ Rejected · {timeStr}
        <div className="decision-reason">“{reason}”</div>
      </div>
    );
  if (decision === "disagreed")
    return (
      <div className="decision-line decision-disagree">
        ⟲ Flagged as disagreement · {timeStr}
        <div className="decision-reason">“{reason}”</div>
      </div>
    );

  if (decision === "reject-pending" || decision === "disagree-pending") {
    const isReject = decision === "reject-pending";
    return (
      <div className="reason-panel">
        <label className="reason-label">{isReject ? "Why are you rejecting this?" : "What do you see differently?"}</label>
        <textarea
          className="reason-input"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Required — a reason is recorded with every decision"
        />
        <div className="action-row">
          <button className="btn btn-ghost" onClick={() => { setDecision(null); setReason(""); }}>Cancel</button>
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
      <button className="btn btn-approve" onClick={() => setDecision("approved")}>Approve</button>
      <button className="btn btn-outline-reject" onClick={() => setDecision("reject-pending")}>Reject</button>
      <button className="btn btn-outline-disagree" onClick={() => setDecision("disagree-pending")}>Disagree</button>
    </div>
  );
}

function SecondaryRow({ item, rank }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="secondary-card">
      <button className="secondary-row" onClick={() => setOpen(!open)}>
        <span className="rank-index">{rank}</span>
        <DeptPill dept={item.dept} color={item.deptColor} />
        <span className="secondary-summary">{item.summary}</span>
        <ImpactRing value={item.impact} size={40} />
      </button>
      {open && (
        <div className="secondary-detail">
          <p className="item-rationale">{item.detail}</p>
          <div className="policy-line">{item.policy}</div>
          <div className="source-line">{item.sources}</div>
          <DecisionPanel />
        </div>
      )}
    </div>
  );
}

function CeoView() {
  return (
    <>
      <div className="priority-card">
        <div className="priority-card-top">
          <div className="tag-row">
            <DeptPill dept={TOP_ITEM.dept} color={TOP_ITEM.deptColor} />
            <span className="confidence-note">{TOP_ITEM.confidence}% confidence</span>
          </div>
          <ImpactRing value={TOP_ITEM.impact} size={68} />
        </div>
        <h2 className="item-title">{TOP_ITEM.title}</h2>
        <p className="item-rationale">{TOP_ITEM.rationale}</p>
        <div className="policy-line">{TOP_ITEM.policy}</div>
        <div className="source-line">{TOP_ITEM.sources}</div>
        <DecisionPanel />
      </div>

      <div className="section-label">Also on the radar</div>
      <div className="secondary-list">
        {SECONDARY_ITEMS.map((item, i) => (
          <SecondaryRow key={item.id} item={item} rank={i + 2} />
        ))}
      </div>

      <div className="sources-strip">
        <span><i className="dot dot-live" /> Product — live</span>
        <span><i className="dot dot-demo" /> Finance — demo data</span>
        <span><i className="dot dot-demo" /> Operations — demo data</span>
        <span><i className="dot dot-excluded" /> HR — excluded this phase</span>
      </div>
    </>
  );
}

function ProductOwnerView() {
  return (
    <>
      <div className="po-card">
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
        <span><i className="dot dot-live" /> Scoped to Product only — other departments aren't visible from this view</span>
      </div>
    </>
  );
}

function ArchivedView({ item }) {
  return (
    <div className="priority-card archived">
      <div className="tag-row">
        <span className={`decision-badge badge-${item.decision.toLowerCase()}`}>{item.decision}</span>
      </div>
      <h2 className="item-title">{item.label}</h2>
      <p className="item-rationale">Resolved on {item.resolvedOn}. This briefing is read-only — decisions can't be changed after the fact, only reviewed.</p>
    </div>
  );
}

export default function ChiefOfStaffApp() {
  const [persona, setPersona] = useState("ceo");
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState("light");
  const [accountOpen, setAccountOpen] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState(null);

  const activeHistory = HISTORY.find((h) => h.id === selectedHistory);
  const title = selectedHistory ? "Archived Briefing" : persona === "ceo" ? "Today's Briefing" : "Product Queue";

  return (
    <div className="app" data-theme={theme}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');

        .app { --font: 'Inter', -apple-system, sans-serif; }
        .app, .app * { box-sizing: border-box; font-family: var(--font); }
        @media (prefers-reduced-motion: reduce) { .app * { transition: none !important; } }

        .app[data-theme="light"] {
          --sidebar-bg: #F9F9F9; --sidebar-text: #1A1A1E; --sidebar-text-muted: #6E6E7A;
          --sidebar-active-bg: rgba(0,0,0,0.05); --sidebar-border: #E9E9EA;
          --canvas-bg: #FFFFFF; --card-bg: #FFFFFF; --card-border: #E9E9EA;
          --text-primary: #1A1A1E; --text-secondary: #6B6B76;
        }
        .app[data-theme="dark"] {
          --sidebar-bg: #171717; --sidebar-text: #ECECEC; --sidebar-text-muted: #9A9AA5;
          --sidebar-active-bg: rgba(255,255,255,0.08); --sidebar-border: rgba(255,255,255,0.08);
          --canvas-bg: #0E0F13; --card-bg: #1A1B20; --card-border: rgba(255,255,255,0.09);
          --text-primary: #F2F2F3; --text-secondary: #9A9AA5;
        }
        .app {
          --accent: #E8A33D; --accent-soft: #FBEBD2; --confirm: #2F9E5B; --risk: #E0473A;
          display: flex; height: 100vh; overflow: hidden;
        }

        .sidebar {
          width: 272px; background: var(--sidebar-bg); border-right: 1px solid var(--sidebar-border);
          display: flex; flex-direction: column; flex-shrink: 0; transition: width 0.18s ease;
          padding: 14px 12px;
        }
        .sidebar.collapsed { width: 0; padding: 0; overflow: hidden; border-right: none; }

        .sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: 6px 6px 16px; }
        .brand { display: flex; align-items: center; gap: 8px; }
        .brand-mark { width: 20px; height: 20px; border-radius: 6px; background: var(--accent); flex-shrink: 0; }
        .brand-name { font-size: 14px; font-weight: 600; color: var(--sidebar-text); white-space: nowrap; }

        .icon-btn {
          width: 30px; height: 30px; border-radius: 8px; border: none; background: transparent;
          color: var(--sidebar-text-muted); display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .icon-btn:hover { background: var(--sidebar-active-bg); }
        .icon-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

        .nav-primary {
          display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
          padding: 9px 10px; border-radius: 8px; border: none; background: var(--sidebar-active-bg);
          color: var(--sidebar-text); font-size: 13.5px; font-weight: 500; cursor: pointer; margin-bottom: 18px;
        }
        .nav-primary:hover { background: var(--sidebar-active-bg); }

        .section-nav-label {
          font-size: 11px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
          color: var(--sidebar-text-muted); padding: 4px 10px; margin-top: 6px;
        }
        .history-item, .dept-item {
          display: flex; align-items: center; gap: 9px; width: 100%; text-align: left;
          padding: 8px 10px; border-radius: 8px; border: none; background: transparent;
          color: var(--sidebar-text-muted); font-size: 13px; cursor: pointer;
        }
        .history-item:hover, .dept-item:hover:not(.disabled) { background: var(--sidebar-active-bg); color: var(--sidebar-text); }
        .history-item.active { background: var(--sidebar-active-bg); color: var(--sidebar-text); }
        .history-item span:last-child, .dept-item span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .history-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--sidebar-text-muted); flex-shrink: 0; }
        .dept-item.disabled { cursor: default; color: var(--sidebar-text-muted); opacity: 0.55; }
        .demo-tag {
          font-size: 9.5px; font-weight: 600; letter-spacing: 0.03em; text-transform: uppercase;
          background: var(--sidebar-active-bg); padding: 1px 5px; border-radius: 4px; margin-left: auto;
        }

        .sidebar-footer { margin-top: auto; position: relative; }
        .account-chip {
          display: flex; align-items: center; gap: 9px; width: 100%; padding: 8px; border-radius: 9px;
          border: none; background: transparent; cursor: pointer;
        }
        .account-chip:hover { background: var(--sidebar-active-bg); }
        .avatar {
          width: 26px; height: 26px; border-radius: 50%; background: var(--accent); color: #1A1A1E;
          font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .account-info { display: flex; flex-direction: column; align-items: flex-start; overflow: hidden; }
        .account-name { font-size: 12.5px; font-weight: 600; color: var(--sidebar-text); }
        .account-role { font-size: 11px; color: var(--sidebar-text-muted); }
        .account-chip svg { margin-left: auto; color: var(--sidebar-text-muted); flex-shrink: 0; }

        .account-menu {
          position: absolute; bottom: calc(100% + 6px); left: 0; right: 0; background: var(--card-bg);
          border: 1px solid var(--card-border); border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.12);
          padding: 5px; z-index: 10;
        }
        .account-menu button {
          width: 100%; text-align: left; padding: 8px 10px; border-radius: 7px; border: none;
          background: transparent; font-size: 13px; color: var(--text-primary); cursor: pointer;
        }
        .account-menu button:hover { background: var(--sidebar-active-bg); }

        .canvas { flex: 1; background: var(--canvas-bg); display: flex; flex-direction: column; overflow-y: auto; min-width: 0; }
        .topbar {
          display: flex; align-items: center; gap: 12px; padding: 16px 28px; border-bottom: 1px solid var(--card-border);
          flex-shrink: 0;
        }
        .topbar-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
        .topbar-actions { margin-left: auto; display: flex; align-items: center; gap: 10px; }
        .search-pill {
          display: flex; align-items: center; gap: 8px; padding: 7px 12px; border-radius: 20px;
          border: 1px solid var(--card-border); color: var(--text-secondary); font-size: 12.5px;
        }
        .search-pill kbd {
          font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; background: var(--sidebar-active-bg);
          padding: 1px 5px; border-radius: 4px; color: var(--text-secondary);
        }

        .content { max-width: 760px; width: 100%; margin: 0 auto; padding: 32px 28px 80px; }

        .priority-card {
          background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 18px;
          padding: 26px 28px; margin-bottom: 32px; box-shadow: 0 1px 2px rgba(0,0,0,0.03), 0 6px 20px rgba(0,0,0,0.05);
        }
        .priority-card-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; }
        .tag-row { display: flex; align-items: center; gap: 10px; }
        .confidence-note { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--text-secondary); }

        .dept-pill {
          display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500;
          padding: 4px 10px 4px 8px; border-radius: 20px;
        }
        .dept-dot { width: 6px; height: 6px; border-radius: 50%; }
        .dept-blue { background: rgba(76,111,214,0.12); color: #4C6FD6; }
        .dept-violet { background: rgba(180,92,194,0.12); color: #B45CC2; }
        .dept-teal { background: rgba(29,154,154,0.12); color: #1D9A9A; }

        .item-title { font-size: 20px; font-weight: 600; margin: 4px 0 12px; color: var(--text-primary); line-height: 1.4; }
        .item-rationale { font-size: 14.5px; line-height: 1.65; color: var(--text-secondary); margin: 0 0 14px; max-width: 58ch; }
        .policy-line { font-size: 13px; color: var(--text-secondary); border-left: 2px solid var(--card-border); padding-left: 10px; margin-bottom: 8px; }
        .source-line { font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; color: var(--text-secondary); margin-bottom: 20px; }

        .action-row { display: flex; gap: 9px; flex-wrap: wrap; }
        .btn {
          font-size: 13.5px; font-weight: 500; padding: 9px 16px; border-radius: 10px; border: 1px solid;
          cursor: pointer; background: transparent;
        }
        .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .btn-approve { background: var(--confirm); border-color: var(--confirm); color: white; }
        .btn-approve:hover { filter: brightness(0.93); }
        .btn-outline-reject { border-color: var(--card-border); color: var(--risk); }
        .btn-outline-reject:hover { background: rgba(224,71,58,0.08); }
        .btn-outline-disagree { border-color: var(--card-border); color: var(--text-secondary); }
        .btn-outline-disagree:hover { background: var(--sidebar-active-bg); }
        .btn-ghost { border-color: transparent; color: var(--text-secondary); }
        .btn-reject { background: var(--risk); border-color: var(--risk); color: white; }
        .btn-disagree { background: var(--text-secondary); border-color: var(--text-secondary); color: white; }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .reason-panel { margin-top: 12px; border: 1px solid var(--card-border); border-radius: 12px; padding: 14px; background: var(--canvas-bg); }
        .reason-label { display: block; font-size: 12.5px; color: var(--text-secondary); margin-bottom: 8px; }
        .reason-input {
          width: 100%; font-family: var(--font); font-size: 13.5px; padding: 9px; border-radius: 8px;
          border: 1px solid var(--card-border); resize: vertical; margin-bottom: 10px; background: var(--card-bg); color: var(--text-primary);
        }

        .decision-line { font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; }
        .decision-confirm { color: var(--confirm); }
        .decision-reject { color: var(--risk); }
        .decision-disagree { color: var(--text-secondary); }
        .decision-reason { font-family: var(--font); color: var(--text-secondary); font-size: 13px; margin-top: 4px; font-style: italic; }

        .decision-badge { font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 20px; }
        .badge-approved { background: rgba(47,158,91,0.12); color: var(--confirm); }
        .badge-disagreed { background: var(--sidebar-active-bg); color: var(--text-secondary); }

        .section-label { font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-secondary); margin: 0 0 12px; }

        .secondary-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
        .secondary-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 14px; overflow: hidden; }
        .secondary-row {
          width: 100%; display: flex; align-items: center; gap: 14px; padding: 14px 16px;
          background: transparent; border: none; cursor: pointer; text-align: left;
        }
        .secondary-row:hover { background: var(--sidebar-active-bg); }
        .rank-index { font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; color: var(--text-secondary); width: 16px; }
        .secondary-summary { flex: 1; font-size: 14px; color: var(--text-primary); }
        .secondary-detail { padding: 0 18px 20px 46px; }

        .sources-strip {
          margin-top: 28px; display: flex; gap: 16px; flex-wrap: wrap; font-family: 'IBM Plex Mono', monospace;
          font-size: 11px; color: var(--text-secondary);
        }
        .sources-strip span { display: flex; align-items: center; gap: 6px; }
        .dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
        .dot-live { background: var(--confirm); }
        .dot-demo { background: var(--text-secondary); }
        .dot-excluded { background: var(--risk); }

        .po-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 18px; overflow: hidden; }
        .po-row { display: flex; align-items: center; gap: 14px; padding: 15px 20px; border-bottom: 1px solid var(--card-border); }
        .po-row:last-child { border-bottom: none; }
        .po-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .po-title { flex: 1; font-size: 14.5px; color: var(--text-primary); }
        .po-status-label { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--text-secondary); text-transform: uppercase; }
        .po-updated { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--text-secondary); width: 56px; text-align: right; }

        .archived { opacity: 0.95; }
      `}</style>

      <aside className={collapsed ? "sidebar collapsed" : "sidebar"}>
        <div className="sidebar-header">
          <div className="brand"><span className="brand-mark" /><span className="brand-name">Chief of Staff</span></div>
          <button className="icon-btn" onClick={() => setCollapsed(true)} aria-label="Collapse sidebar"><ChevronLeft size={16} /></button>
        </div>

        <button className="nav-primary" onClick={() => setSelectedHistory(null)}>
          <Sparkles size={15} /><span>Today's Briefing</span>
        </button>

        <div className="section-nav-label">Recent</div>
        {HISTORY.map((h) => (
          <button
            key={h.id}
            className={selectedHistory === h.id ? "history-item active" : "history-item"}
            onClick={() => setSelectedHistory(h.id)}
          >
            <span className="history-dot" /><span>{h.label}</span>
          </button>
        ))}

        <div className="section-nav-label">Departments</div>
        <button className="dept-item" onClick={() => { setPersona("po"); setSelectedHistory(null); }}>
          <span className="history-dot" style={{ background: DEPT_DOT.blue }} /><span>Product</span>
        </button>
        <div className="dept-item disabled"><span className="history-dot" style={{ background: DEPT_DOT.violet }} /><span>Finance</span><span className="demo-tag">Demo</span></div>
        <div className="dept-item disabled"><span className="history-dot" style={{ background: DEPT_DOT.teal }} /><span>Operations</span><span className="demo-tag">Demo</span></div>

        <div className="sidebar-footer">
          <button className="account-chip" onClick={() => setAccountOpen(!accountOpen)}>
            <span className="avatar">{persona === "ceo" ? "CE" : "PO"}</span>
            <span className="account-info">
              <span className="account-name">{persona === "ceo" ? "CEO view" : "Product Owner view"}</span>
              <span className="account-role">Switch persona</span>
            </span>
            <ChevronDown size={14} />
          </button>
          {accountOpen && (
            <div className="account-menu">
              <button onClick={() => { setPersona("ceo"); setAccountOpen(false); }}>CEO view</button>
              <button onClick={() => { setPersona("po"); setAccountOpen(false); }}>Product Owner view</button>
            </div>
          )}
        </div>
      </aside>

      <main className="canvas">
        <div className="topbar">
          {collapsed && <button className="icon-btn" onClick={() => setCollapsed(false)} aria-label="Expand sidebar"><ChevronRight size={16} /></button>}
          <span className="topbar-title">{title}</span>
          <div className="topbar-actions">
            <div className="search-pill"><Search size={13} /><span>Search briefings…</span><kbd>⌘K</kbd></div>
            <button className="icon-btn" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label="Toggle theme">
              {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
            </button>
          </div>
        </div>
        <div className="content">
          {selectedHistory ? <ArchivedView item={activeHistory} /> : persona === "ceo" ? <CeoView /> : <ProductOwnerView />}
        </div>
      </main>
    </div>
  );
}
