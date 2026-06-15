/* ============================================================
   tabs_spend.jsx — Misc Purchases, The Sweep
   ============================================================ */

function MiscTab() {
  const s = useStore();
  const cur = s.settings.currency;
  const grid = { gridTemplateColumns: "1.8fr 1fr 40px" };
  const total = s.misc.items.reduce((a, m) => a + (+m.amount || 0), 0);
  const allowance = +s.misc.allowance || 0;
  const over = total > allowance;

  const add = () => Store.update("misc.items", (l) => [...l, { id: uid(), name: "", amount: 0 }]);
  const edit = (id, key, val) => Store.update("misc.items", (l) => l.map((r) => r.id === id ? { ...r, [key]: val } : r));
  const del = (id) => Store.update("misc.items", (l) => l.filter((r) => r.id !== id));

  return (
    <div>
      <PageHead title="Misc Purchases">The honest list — one-offs and impulse buys. Set an allowance and they stay inside a buffer, so a spontaneous splurge doesn't quietly eat your Sweep.</PageHead>

      <div className="grid2 mb16">
        <Card soft className="tile" style={{ gap: 12 }}>
          <span className="label" style={{ color: "var(--ink-dim)", fontSize: 13 }}>Monthly misc allowance</span>
          <div style={{ maxWidth: 220 }}>
            <AmountCell value={s.misc.allowance} currency={cur} align="left" onChange={(v) => Store.set("misc.allowance", v)} />
          </div>
          <span className="sub">A reserved buffer. Spend under it and your Sweep is safe; go over and only the overspend bites.</span>
        </Card>
        <Card soft className="tile" style={{ gap: 10 }}>
          <span className="label" style={{ color: "var(--ink-dim)", fontSize: 13 }}>This month</span>
          <div className="value num" style={{ color: over ? "var(--neg)" : "var(--pos)" }}>{fmtMoney(total, cur)}</div>
          <Bar pct={allowance > 0 ? (total / allowance) * 100 : 0} over={over} />
          <span className="sub">{over
            ? `${fmtMoney(total - allowance, cur)} over allowance`
            : `${fmtMoney(allowance - total, cur)} left in allowance`}</span>
        </Card>
      </div>

      <Card className="tablecard">
        <div className="row head" style={grid}>
          <span>Purchase</span><span style={{ textAlign: "right" }}>Amount</span><span></span>
        </div>
        {s.misc.items.length === 0 && (
          <Empty icon="cart" title="Nothing impulse-bought yet" sub="That's either discipline or denial." action={<button className="btn btn-accent" onClick={add}><Icon name="plus" size={16} />Add a purchase</button>} />
        )}
        {s.misc.items.map((r) => (
          <div className="row" style={grid} key={r.id}>
            <TextCell value={r.name} placeholder="e.g. New headphones" onChange={(v) => edit(r.id, "name", v)} />
            <AmountCell value={r.amount} currency={cur} onChange={(v) => edit(r.id, "amount", v)} />
            <DelBtn onClick={() => del(r.id)} />
          </div>
        ))}
        {s.misc.items.length > 0 && (
          <div className="row total" style={grid}>
            <span>Total spent</span>
            <span className="num" style={{ textAlign: "right" }}>{fmtMoney(total, cur)}</span>
            <span></span>
          </div>
        )}
      </Card>
      <AddRow onClick={add} label="Add purchase" />
    </div>
  );
}

/* ---------------- The Sweep ---------------- */
const SWEEP_DESTS = {
  offset:  { label: "Mortgage offset", icon: "bank",  blurb: "Park it against your loan balance so you're charged less interest." },
  highest: { label: "Highest-interest debt", icon: "flame", blurb: "Attack the most expensive debt first — the avalanche method." },
  custom:  { label: "Custom goal", icon: "target", blurb: "Send it toward a goal you name." },
};

