/* ============================================================
   tab_dashboard.jsx — the hero overview, budget-vs-spent breakdown
   ============================================================ */

function Dashboard({ goTo }) {
  const s = useStore();
  const cur = s.settings.currency;
  const t = computeTotals(s);
  const L = s.loan;
  const ex = loanExtras(s, t);
  const payment = ex.payment;
  const baseline = simulateLoan({ balance: L.balance, annualRatePct: L.rate, payment, offset: 0, extra: 0 });
  const strategy = simulateLoan({ balance: L.balance, annualRatePct: L.rate, payment, offset: ex.offset, extra: ex.extra });
  const bothFinite = isFinite(baseline.months) && isFinite(strategy.months);
  const interestSaved = bothFinite ? Math.max(0, baseline.totalInterest - strategy.totalInterest) : 0;
  const yearsSaved = bothFinite ? Math.max(0, (baseline.months - strategy.months) / 12) : 0;

  const destLabel = (SWEEP_DESTS[s.sweep.destination] || {}).label || "your goal";
  const [period, setPeriod] = React.useState("monthly");
  const [offset, setOffset] = React.useState(0);
  React.useEffect(() => { setOffset(0); }, [period]); // reset history nav when period changes
  const win = periodWindow(period, offset);

  const hidden = s.settings.hiddenTabs || {};
  const showSweep = !hidden.sweep;
  const showLoan = !hidden.loan;
  const showHero = showSweep || showLoan;

  return (
    <div>
      <PageHead title="Dashboard">{showSweep
        ? "Your money at a glance. The Sweep is whatever's left after everything — and here's what it does to your loan."
        : "Your money at a glance — every flow in one place."}</PageHead>

      {/* Hero */}
      {showHero && (
      <Card className="hero-card" style={{ padding: "clamp(22px,4vw,34px)", marginBottom: 16 }}>
        <div className="hero-grid" style={!showLoan || !showSweep ? { gridTemplateColumns: "1fr" } : null}>
          {showSweep && (
          <div className="hero-left">
            <span className="section-label" style={{ marginBottom: 10 }}>Your monthly Sweep</span>
            <div className="num hero-sweep" style={{ color: t.sweep >= 0 ? "var(--ink)" : "var(--neg)" }}>
              <CountMoney value={t.sweep} currency={cur} />
            </div>
            <p style={{ color: "var(--ink-dim)", margin: "12px 0 18px", fontSize: 15.5, maxWidth: "36ch" }}>
              {t.sweep > 0
                ? <>Headed to <b style={{ color: "var(--ink)" }}>{destLabel.toLowerCase()}</b> every month. That leftover dollar is doing real work.</>
                : "Free up a dollar of spending and your Sweep starts working for you."}
            </p>
            <div className="flex gap8 wrap">
              <button className="btn btn-accent" onClick={() => goTo("sweep")}><Icon name="arrowdown" size={16} />Run the Sweep</button>
              {showLoan && <button className="btn btn-ghost" onClick={() => goTo("loan")}><Icon name="scale" size={16} />Loan calculator</button>}
            </div>
          </div>)}

          {showLoan && (
          <div className="hero-impact">
            <div className="impact-glow"></div>
            <span className="section-label" style={{ marginBottom: 6 }}>Payoff impact</span>
            {bothFinite ? (
              <>
                <div className="impact-line">
                  <span className="num impact-big">{yearsSaved.toFixed(1)}</span>
                  <span className="impact-unit">years sooner</span>
                </div>
                <div className="impact-and">and</div>
                <div className="impact-line">
                  <span className="num impact-big pos">{fmtMoney(interestSaved, cur, { decimals: 0 })}</span>
                  <span className="impact-unit">interest saved</span>
                </div>
                <div className="impact-foot">
                  <span>Loan-free by <b>{payoffDate(strategy.months)}</b></span>
                  <span style={{ color: "var(--ink-faint)" }}>was {payoffDate(baseline.months)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="impact-line">
                  <span className="num impact-big" style={{ color: "var(--ink-faint)" }}>—</span>
                  <span className="impact-unit">repayment too low to pay off</span>
                </div>
                <div className="impact-foot">
                  <span>Increase your repayment in the <b>Loan</b> tab to project a payoff.</span>
                </div>
              </>
            )}
          </div>)}
        </div>
      </Card>)}

      {/* Quick tiles */}
      <div className="tile-grid" style={{ marginBottom: 16 }}>
        <button className="tile-btn" onClick={() => goTo("accounts")}>
          <Tile label="In accounts" value={fmtMoney((s.accounts || []).reduce((a, x) => a + (+x.balance || 0) * (x.type === "credit" ? -1 : 1), 0), cur, { decimals: 0 })} sub={`${(s.accounts || []).length} accounts`} icon="bank" />
        </button>
        <button className="tile-btn" onClick={() => goTo("income")}>
          <Tile label="Income" value={fmtMoney(t.totalIncome, cur, { decimals: 0 })} sub="per month" icon="wallet" />
        </button>
        <button className="tile-btn" onClick={() => goTo("budget")}>
          <Tile label="Budgeted" value={fmtMoney(t.budgetedMonthly, cur, { decimals: 0 })} sub="planned / month" icon="receipt" />
        </button>
        <button className="tile-btn" onClick={() => goTo("transactions")}>
          <Tile label="Spent" value={fmtMoney(t.actualMonthly, cur, { decimals: 0 })} sub="last 30 days" icon="cart" tone={t.actualMonthly > t.budgetedMonthly ? "neg" : "pos"} />
        </button>
        <button className="tile-btn" onClick={() => goTo("sweep")}>
          <Tile label="Net position" value={fmtMoney(t.sweep, cur, { decimals: 0 })} sub={t.sweep >= 0 ? "in the black" : "over budget"} icon="trend" tone={t.sweep >= 0 ? "pos" : "neg"} />
        </button>
      </div>

      {/* Budget vs Spent */}
      <Card style={{ padding: 22, marginBottom: 16 }}>
        <div className="bv-head">
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 640, letterSpacing: "-0.02em" }}>Budgeted vs spent</h2>
            <p style={{ color: "var(--ink-faint)", margin: "3px 0 0", fontSize: 13 }}>Every category, every section — comparing what you planned to what you logged.</p>
          </div>
          <div className="bv-controls">
            <div className="bv-nav">
              <button className="iconbtn" style={{ width: 34, height: 34 }} onClick={() => setOffset(offset + 1)} disabled={period === "all"} title="Previous period" aria-label="Previous period">
                <Icon name="x" size={14} style={{ display: "none" }} />
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
              </button>
              <span className="bv-period-label">{win.label}</span>
              <button className="iconbtn" style={{ width: 34, height: 34 }} onClick={() => setOffset(Math.max(0, offset - 1))} disabled={period === "all" || offset === 0} title="Next period" aria-label="Next period">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            </div>
            <div className="seg">
              {Object.entries(PERIODS).map(([k, p]) => (
                <button key={k} className={period === k ? "on" : ""} onClick={() => setPeriod(k)}>{p.label}</button>
              ))}
            </div>
          </div>
        </div>
        <BudgetVsSpent s={s} period={period} win={win} cur={cur} />
      </Card>
    </div>
  );
}

