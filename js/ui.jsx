/* ============================================================
   ui.jsx — shared presentational components
   ============================================================ */

/* ---------- Icons (stroke, inherit color) ---------- */
const I = {
  plus:    "M12 5v14M5 12h14",
  trash:   "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5",
  gear:    "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 13a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.2a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.2a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.2a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.2a1.6 1.6 0 00-1.4 1z",
  wallet:  "M3 7a2 2 0 012-2h12a2 2 0 012 2v2H5a2 2 0 00-2 2m0-4v10a2 2 0 002 2h14a2 2 0 002-2v-4M18 12a1 1 0 100 2 1 1 0 000-2z",
  receipt: "M5 3v18l2-1 2 1 2-1 2 1 2-1 2 1V3l-2 1-2-1-2 1-2-1-2 1-2-1zM8 8h8M8 12h8M8 16h5",
  cart:    "M3 3h2l2.4 12.4a2 2 0 002 1.6h7.7a2 2 0 002-1.6L23 7H6M9 21a1 1 0 100-2 1 1 0 000 2zM18 21a1 1 0 100-2 1 1 0 000 2z",
  sparkle: "M12 3l1.9 5.2L19 10l-5.1 1.8L12 17l-1.9-5.2L5 10l5.1-1.8L12 3zM5 16l.7 1.9L7.5 18l-1.8.7L5 20l-.7-1.9L2.5 18l1.8-.6L5 16z",
  bolt:    "M13 2L4 14h6l-1 8 9-12h-6l1-8z",
  bank:    "M3 10l9-6 9 6M5 10v8M19 10v8M9 10v8M15 10v8M3 20h18",
  chart:   "M3 3v18h18M7 14l3-3 3 2 5-6",
  car:     "M5 13l1.5-4.5A2 2 0 018.4 7h7.2a2 2 0 011.9 1.5L19 13M5 13h14v4a1 1 0 01-1 1h-1a1 1 0 01-1-1v-1H8v1a1 1 0 01-1 1H6a1 1 0 01-1-1v-4zM7.5 16h.01M16.5 16h.01",
  piggy:   "M19 10c0-3-3-5-7-5s-7 2-7 5c0 1.6.8 3 2 4v2h2v-1.3a9 9 0 003 0V20h2v-2c1.2-1 2-2.4 2-4zM16 9.5h.01M5 11H3M19 7l1.5-1.5",
  layers:  "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 18l9 5 9-5",
  briefcase:"M3 8h18v11a1 1 0 01-1 1H4a1 1 0 01-1-1V8zM8 8V5a2 2 0 012-2h4a2 2 0 012 2v3M3 13h18",
  scale:   "M12 3v18M7 21h10M5 7l-3 7a4 4 0 008 0L7 7M17 7l-3 7a4 4 0 008 0l-3-7M5 7h14",
  arrowdown:"M12 5v14M19 12l-7 7-7-7",
  lock:    "M5 11h14v9a1 1 0 01-1 1H6a1 1 0 01-1-1v-9zM8 11V7a4 4 0 018 0v4",
  check:   "M20 6L9 17l-5-5",
  x:       "M18 6L6 18M6 6l12 12",
  flame:   "M12 2c1 4 4 5 4 9a4 4 0 01-8 0c0-1 .5-2 1-2.5C9 11 12 9 12 2z",
  target:  "M12 12m-9 0a9 9 0 1018 0 9 9 0 10-18 0M12 12m-5 0a5 5 0 1010 0 5 5 0 10-10 0M12 12m-1 0a1 1 0 102 0 1 1 0 10-2 0",
  trend:   "M3 17l6-6 4 4 8-8M21 7h-5M21 7v5",
  refresh: "M3 12a9 9 0 0115-6.7L21 8M21 3v5h-5M21 12a9 9 0 01-15 6.7L3 16M3 21v-5h5",
  info:    "M12 16v-4M12 8h.01M12 21a9 9 0 100-18 9 9 0 000 18z",
  calendar:"M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z",
  coins:   "M9 9m-6 0a6 3 0 1012 0 6 3 0 10-12 0M3 9v5c0 1.7 2.7 3 6 3s6-1.3 6-3M15 11.4c2.4.3 4.2 1.3 4.2 2.6 0 1.5-2.3 2.6-5.2 2.6",
};

function Icon({ name, size = 18, fill = false, style }) {
  return React.createElement("svg", {
    viewBox: "0 0 24 24", width: size, height: size, style,
    fill: fill ? "currentColor" : "none",
    stroke: fill ? "none" : "currentColor",
    strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round",
  }, React.createElement("path", { d: I[name] || "" }));
}