function SweepTab({ goTo }) {
  const s = useStore();
  const cur = s.settings.currency;
  const t = computeTotals(s);
  const dest = s.sweep.destination;
  const [justSwept, setJustSwept] = React.useState(false);

  const runSweep = () => {
    if (t.sweep <= 0) return;
    const entry = { id: uid(), date: todayLocal(), amount: Math.round(t.sweep), dest };
    Store.update("sweep.history", (h) => [entry, ...h]);
    setJustSwept(true);
    setTimeout(() => setJustSwept(false), 1600);
  };

  const lines = [
    { label: "Income", value: t.totalIncome, sign: "+" },
    { label: "Spending (logged)", value: -t.actualMonthly, sign: "−" },
    { label: "Misc buffer", value: -t.miscImpact, sign: "−" },
  ];
  if (t.carMonthly)     lines.push({ label: "Car expenses", value: -t.carMonthly, sign: "−" });
  if (t.savingsMonthly) lines.push({ label: "Savings contributions", value: -t.savingsMonthly, sign: "−" });
  if (t.retireMonthly)  lines.push({ label: "Retirement contributions", value: -t.retireMonthly, sign: "−" });
  if (t.sideExpense)    lines.push({ label: "Side-hustle costs", value: -t.sideExpense, sign: "−" });
  if (t.debtMinMonthly) lines.push({ label: "Debt minimums", value: -t.debtMinMonthly, sign: "−" });

  const totalSwept = s.sweep.history.reduce((a, h) => a + h.amount, 0);

  return (
    <div>
      <PageHead title="The Sweep">Whatever's left after everything is the most powerful dollar you've got. Choose where it goes — then watch it work.</PageHead>

      <div className="grid2" style={{ gridTemplateColumns: "1.15fr 0.85fr", alignItems: "start" }}>
        {/* Hero sweep figure */}
        <Card className={`sweep-hero ${justSwept ? "swept" : ""}`} style={{ padding: "30px 30px 26px", overflow: "hidden", position: "relative" }}>
          <div className="flex between" style={{ marginBottom: 6 }}>
            <span className="section-label" style={{ margin: 0 }}>Monthly Sweep</span>
            <span className="chip accent"><Icon name="arrowdown" size={13} />{SWEEP_DESTS[dest].label}</span>
          </div>
          <div className="num" style={{ fontSize: "clamp(40px,7vw,64px)", fontWeight: 680, letterSpacing: "-0.04em", lineHeight: 1, color: t.sweep >= 0 ? "var(--ink)" : "var(--neg)" }}>
            <CountMoney value={t.sweep} currency={cur} />
          </div>
          <p style={{ color: "var(--ink-dim)", margin: "12px 0 0", fontSize: 14.5 }}>
            {t.sweep > 0
              ? "Free every month to throw at your goal."
              : t.sweep === 0 ? "You're exactly balanced. Find one dollar to free up." : "You're over budget — trim spending to free up a Sweep."}
          </p>

          <div className="sweep-breakdown">
            {lines.map((l, i) => (
              <div className="flex between" key={i} style={{ padding: "7px 0", fontSize: 14 }}>
                <span style={{ color: "var(--ink-dim)" }}>{l.label}</span>
                <span className="num" style={{ color: l.value < 0 ? "var(--ink-dim)" : "var(--ink)" }}>{l.sign} {fmtMoney(Math.abs(l.value), cur)}</span>
              </div>
            ))}
            <div className="flex between" style={{ padding: "11px 0 0", marginTop: 4, borderTop: "1px solid var(--stroke)", fontWeight: 650 }}>
              <span>Sweep</span>
              <span className="num" style={{ color: t.sweep >= 0 ? "var(--pos)" : "var(--neg)" }}>{fmtMoney(t.sweep, cur)}</span>
            </div>
          </div>

          <button className="btn btn-accent" style={{ width: "100%", justifyContent: "center", marginTop: 20, padding: "13px" }}
            disabled={t.sweep <= 0} onClick={runSweep}>
            <Icon name="arrowdown" size={16} /> Sweep {fmtMoney(Math.max(0, t.sweep), cur, { decimals: 0 })} to {SWEEP_DESTS[dest].label.toLowerCase()}
          </button>
          {justSwept && <div className="swept-flash">Swept! ✨</div>}
        </Card>

        {/* Destination + history */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card soft style={{ padding: 18 }}>
            <span className="section-label">Send the Sweep to</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.entries(SWEEP_DESTS).map(([k, d]) => (
                <button key={k} className={`dest-opt ${dest === k ? "on" : ""}`} onClick={() => Store.set("sweep.destination", k)}>
                  <span className="dest-ic"><Icon name={d.icon} size={16} /></span>
                  <span style={{ flex: 1, textAlign: "left" }}>
                    <b style={{ display: "block", fontSize: 14.5, fontWeight: 600 }}>{d.label}</b>
                    <span style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>{d.blurb}</span>
                  </span>
                  {dest === k && <Icon name="check" size={16} />}
                </button>
              ))}
            </div>
            {dest === "custom" && (
              <input className="cell-input" style={{ marginTop: 10, background: "var(--glass-2)", border: "1px solid var(--stroke)" }}
                placeholder="Name your goal…" value={s.sweep.customName || ""}
                onChange={(e) => Store.set("sweep.customName", e.target.value)} />
            )}
            {dest === "offset" && (
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 10, width: "100%", justifyContent: "center" }} onClick={() => goTo && goTo("loan")}>
                <Icon name="scale" size={14} /> See the payoff impact
              </button>
            )}
          </Card>

          <Card soft style={{ padding: 18 }}>
            <div className="flex between" style={{ marginBottom: 12 }}>
              <span className="section-label" style={{ margin: 0 }}>Sweep history</span>
              <span className="chip">{fmtMoney(totalSwept, cur, { decimals: 0 })} total</span>
            </div>
            {s.sweep.history.length === 0 && <p style={{ color: "var(--ink-faint)", fontSize: 13, margin: 0 }}>Run your first Sweep to start the streak.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {s.sweep.history.slice(0, 8).map((h) => (
                <div className="flex between" key={h.id} style={{ padding: "8px 0", fontSize: 13.5, boxShadow: "0 -1px 0 var(--stroke-soft)" }}>
                  <span style={{ color: "var(--ink-dim)" }}>{parseYMD(h.date).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span>
                  <span className="flex gap8">
                    <span className="chip" style={{ fontSize: 11, padding: "2px 8px" }}>{SWEEP_DESTS[h.dest]?.label || h.dest}</span>
                    <span className="num pos" style={{ fontWeight: 600 }}>{fmtMoney(h.amount, cur, { decimals: 0 })}</span>
                    <button className="del-btn" style={{ opacity: 0.5 }} onClick={() => Store.update("sweep.history", (l) => l.filter((x) => x.id !== h.id))}><Icon name="x" size={13} /></button>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { MiscTab, SweepTab, SWEEP_DESTS });
