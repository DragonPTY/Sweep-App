/* ============================================================
   tabs_moves.jsx — Smart Money Moves
   Each strategy estimates real savings from the user's own loan.
   ============================================================ */

function MovesTab({ goTo }) {
  const s = useStore();
  const cur = s.settings.currency;
  const t = computeTotals(s);
  const L = s.loan;
  const payment = toMonthly(L.repayment, L.repayFreq);
  const offsetNow = +L.offset || 0;
  const baseline = simulateLoan({ balance: L.balance, annualRatePct: L.rate, payment, offset: 0, extra: 0 });

  // helper: savings of a scenario vs the do-nothing baseline
  const compare = ({ balance = L.balance, rate = L.rate, offset = 0, extra = 0 }) => {
    const sim = simulateLoan({ balance, annualRatePct: rate, payment, offset, extra });
    return {
      interestSaved: Math.max(0, baseline.totalInterest - sim.totalInterest),
      monthsSaved: Math.max(0, baseline.months - sim.months),
      pct: baseline.totalInterest > 0 ? Math.max(0, (baseline.totalInterest - sim.totalInterest) / baseline.totalInterest) * 100 : 0,
    };
  };

  const sweepAmt = Math.max(0, Math.round(t.sweep));
  const fortnightlyExtra = payment / 12;
  const roundUpExtra = Math.ceil(payment / 50) * 50 - payment;
  const windfall = Math.round(t.totalIncome); // assume ~1 month income lands once
  const refiRate = Math.max(0.5, L.rate - 0.5);
  const debtTotal = s.debt.reduce((a, d) => a + (+d.balance || 0), 0);
  const debtWAvg = debtTotal > 0 ? s.debt.reduce((a, d) => a + (+d.balance || 0) * (+d.rate || 0), 0) / debtTotal : 0;

  const MOVES = [
    {
      key: "sweep", name: "The Monthly Sweep", icon: "arrowdown", difficulty: "Easy", tag: "Foundational",
      what: "Send every leftover dollar at month's end straight onto your loan or offset.",
      how: "After bills, expenses and a misc buffer, whatever remains gets swept on as an extra repayment. It lands on principal, so it compounds — each sweep shrinks the interest you're charged next month.",
      est: compare({ extra: sweepAmt }),
      estLabel: `Sweeping ${fmtMoney(sweepAmt, cur, { decimals: 0 })}/mo`,
      action: "Open The Sweep tab, confirm your destination, and run it every payday.",
      cta: { label: "Go to The Sweep", to: "sweep" },
    },
    {
      key: "fortnightly", name: "Switch to fortnightly repayments", icon: "refresh", difficulty: "Easy", tag: "Set & forget",
      what: "Pay half your monthly amount every two weeks instead of once a month.",
      how: "There are 26 fortnights but only 12 months — so you quietly make the equivalent of 13 monthly payments a year. That one extra payment goes entirely to principal.",
      est: compare({ extra: fortnightlyExtra }),
      estLabel: `≈ ${fmtMoney(fortnightlyExtra, cur, { decimals: 0 })}/mo extra`,
      action: "Ask your lender to switch the schedule, then apply it here so the calculator counts it.",
      apply: "fortnightly",
    },
    {
      key: "offset", name: "Offset account strategy", icon: "bank", difficulty: "Medium", tag: "Powerful",
      what: "Keep your savings in an offset account linked to the loan.",
      how: "Every dollar sitting in the offset is subtracted from the balance before interest is calculated — without you ever 'spending' it. It stays accessible, but works like an extra repayment.",
      est: compare({ offset: offsetNow || 10000 }),
      estLabel: offsetNow ? `Your ${fmtMoney(offsetNow, cur, { decimals: 0 })} offset` : `Example ${fmtMoney(10000, cur, { decimals: 0 })} offset`,
      action: "Route your salary and emergency fund into the offset instead of a plain savings account.",
      cta: { label: "Set offset in calculator", to: "loan" },
    },
    {
      key: "roundup", name: "Round-up repayments", icon: "trend", difficulty: "Easy", tag: "Painless",
      what: `Round your repayment up to the nearest ${fmtMoney(Math.ceil(payment / 50) * 50, cur, { decimals: 0 })}.`,
      how: "A small, barely-noticeable bump on every repayment shaves the principal a little faster — and the effect compounds over the life of the loan.",
      est: compare({ extra: roundUpExtra }),
      estLabel: `+${fmtMoney(roundUpExtra, cur, { decimals: 0 })}/mo`,
      action: "Apply the round-up here, then set the higher amount as your direct debit.",
      apply: "roundUp",
    },
    {
      key: "windfalls", name: "Redirect windfalls", icon: "coins", difficulty: "Medium", tag: "Opportunistic",
      what: "Tax refunds, bonuses and gifts go onto the loan, not into lifestyle.",
      how: "Lump sums hit the principal directly. Dropped in early, a single windfall can wipe out years of future interest because of how amortisation front-loads interest.",
      est: compare({ balance: Math.max(0, L.balance - windfall) }),
      estLabel: `One ${fmtMoney(windfall, cur, { decimals: 0 })} lump, now`,
      action: "Pre-commit: the moment a windfall lands, transfer it before it's 'normal' money.",
    },
    {
      key: "refi", name: "Rate review / refinance", icon: "scale", difficulty: "Medium", tag: "High-leverage",
      what: `Negotiate or switch to a lower rate — even ${(L.rate - refiRate).toFixed(1)}% helps.`,
      how: "Your rate is the single biggest lever. A lower rate cuts the interest charged on every remaining dollar. Lenders discount to keep you — or a competitor will.",
      est: compare({ rate: refiRate }),
      estLabel: `${L.rate}% → ${refiRate.toFixed(1)}%`,
      action: "Call your lender, ask for their best rate, and name a competitor's offer.",
    },
    {
      key: "consolidate", name: "Debt consolidation", icon: "layers", difficulty: "Medium", tag: "Simplify",
      what: "Roll high-interest debts into one lower-rate facility.",
      how: debtTotal > 0
        ? `Your tracked debts average ${debtWAvg.toFixed(1)}%. Consolidating toward your home-loan rate of ${L.rate}% cuts the interest while leaving one simple payment.`
        : "Combine credit cards and personal loans into a single, cheaper facility — one payment, less interest, faster payoff.",
      est: debtTotal > 0
        ? { interestSaved: Math.max(0, debtTotal * (debtWAvg - L.rate) / 100), monthsSaved: 0, pct: debtWAvg > 0 ? (debtWAvg - L.rate) / debtWAvg * 100 : 0, perYear: true }
        : compare({ extra: 0 }),
      estLabel: debtTotal > 0 ? `${fmtMoney(debtTotal, cur, { decimals: 0 })} of debt @ ${debtWAvg.toFixed(1)}%` : "Turn on Debt Tracker for figures",
      action: debtTotal > 0 ? "Compare a consolidation loan's rate and fees against your weighted average above." : "Enable the Debt Tracker module to estimate your saving.",
    },
    {
      key: "float", name: "Credit-card float", icon: "bolt", difficulty: "Advanced", tag: "Caution", danger: true,
      what: "Spend on a 55-day interest-free card; keep your cash in the offset until the bill is due.",
      how: "Your money offsets the loan for an extra ~6 weeks each cycle before you clear the card in full. The saving is real but small, and it only works with ironclad discipline.",
      est: { interestSaved: (t.totalSpending * 0.6) * (L.rate / 100) * (1.5 / 12) * 12 / 12 * 12, monthsSaved: 0, pct: 0, perYear: true, rough: (t.expensesActual + t.miscImpact) * (L.rate / 100) * (1.5 / 12), },
      estLabel: "Modest — discipline required",
      action: "Only attempt with autopay-in-full set. One missed payment at card rates erases years of saving.",
      warn: "Never carry a balance. Credit-card interest (often 18–22%) dwarfs any float benefit and will undo the whole strategy.",
    },
  ];

  const [open, setOpen] = React.useState("sweep");
  const move = MOVES.find((m) => m.key === open) || MOVES[0];
  const boosts = L.boosts || {};

  return (
    <div>
      <PageHead title="Smart Money Moves">Proven strategies, costed against your own numbers. Pick one, see exactly what it saves you, and apply the ones that feed your loan plan.</PageHead>

      <div className="field" style={{ maxWidth: 460, marginBottom: 22 }}>
        <label>Choose a strategy</label>
        <select value={open} onChange={(e) => setOpen(e.target.value)}>
          {MOVES.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
        </select>
      </div>

      <div className="grid2" style={{ gridTemplateColumns: "1.3fr 0.7fr", alignItems: "start" }}>
        <Card style={{ padding: 26 }} className={move.danger ? "move-danger" : ""}>
          <div className="flex gap12" style={{ marginBottom: 16 }}>
            <span className="move-ic"><Icon name={move.icon} size={20} /></span>
            <div>
              <div className="flex gap8 wrap" style={{ marginBottom: 4 }}>
                <span className={`chip ${move.danger ? "" : "accent"}`} style={{ fontSize: 11 }}>{move.tag}</span>
                <span className="chip" style={{ fontSize: 11 }}><Diff level={move.difficulty} /> {move.difficulty}</span>
              </div>
              <h2 style={{ margin: 0, fontSize: 21, fontWeight: 640, letterSpacing: "-0.02em" }}>{move.name}</h2>
            </div>
          </div>

          <p style={{ fontSize: 16, color: "var(--ink)", margin: "0 0 16px", lineHeight: 1.5 }}>{move.what}</p>
          <div className="move-sec">
            <span className="section-label">How it works</span>
            <p style={{ margin: 0, color: "var(--ink-dim)", lineHeight: 1.6, fontSize: 14.5 }}>{move.how}</p>
          </div>

          {move.warn && (
            <div className="move-warn">
              <Icon name="info" size={18} style={{ flex: "none" }} />
              <span>{move.warn}</span>
            </div>
          )}

          <div className="move-sec">
            <span className="section-label">Your one action step</span>
            <div className="flex gap12" style={{ alignItems: "flex-start" }}>
              <span className="step-num">1</span>
              <p style={{ margin: 0, color: "var(--ink)", lineHeight: 1.55, fontSize: 14.5, flex: 1 }}>{move.action}</p>
            </div>
          </div>

          <div className="flex gap12 wrap" style={{ marginTop: 22 }}>
            {move.apply && (
              <button className={`btn ${boosts[move.apply] ? "btn-ghost" : "btn-accent"}`}
                onClick={() => Store.update("loan.boosts", (b) => ({ ...b, [move.apply]: !b[move.apply] }))}>
                <Icon name={boosts[move.apply] ? "check" : "plus"} size={16} />
                {boosts[move.apply] ? "Applied to loan plan" : "Apply to loan plan"}
              </button>
            )}
            {move.cta && <button className="btn btn-ghost" onClick={() => goTo && goTo(move.cta.to)}>{move.cta.label} →</button>}
          </div>
        </Card>

        <Card soft style={{ padding: 22 }} className="move-savings">
          <span className="section-label">Estimated saving</span>
          <div className="num" style={{ fontSize: 38, fontWeight: 680, letterSpacing: "-0.03em", color: "var(--pos)", lineHeight: 1.05 }}>
            {fmtMoney(move.est.rough != null ? move.est.rough * 12 : move.est.interestSaved, cur, { decimals: 0 })}
          </div>
          <div style={{ color: "var(--ink-dim)", fontSize: 13.5, marginTop: 4 }}>
            {move.est.perYear ? "saved per year" : "less interest, total"}
          </div>
          <div style={{ height: 1, background: "var(--stroke)", margin: "16px 0" }}></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {move.est.monthsSaved > 0 && (
              <Stat label="Time off your loan" value={fmtDuration(move.est.monthsSaved)} />
            )}
            {move.est.pct > 0 && (
              <Stat label={move.est.perYear ? "Rate reduction" : "Interest cut"} value={`${move.est.pct.toFixed(move.est.pct < 10 ? 1 : 0)}%`} />
            )}
            <Stat label="Difficulty" value={move.difficulty} />
            <Stat label="Based on" value={move.estLabel} small />
          </div>
          <p className="loan-hint" style={{ marginTop: 16 }}>Estimates use your current loan figures. Update the Loan Calculator to refine them.</p>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, small }) {
  return (
    <div className="flex between" style={{ alignItems: "baseline", gap: 10 }}>
      <span style={{ color: "var(--ink-faint)", fontSize: 13 }}>{label}</span>
      <span className="num" style={{ fontWeight: 600, fontSize: small ? 12.5 : 15, textAlign: "right", color: small ? "var(--ink-dim)" : "var(--ink)" }}>{value}</span>
    </div>
  );
}
function Diff({ level }) {
  const n = level === "Easy" ? 1 : level === "Medium" ? 2 : 3;
  return (
    <span style={{ display: "inline-flex", gap: 2 }}>
      {[1, 2, 3].map((i) => (
        <i key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: i <= n ? "var(--accent)" : "var(--stroke)" }}></i>
      ))}
    </span>
  );
}

Object.assign(window, { MovesTab });
