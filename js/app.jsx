/* ============================================================
   app.jsx — shell: nav, routing, settings
   ============================================================ */

const CORE_TABS = [
{ key: "dashboard", label: "Dashboard", icon: "chart" },
{ key: "accounts", label: "Accounts", icon: "bank" },
{ key: "income", label: "Income", icon: "wallet" },
{ key: "budget", label: "Budget", icon: "receipt" },
{ key: "transactions", label: "Transactions", icon: "coins" },
{ key: "misc", label: "Misc", icon: "cart" },
{ key: "sweep", label: "The Sweep", icon: "arrowdown" },
{ key: "loan", label: "Loan", icon: "scale" },
{ key: "moves", label: "Smart Moves", icon: "sparkle" }];


const THEMES = [
{ key: "aurora", label: "Aurora", a: "oklch(0.81 0.12 196)", b: "oklch(0.80 0.13 168)" },
{ key: "coral", label: "Coral", a: "oklch(0.77 0.15 32)", b: "oklch(0.78 0.14 8)" },
{ key: "violet", label: "Violet", a: "oklch(0.74 0.15 300)", b: "oklch(0.72 0.16 270)" },
{ key: "emerald", label: "Emerald", a: "oklch(0.79 0.15 158)", b: "oklch(0.80 0.13 185)" },
{ key: "amber", label: "Amber", a: "oklch(0.82 0.13 75)", b: "oklch(0.80 0.14 45)" }];


const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "blur": 28,
  "glow": 90,
  "radius": 22,
  "density": "regular"
} /*EDITMODE-END*/;

