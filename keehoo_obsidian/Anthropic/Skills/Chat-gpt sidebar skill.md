---

## name: chatgpt-style-collapsible-sidebar description: > Build a production-grade, ChatGPT-style collapsible sidebar for any dashboard or SaaS web app. Use this skill whenever a user asks to build a sidebar, nav panel, or left-rail navigation that collapses to an icon-rail, has grouped nav items, a user profile footer with a pop-up menu, optional workspace/org switching, and syncs its width to a CSS variable so the main layout reacts automatically. Framework-agnostic pattern; examples use Next.js + React + TS.

# ChatGPT-Style Collapsible Sidebar — Generic Skill

This skill defines the **structural rules, behavioural contracts, and CSS primitives** for a collapsible sidebar. It contains zero product-specific content. Every placeholder (marked `<LIKE_THIS>`) must be filled in at generation time based on what the user tells you.

---

## 1. Core Concept

The sidebar has exactly **two widths**:

- **Expanded**: `<EXPANDED_WIDTH>` (commonly 220–260 px)
- **Collapsed**: `<COLLAPSED_WIDTH>` (commonly 52–60 px — icon-only)

Both values are exposed as a single CSS custom property (`--sidebar-w`) on `:root`. The rest of the layout (header, main content) reads this variable, so nothing needs prop-drilling.

---

## 2. DOM Structure

```
<aside.sidebar [.collapsed]>
  ├── .sb-top                  ← fixed-height brand/logo bar
  ├── [org/workspace switcher] ← optional; only when expanded + multiple workspaces
  ├── [primary CTA button]     ← optional; e.g. "New Chat", "New Project"
  ├── <nav.sb-nav>             ← flex:1, overflow-y:auto
  │   ├── .nav-label           ← section heading (hidden when collapsed)
  │   └── .nav-item ×N        ← icon + label + optional badge
  └── .sb-bottom               ← position:relative (menu anchor), flex-shrink:0
      ├── [.menu-popup]        ← absolute, bottom:100%, rendered inside sb-bottom
      └── .sb-user             ← avatar + name + subtitle
</aside>
```

**Rule**: `.sb-bottom` must have `position: relative`. The popup menu is `position: absolute; bottom: 100%` so it floats upward above the user row.

---

## 3. CSS Primitives

These class names are fixed. Fill in the token values from the product's design system.

```css
:root {
  --sidebar-w: <EXPANDED_WIDTH>;   /* JS will update this on collapse/expand */
}

/* ── Shell ────────────────────────────────────────────────────────── */
.sidebar {
  width: var(--sidebar-w);
  flex-shrink: 0;
  background: <SIDEBAR_BG>;              /* typically #fff or a dark tone */
  border-right: 1px solid <BORDER>;
  display: flex;
  flex-direction: column;
  height: 100vh;
  transition: width .22s cubic-bezier(.4, 0, .2, 1);
  position: relative;
}
.sidebar.collapsed { width: <COLLAPSED_WIDTH>; }

/* Hide text-only elements when collapsed */
.sidebar.collapsed .nav-label      { display: none; }
.sidebar.collapsed .nav-item       { justify-content: center; padding: <ICON_ONLY_PADDING>; }
.sidebar.collapsed .nav-item-label { display: none; }
.sidebar.collapsed .nav-badge      { display: none; }
.sidebar.collapsed .sb-user-name   { display: none; }
.sidebar.collapsed .sb-user        { justify-content: center; padding: <ICON_ONLY_PADDING>; }

/* ── Top bar ──────────────────────────────────────────────────────── */
.sb-top {
  height: <TOPBAR_HEIGHT>;       /* match the app's main header height */
  flex-shrink: 0;
  border-bottom: 1px solid <BORDER>;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 0 14px;
  overflow: hidden;
}
.sidebar.collapsed .sb-top {
  justify-content: center;
  padding: 0;
  cursor: pointer;    /* entire bar becomes the expand click target */
}

/* ── Nav ──────────────────────────────────────────────────────────── */
.sb-nav {
  flex: 1;
  min-height: 0;
  padding: <NAV_PADDING>;       /* e.g. 10px 8px */
  overflow-y: auto;
  overflow-x: hidden;
}

.nav-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: <MUTED_TEXT>;
  padding: 8px 12px 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: <ITEM_PADDING>;      /* e.g. 7px 12px */
  border-radius: <ITEM_RADIUS>; /* e.g. 8px */
  font-size: 13px;
  color: <ITEM_TEXT>;
  cursor: pointer;
  transition: all .15s;
  margin-bottom: 1px;
}
.nav-item:hover  { background: <HOVER_BG>;   color: <HOVER_TEXT>; }
.nav-item.active { background: <ACCENT>;     color: #fff; font-weight: 500; }

.nav-icon { font-size: 15px; width: 18px; text-align: center; flex-shrink: 0; }

/* ── Badge ────────────────────────────────────────────────────────── */
.nav-badge {
  margin-left: auto;
  font-size: 10px;
  font-weight: 600;
  background: <ACCENT>;
  color: #fff;
  border-radius: 10px;
  padding: 1px 6px;
}
/* Optional secondary badge variant */
.nav-badge.green { background: <SUCCESS>; }

/* On an active item the badge must not clash with the accent background */
.nav-item.active .nav-badge       { background: rgba(255,255,255,.3); color: #fff; }
.nav-item.active .nav-badge.green { background: rgba(255,255,255,.3); }

/* ── Bottom section ───────────────────────────────────────────────── */
.sb-bottom {
  padding: 12px 8px;
  border-top: 1px solid <BORDER>;
  position: relative;   /* REQUIRED for popup anchor */
  flex-shrink: 0;
}

.sb-user {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 12px;
  border-radius: <ITEM_RADIUS>;
  cursor: pointer;
}
.sb-user:hover { background: <USER_HOVER_BG>; } /* subtle tint, e.g. rgba(accent, .15) */

/* ── Avatar ───────────────────────────────────────────────────────── */
.avatar {
  width: <AVATAR_SIZE>;          /* e.g. 30px */
  height: <AVATAR_SIZE>;
  border-radius: 50%;
  background: <ACCENT_LIGHT>;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: <ACCENT>;
  flex-shrink: 0;
}
```

