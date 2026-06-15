/* ============================================================
   tabs_loan.jsx — Loan Calculator + Smart Money Moves
   ============================================================ */

/* Small SVG payoff-curve chart: baseline vs strategy balance over time */
function PayoffChart({ baseline, strategy, currency }) {
  const W = 560, H = 200, pad = 6;
  const maxM = Math.max(baseline.months, strategy.months, 1);
  const maxB = Math.max(baseline.schedule[0]?.balance || 1, strategy.schedule[0]?.balance || 1, 1);
  if (!isFinite(maxM)) return null;

  const pts = (sched, months) => {
    const all = [{ month: 0, balance: maxB }, ...sched];
    return all.map((p) => {
      const x = pad + (p.month / maxM) * (W - pad * 2);
      const y = pad + (1 - p.balance / maxB) * (H - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  };
  const area = (sched) => {
    const line = pts(sched);
    const lastX = pad + (Math.min(sched[sched.length - 1]?.month || 0, maxM) / maxM) * (W - pad * 2);
    return `${line} ${lastX.toFixed(1)},${H - pad} ${pad},${H - pad}`;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="stratFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.30" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={pad} x2={W - pad} y1={pad + g * (H - pad * 2)} y2={pad + g * (H - pad * 2)} stroke="var(--stroke-soft)" strokeWidth="1" />
      ))}
      <polygon points={area(strategy.schedule)} fill="url(#stratFill)" />
      <polyline points={pts(baseline.schedule)} fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeDasharray="5 5" />
      <polyline points={pts(strategy.schedule)} fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* Hoisted outside LoanTab so React doesn't unmount the inputs every render
   (which steals focus and made you click back in after every keystroke). */
function LoanFreqSelect({ value, onChange, disabled }) {
  return (
    <select className="loan-select" value={value} disabled={disabled}
      onChange={(e) => onChange(e.target.value)} aria-label="Repayment frequency">
      <option value="weekly">Weekly</option>
      <option value="fortnightly">Fortnightly</option>
      <option value="monthly">Monthly</option>
    </select>
  );
}

function LoanField({ label, value, onChange, suffix, money, hint, currency }) {
  return (
    <div className="loan-field">
      <label>{label}</label>
      <div className="loan-input">
        {money && <span className="pre">{curSymbol(currency)}</span>}
        <input className="num" inputMode="decimal" value={value} style={{ paddingLeft: money ? 24 : 12 }}
          onChange={(e) => onChange(e.target.value === "" ? 0 : (parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0))} />
        {suffix && <span className="suf">{suffix}</span>}
      </div>
      {hint && <span className="loan-hint">{hint}</span>}
    </div>
  );
}

function LoanTab() {
  const s = useStore();
  const cur = s.settings.currency;
  const t = computeTotals(s);
  const L = s.loan;
  const ex = loanExtras(s, t);

  const payment = ex.payment;
  const offsetAuto = hasOffsetAccounts(s);
  const offsetVal = ex.offset;
  const baseline = simulateLoan({ balance: L.balance, annualRatePct: L.rate, payment, offset: 0, extra: 0 });
  const strategy = simulateLoan({ balance: L.balance, annualRatePct: L.rate, payment, offset: offsetVal, extra: ex.extra });
  const interestSaved = baseline.totalInterest - strategy.totalInterest;
  const monthsSaved = baseline.months - strategy.months;
  const bothFinite = isFinite(baseline.months) && isFinite(strategy.months);
  const strategyPaysOff = isFinite(strategy.months);

  const setLoan = (k, v) => Store.set("loan." + k, v);

  return (
    <div>
      <PageHead title="Loan Calculator">A true month-by-month amortisation. Your offset lowers the balance interest is charged on; extra payments compound. The extra auto-fills from your live Sweep — but you can override it.</PageHead>

      <div className="grid2" style={{ gridTemplateColumns: "0.95fr 1.05fr", alignItems: "start" }}>
        {/* Inputs */}
        <Card style={{ padding: 22 }}>
          <span className="section-label">Your loan</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <LoanField label="Loan balance" currency={cur} money value={L.balance} onChange={(v) => setLoan("balance", v)} />
            <LoanField label="Interest rate" currency={cur} suffix="%" value={L.rate} onChange={(v) => setLoan("rate", v)} hint="Update manually when your rate changes." />
          </div>

          <div className="loan-field" style={{ marginTop: 14 }}>
            <label>Repayment</label>
            <div className="flex gap8">
              <div className="loan-input" style={{ flex: 1 }}>
                <span className="pre">{curSymbol(cur)}</span>
                <input className="num" inputMode="decimal" value={L.repayment} style={{ paddingLeft: 24 }}
                  onChange={(e) => setLoan("repayment", e.target.value === "" ? 0 : (parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0))} />
              </div>
              <LoanFreqSelect value={L.repayFreq} onChange={(v) => setLoan("repayFreq", v)} />
            </div>
            <span className="loan-hint">≈ {fmtMoney(toMonthly(L.repayment, L.repayFreq), cur)}/mo · {fmtMoney(toAnnual(L.repayment, L.repayFreq), cur, { decimals: 0 })}/yr</span>
          </div>

          <div className="loan-field" style={{ marginTop: 14 }}>
            {offsetAuto ? (
              <>
                <label style={{ fontSize: 12.5, color: "var(--ink-dim)", fontWeight: 500, display: "block", marginBottom: 6 }}>Offset balance</label>
                <div className="loan-input">
                  <span className="pre">{curSymbol(cur)}</span>
                  <input className="num" disabled value={offsetVal} style={{ paddingLeft: 24, opacity: 0.75 }} />
                  <span className="suf"><Icon name="lock" size={11} /></span>
                </div>
                <span className="loan-hint">
                  <Icon name="bank" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
                  Auto-synced from {s.accounts.filter((a) => a.type === "offset").length} offset {s.accounts.filter((a) => a.type === "offset").length === 1 ? "account" : "accounts"} — edit balances in the Accounts tab.
                </span>
              </>
            ) : (
              <LoanField label="Offset balance" currency={cur} money value={L.offset} onChange={(v) => setLoan("offset", v)} hint="Cash offsetting interest. Tag an account as “offset” in Accounts to auto-sync this." />
            )}
          </div>

          {/* Extra payment */}
          <div className="extra-box">
            <div className="flex between" style={{ marginBottom: 10 }}>
              <span style={{ fontWeight: 600, fontSize: 14.5 }}>Extra payment</span>
              <label className="flex gap8" style={{ fontSize: 13, color: "var(--ink-dim)", cursor: "pointer" }}>
                <input type="checkbox" className="toggle" style={{ transform: "scale(0.82)" }} checked={L.extraAuto} onChange={(e) => setLoan("extraAuto", e.target.checked)} />
                Auto from Sweep
              </label>
            </div>
            <div className="flex gap8" style={{ alignItems: "stretch" }}>
              <div className="loan-input big" style={{ flex: 1 }}>
                <span className="pre">{curSymbol(cur)}</span>
                <input className="num" inputMode="decimal" disabled={L.extraAuto}
                  value={L.extraAuto ? Math.max(0, Math.round(t.sweep)) : L.extraManual}
                  style={{ paddingLeft: 28, opacity: L.extraAuto ? 0.7 : 1 }}
                  onChange={(e) => setLoan("extraManual", parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0)} />
              </div>
              <LoanFreqSelect value={L.extraAuto ? "monthly" : L.extraFreq} disabled={L.extraAuto} onChange={(v) => setLoan("extraFreq", v)} />
            </div>
            <div className="flex gap8 wrap" style={{ marginTop: 10 }}>
              {L.extraAuto && <span className="chip accent"><Icon name="bolt" size={12} />Live Sweep {fmtMoney(Math.max(0, t.sweep), cur, { decimals: 0 })}/mo</span>}
              {ex.fortnightly > 0 && <span className="chip"><Icon name="refresh" size={12} />Fortnightly +{fmtMoney(ex.fortnightly, cur, { decimals: 0 })}</span>}
              {ex.roundUp > 0 && <span className="chip"><Icon name="trend" size={12} />Round-up +{fmtMoney(ex.roundUp, cur, { decimals: 0 })}</span>}
              <span className="chip">Effective extra {fmtMoney(ex.extra, cur, { decimals: 0 })}/mo</span>
            </div>
            <p className="loan-hint" style={{ marginTop: 10 }}>
              <Icon name="info" size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
              Boosts from Smart Money Moves (fortnightly, round-up) add on top automatically.
            </p>
          </div>
        </Card>

        {/* Outputs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {!strategyPaysOff && (
            <Card soft style={{ padding: "13px 16px" }} className="flex gap12 move-warn" >
              <Icon name="info" size={18} style={{ flex: "none" }} />
              <span>Your repayment doesn't cover the interest yet — the balance won't go down. Increase the repayment or extra payment to start paying it off.</span>
            </Card>
          )}
          <Card style={{ padding: 22 }}>
            <span className="section-label">With your strategy</span>
            <div className="tile-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Tile label="Loan-free in" value={fmtDuration(strategy.months)} sub="at this rate" icon="bolt" tone={strategyPaysOff ? "pos" : "neg"} />
              <Tile label="Payoff date" value={payoffDate(strategy.months)} sub={isFinite(baseline.months) ? `was ${payoffDate(baseline.months)}` : "without a plan: never"} icon="calendar" />
              <Tile label="Interest saved" value={bothFinite ? fmtMoney(Math.max(0, interestSaved), cur, { decimals: 0 }) : "—"} sub="vs no strategy" icon="coins" tone="pos" />
              <Tile label="Time saved" value={bothFinite ? fmtDuration(Math.max(0, monthsSaved)) : "—"} sub="off your loan" icon="trend" tone="pos" />
            </div>
          </Card>

          <Card style={{ padding: "20px 22px 16px" }}>
            <div className="flex between" style={{ marginBottom: 6 }}>
              <span className="section-label" style={{ margin: 0 }}>Balance over time</span>
              <span className="flex gap12" style={{ fontSize: 12 }}>
                <span className="flex gap8" style={{ color: "var(--ink-faint)" }}><i style={{ width: 14, height: 2, background: "var(--ink-faint)", display: "inline-block" }}></i>No strategy</span>
                <span className="flex gap8" style={{ color: "var(--accent-ink)" }}><i style={{ width: 14, height: 3, background: "var(--accent)", display: "inline-block", borderRadius: 2 }}></i>With Sweep</span>
              </span>
            </div>
            <PayoffChart baseline={baseline} strategy={strategy} currency={cur} />
            <div className="flex between" style={{ marginTop: 8, fontSize: 12, color: "var(--ink-faint)" }}>
              <span>Today</span><span>{payoffDate(baseline.months)}</span>
            </div>
          </Card>
        </div>
      </div>

      <Card soft style={{ padding: "14px 18px", marginTop: 16 }} className="flex gap12">
        <Icon name="info" size={18} style={{ color: "var(--accent)", flex: "none" }} />
        <span style={{ fontSize: 13.5, color: "var(--ink-dim)" }}>
          Rates change. When your lender adjusts, update the <b style={{ color: "var(--ink)" }}>interest rate</b> field above so every projection stays honest.
        </span>
      </Card>
    </div>
  );
}

Object.assign(window, { LoanTab, PayoffChart });