/* ---------- Page header ---------- */
function PageHead({ title, children }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </div>
  );
}

/* ---------- Glass card ---------- */
function Card({ children, className = "", soft = false, style }) {
  return <div className={`${soft ? "glass-soft" : "glass"} ${className}`} style={style}>{children}</div>;
}

/* ---------- Tile ---------- */
function Tile({ label, value, sub, icon, tone }) {
  return (
    <div className="glass-soft tile">
      <div className="flex between">
        <span className="label">{label}</span>
        {icon && <span className="ic"><Icon name={icon} size={15} /></span>}
      </div>
      <div className="value num" style={tone ? { color: `var(--${tone})` } : null}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

/* ---------- Editable text ---------- */
function TextCell({ value, onChange, placeholder, style }) {
  return (
    <input className="cell-input" value={value} placeholder={placeholder} style={style}
      onChange={(e) => onChange(e.target.value)} />
  );
}

/* ---------- Editable amount (currency-prefixed) ---------- */
function AmountCell({ value, onChange, currency, align = "right" }) {
  const [focused, setFocused] = React.useState(false);
  const [draft, setDraft] = React.useState(String(value ?? ""));
  React.useEffect(() => { if (!focused) setDraft(String(value ?? "")); }, [value, focused]);
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <span style={{ position: "absolute", left: 8, color: "var(--ink-faint)", fontSize: 13, pointerEvents: "none" }}>
        {curSymbol(currency)}
      </span>
      <input
        className="cell-input amount num"
        inputMode="decimal"
        style={{ paddingLeft: 20, textAlign: align }}
        value={focused ? draft : formatNum(value)}
        onFocus={() => { setFocused(true); setDraft(value === 0 ? "" : String(value)); }}
        onBlur={() => { setFocused(false); onChange(parseFloat(draft) || 0); }}
        onChange={(e) => setDraft(e.target.value)}
      />
    </div>
  );
}
function formatNum(n) {
  const v = Number(n) || 0;
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/* ---------- Frequency select ---------- */
function FreqCell({ value, onChange }) {
  return (
    <select className="cell-input" value={value} onChange={(e) => onChange(e.target.value)}>
      {Object.entries(FREQS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
    </select>
  );
}

/* ---------- Locked computed cell ---------- */
function LockCell({ children }) {
  return <div className="cell-static lock num">{children}</div>;
}

/* ---------- Delete button ---------- */
function DelBtn({ onClick, label = "Delete row" }) {
  return (
    <button className="del-btn" onClick={onClick} aria-label={label} title={label}>
      <Icon name="trash" size={15} />
    </button>
  );
}

/* ---------- Add row button ---------- */
function AddRow({ onClick, label }) {
  return (
    <button className="addrow" onClick={onClick}>
      <Icon name="plus" size={16} /> {label}
    </button>
  );
}

/* ---------- Progress bar ---------- */
function Bar({ pct, over }) {
  return (
    <div className={`bar ${over ? "over" : ""}`}>
      <span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}></span>
    </div>
  );
}

/* ---------- Empty state ---------- */
function Empty({ icon, title, sub, action }) {
  return (
    <div className="empty">
      <Icon name={icon || "sparkle"} size={40} />
      <div className="big">{title}</div>
      {sub && <div style={{ fontSize: 14, marginBottom: 16 }}>{sub}</div>}
      {action}
    </div>
  );
}

/* ---------- Animated number (count-up) ---------- */
function useCountUp(target, duration = 900) {
  const [val, setVal] = React.useState(target);
  const ref = React.useRef({ from: target, start: 0, raf: 0 });
  React.useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setVal(target); return; }
    const from = ref.current.lastTarget ?? target;
    if (from === target) { setVal(target); return; }
    ref.current.from = from;
    ref.current.start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - ref.current.start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(from + (target - from) * eased);
      if (p < 1) ref.current.raf = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(ref.current.raf);
    ref.current.raf = requestAnimationFrame(tick);
    ref.current.lastTarget = target;
    return () => cancelAnimationFrame(ref.current.raf);
  }, [target, duration]);
  ref.current.lastTarget = target;
  return val;
}

function CountMoney({ value, currency, className, style }) {
  const v = useCountUp(value);
  return <span className={`num ${className || ""}`} style={style}>{fmtMoney(v, currency, { decimals: 0 })}</span>;
}

Object.assign(window, {
  Icon, PageHead, Card, Tile, TextCell, AmountCell, FreqCell, LockCell,
  DelBtn, AddRow, Bar, Empty, useCountUp, CountMoney, formatNum,
});