---

## 4. JS State

Declare exactly these state variables. Each drives visible behaviour.

```tsx
const [collapsed,    setCollapsed]   = useState(false);
const [topHovered,   setTopHovered]  = useState(false);
const [menuOpen,     setMenuOpen]    = useState(false);

// Optional — only if the sidebar fetches live data
const [activeCount,  setActiveCount] = useState<number | null>(null);
const [userName,     setUserName]    = useState<string | null>(null);
const [orgName,      setOrgName]     = useState<string | null>(null);
const [planLabel,    setPlanLabel]   = useState<string>("<DEFAULT_PLAN>");
const [userRoles,    setUserRoles]   = useState<string[]>([]);
const [workspaces,   setWorkspaces]  = useState<Workspace[]>([]);
const [wsSwitchOpen, setWsSwitchOpen]= useState(false);
const [switchingWs,  setSwitchingWs] = useState(false);

const menuRef = useRef<HTMLDivElement>(null);
const wsRef   = useRef<HTMLDivElement>(null);
```

---

## 5. Behavioural Rules (useEffect contracts)

### 5a. CSS variable sync — ALWAYS first, ALWAYS present

```tsx
useEffect(() => {
  document.documentElement.style.setProperty(
    "--sidebar-w",
    collapsed ? "<COLLAPSED_WIDTH>" : "<EXPANDED_WIDTH>"
  );
}, [collapsed]);
```

This is the single most important effect. Without it the main layout does not react to collapse/expand.

### 5b. Auto-collapse on specific panels (optional)

```tsx
useEffect(() => {
  const widePanels = [/* panel IDs that need maximum horizontal space */];
  if (widePanels.includes(activePanel)) {
    setCollapsed(true);
  } else {
    setCollapsed(false);
  }
}, [activePanel]);
```

### 5c. Outside-click to close any floating element

Reuse this pattern for **both** the user menu and the workspace dropdown.

```tsx
useEffect(() => {
  function handler(e: MouseEvent) {
    if (ref.current && !ref.current.contains(e.target as Node)) {
      setSomeOpen(false);
    }
  }
  if (someOpen) document.addEventListener("mousedown", handler);
  return () => document.removeEventListener("mousedown", handler);
}, [someOpen]);
```

### 5d. React to external data changes via custom events (optional)

```tsx
useEffect(() => {
  function handler(e: Event) {
    const value = (e as CustomEvent<{ name: string }>).detail?.name;
    if (value) setOrgName(value);
  }
  window.addEventListener("<APP_NAMESPACE>:<EVENT_NAME>", handler);
  return () => window.removeEventListener("<APP_NAMESPACE>:<EVENT_NAME>", handler);
}, []);
```

---

## 6. sb-top — Two States