function App() {
  const s = useStore();
  const [tw, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [tab, setTab] = React.useState(() => location.hash.slice(1) || "dashboard");
  const [settings, setSettings] = React.useState(false);

  React.useEffect(() => {applyTheme(s.settings.theme, s.settings.mode);}, [s.settings.theme, s.settings.mode]);

  /* ---- Global undo: Ctrl/Cmd-Z ---- */
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "z") {
        // Ignore when the user is editing text — let the browser's native
        // input-undo fire instead. Once they tab away, Ctrl-Z hits the app.
        const tag = (e.target?.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
        e.preventDefault();
        const label = Store.undo();
        if (label) window.__undoToast?.(`Undid: ${label}`, true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Apply visual tweaks as CSS-variable overrides on the root.
  React.useEffect(() => {
    const r = document.documentElement.style;
    r.setProperty("--glass-blur", tw.blur + "px");
    r.setProperty("--glow-opacity", (tw.glow / 100).toFixed(2));
    r.setProperty("--radius", tw.radius + "px");
    r.setProperty("--radius-sm", (tw.radius * 0.64).toFixed(1) + "px");
    r.setProperty("--radius-xs", (tw.radius * 0.46).toFixed(1) + "px");
    const pad = tw.density === "compact" ? 7 : tw.density === "comfy" ? 16 : 11;
    r.setProperty("--row-pad", pad + "px");
  }, [tw.blur, tw.glow, tw.radius, tw.density]);
  React.useEffect(() => {
    const onHash = () => setTab(location.hash.slice(1) || "dashboard");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const goTo = (key) => {setTab(key);location.hash = key;window.scrollTo({ top: 0, behavior: "smooth" });};

  const HIDEABLE = new Set(["misc", "sweep", "loan", "moves"]);
  const hiddenTabs = s.settings.hiddenTabs || {};
  const visibleCore = CORE_TABS.filter((tb) => !hiddenTabs[tb.key]);

  const moduleTabs = Object.keys(MODULE_META).
  filter((m) => s.settings.modules[m]).
  map((m) => ({ key: m, label: MODULE_META[m].name.replace(" Expenses", "").replace(" Fund", "").replace(" Portfolio", ""), icon: MODULE_META[m].icon, module: true }));

  const tabs = [...visibleCore, ...moduleTabs];
  const active = tabs.find((tb) => tb.key === tab) ? tab : "dashboard";

  const render = () => {
    switch (active) {
      case "dashboard":return <Dashboard goTo={goTo} />;
      case "accounts":return <AccountsTab />;
      case "income":return <IncomeTab />;
      case "budget":return <BudgetTab />;
      case "transactions":return <TransactionsTab />;
      case "misc":return <MiscTab />;
      case "sweep":return <SweepTab goTo={goTo} />;
      case "loan":return <LoanTab />;
      case "moves":return <MovesTab goTo={goTo} />;
      case "car":return <CarModule />;
      case "savings":return <SavingsModule />;
      case "shares":return <SharesModule />;
      case "retirement":return <RetirementModule />;
      case "side":return <SideModule />;
      case "debt":return <DebtModule />;
      default:return <Dashboard goTo={goTo} />;
    }
  };

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="mark"></span>
          <span>Sweep<small>budget &amp; payoff planner</small></span>
        </div>
        <div className="spacer"></div>
        <SyncDot />
        <button className="iconbtn" onClick={() => setSettings(true)} aria-label="Settings" title="Settings">
          <Icon name="gear" size={19} />
        </button>
      </div>

      <nav className="tabs" role="tablist">
        {tabs.map((tb) =>
        <button key={tb.key} role="tab" aria-selected={active === tb.key}
        className={`tab ${active === tb.key ? "active" : ""}`}
        onClick={() => goTo(tb.key)}
        onContextMenu={(e) => {
          if (!HIDEABLE.has(tb.key)) return;
          e.preventDefault();
          if (confirm(`Hide "${tb.label}"? You can bring it back from Settings.`)) {
            Store.set("settings.hiddenTabs." + tb.key, true);
          }
        }}
        title={HIDEABLE.has(tb.key) ? "Right-click to hide" : null}>
            {tb.module && <span className="dot"></span>}
            {tb.label}
          </button>
        )}
      </nav>

      <CloudNewerBanner />
      <main className="content" key={active}>
        <div className="fade-in">{render()}</div>
      </main>

      {settings && <SettingsSheet onClose={() => setSettings(false)} s={s} />}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Theme" />
        <ThemeSwatches current={s.settings.theme} />
        <TweakSection label="Glass &amp; depth" />
        <TweakSlider label="Glass blur" value={tw.blur} min={0} max={44} step={1} unit="px"
        onChange={(v) => setTweak("blur", v)} />
        <TweakSlider label="Corner radius" value={tw.radius} min={6} max={30} step={1} unit="px"
        onChange={(v) => setTweak("radius", v)} />
        <TweakSlider label="Ambient glow" value={tw.glow} min={0} max={100} step={5} unit="%"
        onChange={(v) => setTweak("glow", v)} />
        <TweakSection label="Layout" />
        <TweakRadio label="Row density" value={tw.density} options={["compact", "regular", "comfy"]}
        onChange={(v) => setTweak("density", v)} />
      </TweaksPanel>
      <UndoToast />
    </div>);

}

/* Theme swatch row inside the Tweaks panel — drives the real store theme */
function ThemeSwatches({ current }) {
  return (
    <div style={{ padding: "4px 2px 10px" }}>
      <div className="swatches">
        {THEMES.map((th) =>
        <button key={th.key} className={`swatch ${current === th.key ? "on" : ""}`} title={th.label}
        style={{ background: `linear-gradient(140deg, ${th.a}, ${th.b})`, width: 40, height: 40 }}
        onClick={() => Store.set("settings.theme", th.key)} aria-label={th.label} />
        )}
      </div>
    </div>);

}

function SettingsSheet({ onClose, s }) {
  const mods = s.settings.modules;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="flex between" style={{ marginBottom: 2 }}>
          <h2>Settings</h2>
          <button className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        </div>
        <p style={{ color: "var(--ink-faint)", fontSize: 13, margin: 0 }}>Your data saves automatically on this device.</p>

        <div className="group">
          <h3>Appearance</h3>
          <div className="mode-toggle" role="radiogroup" aria-label="Appearance">
            <button className={`mode-opt ${(s.settings.mode || "dark") === "dark" ? "on" : ""}`}
            onClick={() => Store.set("settings.mode", "dark")} aria-checked={(s.settings.mode || "dark") === "dark"} role="radio">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
              Dark
            </button>
            <button className={`mode-opt ${s.settings.mode === "light" ? "on" : ""}`}
            onClick={() => Store.set("settings.mode", "light")} aria-checked={s.settings.mode === "light"} role="radio">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>
              Light
            </button>
          </div>
        </div>

        <div className="group">
          <h3>Theme</h3>
          <div className="swatches">
            {THEMES.map((th) =>
            <button key={th.key} className={`swatch ${s.settings.theme === th.key ? "on" : ""}`} title={th.label}
            style={{ background: `linear-gradient(140deg, ${th.a}, ${th.b})` }}
            onClick={() => Store.set("settings.theme", th.key)} aria-label={th.label} />
            )}
          </div>
        </div>

        <div className="group">
          <h3>Currency</h3>
          <div className="field" style={{ margin: 0 }}>
            <select value={s.settings.currency} onChange={(e) => Store.set("settings.currency", e.target.value)}>
              {Object.entries(CURRENCIES).map(([k, c]) =>
              <option key={k} value={k}>{k} — {c.name} ({c.symbol})</option>
              )}
            </select>
          </div>
        </div>

        <div className="group">
          <h3>Default period</h3>
          <p style={{ color: "var(--ink-faint)", fontSize: 12, margin: "0 0 12px" }}>
            How figures display by default. Stored amounts and the Sweep math stay anchored to monthly — only the labels and tiles re-scale, so totals never drift.
          </p>
          <div className="field" style={{ margin: 0 }}>
            <select value={s.settings.displayPeriod || "monthly"} onChange={(e) => Store.set("settings.displayPeriod", e.target.value)}>
              {Object.entries(DISPLAY_PERIODS).map(([k, p]) =>
              <option key={k} value={k}>{p.label}</option>
              )}
            </select>
          </div>
        </div>

        <div className="group">
          <h3>People</h3>
          <p style={{ color: "var(--ink-faint)", fontSize: 12, margin: "0 0 12px" }}>Track shared budgets — tag each budget item to a person, then filter by who on the Budget tab.</p>
          <PeopleManager people={s.people || []} />
        </div>

        <div className="group">
          <h3>Visible tabs</h3>
          <p style={{ color: "var(--ink-faint)", fontSize: 12, margin: "0 0 12px" }}>Hide the ones you don't use — tip: right-click any tab to hide it instantly.</p>
          {[{ k: "misc", l: "Misc Purchases" }, { k: "sweep", l: "The Sweep" }, { k: "loan", l: "Loan Calculator" }, { k: "moves", l: "Smart Money Moves" }].map((tb) =>
          <div className="modtoggle" key={tb.k}>
              <div className="mt-l">
                <b>{tb.l}</b>
                <span>{tb.k === "sweep" ? "Hiding this also hides the Sweep panel on the Dashboard." : tb.k === "loan" ? "Hiding this also hides the payoff impact on the Dashboard." : "Tab visibility only — data and math are unchanged."}</span>
              </div>
              <input type="checkbox" className="toggle" checked={!s.settings.hiddenTabs?.[tb.k]}
            onChange={(e) => Store.set("settings.hiddenTabs." + tb.k, !e.target.checked)} aria-label={`Show ${tb.l}`} />
            </div>
          )}
        </div>

        <div className="group">
          <h3>Optional modules</h3>
          {Object.entries(MODULE_META).map(([k, m]) =>
          <div className="modtoggle" key={k}>
              <div className="mt-l">
                <b>{m.name}</b>
                <span>{m.blurb}</span>
              </div>
              <input type="checkbox" className="toggle" checked={!!mods[k]}
            onChange={(e) => Store.set("settings.modules." + k, e.target.checked)} aria-label={`Toggle ${m.name}`} />
            </div>
          )}
        </div>

        <div className="group">
          <h3>Cloud sync</h3>
          <CloudSyncSettings />
        </div>

        <div className="group">
          <h3>Data</h3>
          <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center" }}
          onClick={() => {if (confirm("Reset everything to the example data? This clears your changes on this device.")) Store.reset();}}>
            <Icon name="refresh" size={16} /> Reset to example data
          </button>
          <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", marginTop: 8, borderColor: "oklch(0.70 0.18 22 / 0.4)", color: "oklch(0.85 0.10 25)" }}
          onClick={() => {
            if (!confirm("⚠️  Clear ALL your data and start from a blank canvas?\n\nThis cannot be undone. Your theme and currency will be kept.")) return;
            if (!confirm("Really? Every transaction, every category, every account will be erased.")) return;
            Store.clearAll();
          }}>
            <Icon name="trash" size={16} /> Clear everything (blank canvas)
          </button>
        </div>

        <p style={{ color: "var(--ink-faint)", fontSize: 11.5, marginTop: 24, lineHeight: 1.5 }}>
          Estimates are guidance only, not financial advice. Always confirm rates and figures with your lender.
        </p>
      </div>
    </div>);

}

applyTheme(Store.get().settings.theme, Store.get().settings.mode);

/* ErrorBoundary — catches render errors instead of silently unmounting. */
class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(e) { return { err: e }; }
  componentDidCatch(e, i) { console.error("[Sweep] Render error:", e, i); }
  render() {
    if (this.state.err) return (
      <div style={{ padding: 40, fontFamily: "system-ui", color: "#f3f5fa", background: "#07090d", minHeight: "100vh" }}>
        <h2 style={{ color: "#f87171" }}>Something went wrong</h2>
        <pre style={{ fontSize: 13, color: "#aab3c5", whiteSpace: "pre-wrap" }}>{this.state.err.message}</pre>
        <button onClick={() => this.setState({ err: null })} style={{ marginTop: 16, padding: "10px 20px", background: "var(--accent, #7c7ce6)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 15 }}>
          Retry
        </button>
      </div>
    );
    return this.props.children;
  }
}

/* Self-healing mount. If the root is empty 7 seconds after load (e.g. because
   a previous navigation left a stale React root), remount automatically. */
function mountApp() {
  const el = document.getElementById("root");
  if (!el) return;
  el.innerHTML = "";           // clear any stale React root state
  ReactDOM.createRoot(el).render(
    React.createElement(ErrorBoundary, null, React.createElement(App))
  );
}

mountApp();

/* Watchdog: if #root is still empty after 7 s (can happen when a prior
   page crash left React's internal root in an errored state), try once more. */
setTimeout(() => {
  const el = document.getElementById("root");
  if (el && el.children.length === 0) {
    console.warn("[Sweep] Root empty after 7s — attempting recovery mount.");
    mountApp();
  }
}, 7000);