/* ---- The chart + per-category breakdown ---- */
function BudgetVsSpent({ s, period, win, cur }) {
  const spent = spentByCategoryInWindow(s, win);
  const sections = s.budget.sections || [];
  const isAll = period === "all";
  const periodLabel = isAll ? "all-time" : (PERIODS[period] || PERIODS.monthly).label.toLowerCase();

  // Build category rows per section
  const sectionRows = sections.map((sec) => {
    const rows = sec.items.map((item) => {
      const b = budgetedIn(item, period);
      const a = spent[item.id] || 0;
      return { id: item.id, name: item.name || "Untitled", budgeted: b, spent: a, diff: b - a };
    });
    const totals = rows.reduce((acc, r) => ({ budgeted: acc.budgeted + r.budgeted, spent: acc.spent + r.spent }), { budgeted: 0, spent: 0 });
    return { id: sec.id, name: sec.name, rows, totals };
  });

  // Orphaned (uncategorised) transactions
  const orphanSpent = spent["__uncat"] || 0;

  const all = sectionRows.flatMap((sec) => sec.rows);
  const grandBudgeted = all.reduce((a, r) => a + r.budgeted, 0);
  const grandSpent = all.reduce((a, r) => a + r.spent, 0) + orphanSpent;
  const max = Math.max(grandBudgeted / Math.max(1, all.length), ...all.map((r) => Math.max(r.budgeted, r.spent)), 1);

  return (
    <div>
      {/* Summary strip */}
      <div className="bv-summary">
        <div>
          <span className="bv-label">{isAll ? "Budgeted (monthly rate)" : `Budgeted (${periodLabel})`}</span>
          <span className="num bv-value">{fmtMoney(grandBudgeted, cur, { decimals: 0 })}</span>
        </div>
        <div>
          <span className="bv-label">Spent ({periodLabel})</span>
          <span className="num bv-value">{fmtMoney(grandSpent, cur, { decimals: 0 })}</span>
        </div>
        <div>
          <span className="bv-label">{isAll ? "Transactions logged" : "Difference"}</span>
          {isAll
            ? <span className="num bv-value">{(s.transactions || []).length}</span>
            : <span className={`num bv-value ${grandBudgeted - grandSpent >= 0 ? "pos" : "neg"}`}>
                {grandBudgeted - grandSpent >= 0 ? "+" : ""}{fmtMoney(grandBudgeted - grandSpent, cur, { decimals: 0 })}
              </span>}
        </div>
      </div>

      {/* Bar chart: each category gets paired budget + spent columns */}
      <BvBarChart rows={all} max={max} cur={cur} />

      {/* Section breakdowns */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 22 }}>
        {sectionRows.map((sec) => (
          <div key={sec.id} className="bv-section">
            <div className="bv-section-head">
              <h3>{sec.name}</h3>
              <span className="num bv-section-totals">
                <span style={{ color: "var(--ink-dim)" }}>{fmtMoney(sec.totals.spent, cur, { decimals: 0 })}</span>
                <span style={{ color: "var(--ink-faint)" }}> / {fmtMoney(sec.totals.budgeted, cur, { decimals: 0 })}</span>
              </span>
            </div>
            {sec.rows.length === 0 && <p style={{ color: "var(--ink-faint)", fontSize: 13, margin: 0 }}>No categories in this section.</p>}
            {sec.rows.map((r) => <BvRow key={r.id} r={r} max={Math.max(r.budgeted, r.spent, 1)} cur={cur} />)}
          </div>
        ))}
        {orphanSpent > 0 && (
          <div className="bv-section">
            <div className="bv-section-head">
              <h3 style={{ color: "var(--ink-dim)" }}>Uncategorised</h3>
              <span className="num bv-section-totals"><span className="neg">{fmtMoney(orphanSpent, cur, { decimals: 0 })}</span></span>
            </div>
            <p style={{ color: "var(--ink-faint)", fontSize: 13, margin: 0 }}>Transactions logged without a budget category. Open Transactions to tag them.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function BvBarChart({ rows, max, cur }) {
  if (rows.length === 0) return null;
  // When there are many categories, expand the chart's intrinsic width so columns
  // stay readable and the container scrolls horizontally instead of squishing.
  const colWidth = rows.length > 8 ? 72 : null;
  const styleVars = { "--cols": rows.length };
  const innerStyle = colWidth ? { width: rows.length * (colWidth + 4) + 12 } : {};
  return (
    <div className="bv-chart-wrap">
      <div className="bv-legend">
        <span><i className="bv-sw bv-sw-budget"></i>Budgeted</span>
        <span><i className="bv-sw bv-sw-spent"></i>Spent</span>
        <span><i className="bv-sw bv-sw-over"></i>Over</span>
      </div>
      <div className="bv-chart" style={{ ...styleVars, ...innerStyle }}>
        {rows.map((r) => {
          const bh = max > 0 ? (r.budgeted / max) * 100 : 0;
          const sh = max > 0 ? (r.spent / max) * 100 : 0;
          const over = r.spent > r.budgeted && r.budgeted > 0;
          return (
            <div key={r.id} className="bv-col">
              <div className="bv-bars">
                <div className="bv-bar bv-bar-budget" style={{ height: `${bh}%` }} title={`Budgeted: ${fmtMoney(r.budgeted, cur)}`}></div>
                <div className={`bv-bar bv-bar-spent ${over ? "over" : ""}`} style={{ height: `${sh}%` }} title={`Spent: ${fmtMoney(r.spent, cur)}`}></div>
              </div>
              <div className="bv-col-label">{r.name}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BvRow({ r, max, cur }) {
  const over = r.spent > r.budgeted && r.budgeted > 0;
  const pct = (v) => max > 0 ? (v / max) * 100 : 0;
  return (
    <div className="bv-row">
      <div className="bv-row-name">{r.name}</div>
      <div className="bv-row-bars">
        <div className="bv-row-bar">
          <span className="bv-fill bv-fill-budget" style={{ width: `${pct(r.budgeted)}%` }}></span>
        </div>
        <div className="bv-row-bar">
          <span className={`bv-fill bv-fill-spent ${over ? "over" : ""}`} style={{ width: `${pct(r.spent)}%` }}></span>
        </div>
      </div>
      <div className="bv-row-figures num">
        <span className="bv-fig-spent">{fmtMoney(r.spent, cur, { decimals: 0 })}</span>
        <span className="bv-fig-sep">/ {fmtMoney(r.budgeted, cur, { decimals: 0 })}</span>
        <span className={`bv-diff ${r.diff >= 0 ? "pos" : "neg"}`}>
          {r.diff >= 0 ? "+" : "−"}{fmtMoney(Math.abs(r.diff), cur, { decimals: 0 })}
        </span>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard, BudgetVsSpent, BvBarChart, BvRow });