### Collapsed state

The whole `sb-top` div is the click target. Its content switches on `topHovered`:

- **Hovered** → show the "expand" icon in the accent colour
- **Default** → show the brand icon inside a small coloured circle/square

```tsx
{collapsed ? (
  <div className="sb-top" onClick={() => setCollapsed(false)} title="Expand">
    {topHovered
      ? <ExpandIcon size={18} color="<ACCENT>" />
      : <BrandIconCircle />
    }
  </div>
) : (
  /* Expanded state below */
)}
```

`BrandIconCircle` pattern: a small div with `borderRadius: <ICON_RADIUS>`, `background: <ACCENT>`, containing the product's icon in white.

### Expanded state

Logo on left, collapse-toggle icon on right.

```tsx
<div className="sb-top">
  <div className="logo">
    <BrandIconCircle />
    <span className="logo-text"><BRAND_NAME></span>
  </div>
  <CollapseIcon
    onClick={() => setCollapsed(true)}
    style={{ cursor: "pointer", flexShrink: 0 }}
  />
</div>
```

Logo text tip: optionally split the brand name into two colour segments — first part in dark ink, second part in the accent colour. This is a common SaaS pattern that adds visual interest without extra graphic assets.

---

## 7. Workspace / Org Switcher (optional)

Only render when `!collapsed && workspaces.length > 1`.

Structure:

1. Full-width trigger button: current workspace name + `ChevronDown`
2. Absolutely-positioned dropdown: one row per workspace
3. Each row: workspace name (truncated, `flex:1`) + role label on the right
4. Active workspace row: `<ACCENT_LIGHT>` background, `<ACCENT>` text, bold weight
5. Switching state: show a spinner icon next to the row being activated

Dropdown positioning: `position: absolute; zIndex: 200; left: 8; right: 8` relative to the switcher wrapper.

Close behaviour:

- Outside click (attach `ref` to the wrapper, use pattern §5c)
- After a successful switch
- Clicking the already-active workspace

`handleSwitchWorkspace` contract:

1. No-op if already on that workspace or a switch is in progress
2. Call the switch API → decode new token → update session
3. Resolve the new workspace's primary resource, store in localStorage
4. Close dropdown → navigate to default panel

---

## 8. Primary CTA Button (optional)

A full-width button placed between the switcher and `<nav>`.

Rules:

- Collapsed: icon-only; `padding: <ICON_ONLY_PADDING>; justify-content: center`
- Expanded: icon + label text
- Style: dashed border, `background: <ACCENT_LIGHT>`, `color: <ACCENT>`
- Hover: invert to `background: <ACCENT>`, `color: #fff`
- Use inline `onMouseEnter`/`onMouseLeave` (not CSS class) so collapsed padding also updates correctly

```tsx
<button
  style={{
    padding: collapsed ? "<ICON_ONLY_PADDING>" : "<FULL_PADDING>",
    background: "var(--accent-light)",
    color: "var(--accent)",
    border: "1px dashed var(--accent)",
    transition: "all 0.15s ease",
    /* ...rest of layout styles */
  }}
  onMouseEnter={e => {
    e.currentTarget.style.background = "var(--accent)";
    e.currentTarget.style.color = "#fff";
  }}
  onMouseLeave={e => {
    e.currentTarget.style.background = "var(--accent-light)";
    e.currentTarget.style.color = "var(--accent)";
  }}
>
  <PlusIcon size={16} />
  {!collapsed && <span><CTA_LABEL></span>}
</button>
```

---

## 9. Nav Items

### Data shape

```tsx
interface NavItem {
  id: string;
  icon: IconComponent;
  label: string;
  badge?: string | number;
  badgeVariant?: "default" | "green"; // extend variants as needed
}
```

Group items into 2–4 logical sections. Each group has a `nav-label` header.

### Render function rules

1. `isActive` = current route/panel matches `item.id`
2. For items with a live count: prefer the fetched count over the static `item.badge`; fall back to `item.badge` while the API hasn't responded
3. Suppress badge render when value is `0`, `null`, or `undefined`
4. `title={item.label}` only when collapsed — provides native tooltip for free
5. Icon in `.nav-icon` span; label in `.nav-item-label` span

```tsx
const renderNavItem = (item: NavItem) => {
  const isActive = activePanel === item.id;
  const badge = item.id === "<LIVE_COUNT_ITEM_ID>"
    ? (activeCount ?? item.badge)
    : item.badge;
  return (
    <div
      key={item.id}
      className={`nav-item${isActive ? " active" : ""}`}
      onClick={() => navigate(item.id)}
      title={collapsed ? item.label : undefined}
    >
      <span className="nav-icon"><item.icon size={18} /></span>
      <span className="nav-item-label">{item.label}</span>
      {badge !== undefined && badge !== null && badge !== 0 && (
        <span className={`nav-badge${item.badgeVariant === "green" ? " green" : ""}`}>
          {badge}
        </span>
      )}
    </div>
  );
};
```

---

## 10. User Row & Pop-up Menu

### Display value derivation

```tsx
// Prefer API-fetched name → email prefix → fallback
const displayName = userName ?? (email ? email.split("@")[0] : "User");

// Up to 2 initials from word boundaries
const initials = displayName
  .split(" ").filter(Boolean)
  .map(n => n[0]).join("").slice(0, 2).toUpperCase() || "U";
```

### Pop-up menu structure

```
[Settings row]
─────────────────────────────
[Section label: "Switch role"]  ← only if user has >1 role
[Role row] × N                  ← only roles OTHER than the current one
─────────────────────────────
[Sign out row]                  ← render in danger colour
```

Rules:

- Menu opens/closes on `.sb-user` click
- `menuRef` attaches to `.sb-bottom` (the wrapper), NOT `.sb-user` alone — prevents closing when clicking menu items inside
- Sign-out must clear all app-scoped localStorage keys **before** calling the auth sign-out function; use a key prefix unique to the product
- Role switcher: only show if user has >1 role; never list the currently active role as a switch option

### Shared menu button style

```tsx
const menuItemStyle: React.CSSProperties = {
  width: "100%", textAlign: "left",
  padding: "10px 14px", fontSize: 13,
  background: "none", border: "none",
  borderBottom: "1px solid <BORDER>",
  cursor: "pointer",
  display: "flex", alignItems: "center", gap: 8,
  fontFamily: "inherit",
  color: "<ITEM_TEXT>",
};
// Destructive action: override color with "<DANGER>"
```

---

## 11. Sidebar Shell Markup

```tsx
<aside
  className={`sidebar${collapsed ? " collapsed" : ""}`}
  onMouseEnter={() => setTopHovered(true)}
  onMouseLeave={() => setTopHovered(false)}
>
  {/* sb-top */}
  {/* workspace switcher */}
  {/* CTA button */}
  {/* nav */}
  {/* sb-bottom with menu popup + user row */}
</aside>
```

---

## 12. Wrapping Layout

```tsx
<div className="app-shell">
  <Sidebar />
  <div className="main">
    <div className="main-topbar">…</div>
    <div className="main-body">…</div>
  </div>
</div>
```

```css
.app-shell { display: flex; height: 100vh; overflow: hidden; }
.main      { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.main-body { flex: 1; overflow-y: auto; padding: <CONTENT_PADDING>; }
```

The main area never references a pixel width — it uses `flex: 1`. The sidebar's collapse is handled entirely through the CSS variable on `:root`.

---

## 13. Pre-generation Questions

Before writing code, confirm these from the user:

- [ ] Expanded width and collapsed width
- [ ] Brand name, logo icon, accent colour
- [ ] Nav groups and items (id, icon, label)
- [ ] Which item (if any) shows a live badge count from an API
- [ ] Whether workspace/org switching is needed
- [ ] Whether a primary CTA button is needed and its label/action
- [ ] Auth provider (for sign-out call)
- [ ] Route/panel navigation pattern
- [ ] localStorage key prefix (for sign-out cleanup)
- [ ] Whether role/persona switching is needed

---

## 14. Pre-ship Checklist

- [ ] `--sidebar-w` initialised in CSS and updated by `useEffect` on mount
- [ ] `position: relative` on `.sb-bottom`
- [ ] `onMouseEnter`/`onMouseLeave` on the `<aside>` element
- [ ] `menuRef` on `.sb-bottom` wrapper, not `.sb-user`
- [ ] Both outside-click listeners cleaned up in `useEffect` return
- [ ] Badge on active item uses `rgba(255,255,255,.3)` background
- [ ] CTA button hover uses inline handlers so padding also updates
- [ ] `nav-item-label` class on label `<span>` (collapsed CSS targets it)
- [ ] `sb-user-name` class on name `<div>` (collapsed CSS hides it)
- [ ] Sign-out clears localStorage by prefix before calling auth sign-out
- [ ] Role switcher filters to "other roles only"
- [ ] `title` tooltip present on nav items only when collapsed