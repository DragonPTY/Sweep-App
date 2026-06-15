/* ============================================================
   modules.jsx — optional, switch-on modules
   ============================================================ */

const MODULE_META = {
  car:        { name: "Car Expenses", icon: "car", blurb: "Running costs converted to a true monthly figure." },
  savings:    { name: "Savings Goals", icon: "piggy", blurb: "Targets with live progress bars." },
  shares:     { name: "Share Portfolio", icon: "chart", blurb: "Holdings, value and gain/loss." },
  retirement: { name: "Retirement Fund", icon: "bank", blurb: "Long-term balance and contributions." },
  side:       { name: "Side Hustle", icon: "briefcase", blurb: "Income, expenses and real profit." },
  debt:       { name: "Debt Tracker", icon: "flame", blurb: "Snowball & avalanche payoff order." },
};

/* ---- Car ---- */
function CarModule() {
  const s = useStore(); const cur = s.settings.currency;
  const grid = { gridTemplateColumns: "1.6fr 1fr 1.1fr 1fr 40px" };
  const add = () => Store.update("car", (l) => [...l, { id: uid(), name: "", amount: 0, freq: "monthly" }]);
  const edit = (id, k, v) => Store.update("car", (l) => l.map((r) => r.id === id ? { ...r, [k]: v } : r));
  const del = (id) => Store.update("car", (l) => l.filter((r) => r.id !== id));
  const total = s.car.reduce((a, c) => a + toMonthly(c.amount, c.freq), 0);
  return (
    <div>
      <PageHead title="Car Expenses">Fuel, rego, servicing, insurance — all normalised to a monthly cost that flows into your Sweep.</PageHead>
      <Card className="tablecard">
        <div className="row head" style={grid}><span>Expense</span><span style={{ textAlign: "right" }}>Amount</span><span>Frequency</span><span style={{ textAlign: "right" }}>Monthly <Lock /></span><span></span></div>
        {s.car.map((r) => (
          <div className="row" style={grid} key={r.id}>
            <TextCell value={r.name} placeholder="e.g. Fuel" onChange={(v) => edit(r.id, "name", v)} />
            <AmountCell value={r.amount} currency={cur} onChange={(v) => edit(r.id, "amount", v)} />
            <FreqCell value={r.freq} onChange={(v) => edit(r.id, "freq", v)} />
            <LockCell>{fmtMoney(toMonthly(r.amount, r.freq), cur)}</LockCell>
            <DelBtn onClick={() => del(r.id)} />
          </div>
        ))}
        <div className="row total" style={grid}><span>Total / month</span><span></span><span></span><span className="num" style={{ textAlign: "right" }}>{fmtMoney(total, cur)}</span><span></span></div>
      </Card>
      <AddRow onClick={add} label="Add car expense" />
    </div>
  );
}

/* ---- Savings now lives in tab_savings.jsx ---- */

/* ---- Shares ---- */
function SharesModule() {
  const s = useStore(); const cur = s.settings.currency;
  const grid = { gridTemplateColumns: "1.5fr 0.8fr 1fr 1.1fr 1.1fr 1.1fr 40px" };
  const add = () => Store.update("shares", (l) => [...l, { id: uid(), name: "", units: 0, price: 0, cost: 0 }]);
  const edit = (id, k, v) => Store.update("shares", (l) => l.map((r) => r.id === id ? { ...r, [k]: v } : r));
  const del = (id) => Store.update("shares", (l) => l.filter((r) => r.id !== id));
  const value = s.shares.reduce((a, x) => a + (+x.units || 0) * (+x.price || 0), 0);
  const cost = s.shares.reduce((a, x) => a + (+x.cost || 0), 0);
  const gain = value - cost;
  return (
    <div>
      <PageHead title="Share Portfolio">Holdings at a glance. Update the price manually and your value and gain recalculate.</PageHead>
      <div className="tile-grid" style={{ marginBottom: 16, gridTemplateColumns: "repeat(3,1fr)" }}>
        <Tile label="Portfolio value" value={fmtMoney(value, cur, { decimals: 0 })} icon="chart" />
        <Tile label="Total cost" value={fmtMoney(cost, cur, { decimals: 0 })} icon="coins" />
        <Tile label="Gain / loss" value={`${gain >= 0 ? "+" : ""}${fmtMoney(gain, cur, { decimals: 0 })}`} sub={cost > 0 ? `${(gain / cost * 100).toFixed(1)}%` : ""} tone={gain >= 0 ? "pos" : "neg"} icon="trend" />
      </div>
      <Card className="tablecard">
        <div className="row head" style={grid}><span>Holding</span><span style={{ textAlign: "right" }}>Units</span><span style={{ textAlign: "right" }}>Price</span><span style={{ textAlign: "right" }}>Value <Lock /></span><span style={{ textAlign: "right" }}>Cost</span><span style={{ textAlign: "right" }}>Gain <Lock /></span><span></span></div>
        {s.shares.map((r) => {
          const val = (+r.units || 0) * (+r.price || 0); const g = val - (+r.cost || 0);
          return (
            <div className="row" style={grid} key={r.id}>
              <TextCell value={r.name} placeholder="e.g. Index fund" onChange={(v) => edit(r.id, "name", v)} />
              <input className="cell-input amount num" value={r.units} inputMode="decimal" onChange={(e) => edit(r.id, "units", parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0)} />
              <AmountCell value={r.price} currency={cur} onChange={(v) => edit(r.id, "price", v)} />
              <LockCell>{fmtMoney(val, cur, { decimals: 0 })}</LockCell>
              <AmountCell value={r.cost} currency={cur} onChange={(v) => edit(r.id, "cost", v)} />
              <LockCell><span className={g >= 0 ? "pos" : "neg"}>{g >= 0 ? "+" : ""}{fmtMoney(g, cur, { decimals: 0 })}</span></LockCell>
              <DelBtn onClick={() => del(r.id)} />
            </div>
          );
        })}
        <div className="row total" style={grid}><span>Totals</span><span></span><span></span><span className="num" style={{ textAlign: "right" }}>{fmtMoney(value, cur, { decimals: 0 })}</span><span className="num" style={{ textAlign: "right" }}>{fmtMoney(cost, cur, { decimals: 0 })}</span><span className="num" style={{ textAlign: "right" }}><span className={gain >= 0 ? "pos" : "neg"}>{gain >= 0 ? "+" : ""}{fmtMoney(gain, cur, { decimals: 0 })}</span></span><span></span></div>
      </Card>
      <AddRow onClick={add} label="Add holding" />
    </div>
  );
}

/* ---- Retirement ---- */
function RetirementModule() {
  const s = useStore(); const cur = s.settings.currency;
  const grid = { gridTemplateColumns: "1.6fr 1.2fr 1.2fr 40px" };
  const add = () => Store.update("retirement", (l) => [...l, { id: uid(), name: "", balance: 0, contrib: 0 }]);
  const edit = (id, k, v) => Store.update("retirement", (l) => l.map((r) => r.id === id ? { ...r, [k]: v } : r));
  const del = (id) => Store.update("retirement", (l) => l.filter((r) => r.id !== id));
  const bal = s.retirement.reduce((a, x) => a + (+x.balance || 0), 0);
  const contrib = s.retirement.reduce((a, x) => a + (+x.contrib || 0), 0);
  // simple projection: balance grows by contributions + 6% p.a. over 25 years
  const proj = (() => { let b = bal; for (let i = 0; i < 25 * 12; i++) b = b * (1 + 0.06 / 12) + contrib; return b; })();
  return (
    <div>
      <PageHead title="Retirement Fund">Your long-term balance and monthly contributions. Contributions feed your Sweep so today's plan and tomorrow's stay in sync.</PageHead>
      <div className="tile-grid" style={{ marginBottom: 16, gridTemplateColumns: "repeat(3,1fr)" }}>
        <Tile label="Current balance" value={fmtMoney(bal, cur, { decimals: 0 })} icon="bank" />
        <Tile label="Monthly contribution" value={fmtMoney(contrib, cur, { decimals: 0 })} icon="coins" />
        <Tile label="Projected in 25 yrs" value={fmtMoney(proj, cur, { decimals: 0 })} sub="at 6% p.a." tone="pos" icon="trend" />
      </div>
      <Card className="tablecard">
        <div className="row head" style={grid}><span>Fund</span><span style={{ textAlign: "right" }}>Balance</span><span style={{ textAlign: "right" }}>Monthly</span><span></span></div>
        {s.retirement.map((r) => (
          <div className="row" style={grid} key={r.id}>
            <TextCell value={r.name} placeholder="Fund name" onChange={(v) => edit(r.id, "name", v)} />
            <AmountCell value={r.balance} currency={cur} onChange={(v) => edit(r.id, "balance", v)} />
            <AmountCell value={r.contrib} currency={cur} onChange={(v) => edit(r.id, "contrib", v)} />
            <DelBtn onClick={() => del(r.id)} />
          </div>
        ))}
        <div className="row total" style={grid}><span>Totals</span><span className="num" style={{ textAlign: "right" }}>{fmtMoney(bal, cur, { decimals: 0 })}</span><span className="num" style={{ textAlign: "right" }}>{fmtMoney(contrib, cur, { decimals: 0 })}</span><span></span></div>
      </Card>
      <AddRow onClick={add} label="Add fund" />
    </div>
  );
}

/* ---- Side Hustle ---- */
function SideModule() {
  const s = useStore(); const cur = s.settings.currency;
  const grid = { gridTemplateColumns: "1.6fr 1fr 1.1fr 1fr 40px" };
  const addInc = () => Store.update("side.income", (l) => [...l, { id: uid(), name: "", amount: 0, freq: "monthly" }]);
  const addExp = () => Store.update("side.expense", (l) => [...l, { id: uid(), name: "", amount: 0, freq: "monthly" }]);
  const editInc = (id, k, v) => Store.update("side.income", (l) => l.map((r) => r.id === id ? { ...r, [k]: v } : r));
  const editExp = (id, k, v) => Store.update("side.expense", (l) => l.map((r) => r.id === id ? { ...r, [k]: v } : r));
  const delInc = (id) => Store.update("side.income", (l) => l.filter((r) => r.id !== id));
  const delExp = (id) => Store.update("side.expense", (l) => l.filter((r) => r.id !== id));
  const inc = s.side.income.reduce((a, x) => a + toMonthly(x.amount, x.freq), 0);
  const exp = s.side.expense.reduce((a, x) => a + toMonthly(x.amount, x.freq), 0);
  const profit = inc - exp;
  const Table = ({ items, edit, del, kind }) => (
    <Card className="tablecard">
      <div className="row head" style={grid}><span>{kind === "income" ? "Revenue" : "Cost"}</span><span style={{ textAlign: "right" }}>Amount</span><span>Frequency</span><span style={{ textAlign: "right" }}>Monthly <Lock /></span><span></span></div>
      {items.map((r) => (
        <div className="row" style={grid} key={r.id}>
          <TextCell value={r.name} placeholder={kind === "income" ? "e.g. Etsy sales" : "e.g. Materials"} onChange={(v) => edit(r.id, "name", v)} />
          <AmountCell value={r.amount} currency={cur} onChange={(v) => edit(r.id, "amount", v)} />
          <FreqCell value={r.freq} onChange={(v) => edit(r.id, "freq", v)} />
          <LockCell>{fmtMoney(toMonthly(r.amount, r.freq), cur)}</LockCell>
          <DelBtn onClick={() => del(r.id)} />
        </div>
      ))}
    </Card>
  );
  return (
    <div>
      <PageHead title="Side Hustle">Track the venture honestly — revenue in, costs out, real profit. The profit flows into your Sweep.</PageHead>
      <div className="tile-grid" style={{ marginBottom: 18, gridTemplateColumns: "repeat(3,1fr)" }}>
        <Tile label="Revenue" value={fmtMoney(inc, cur, { decimals: 0 })} sub="/ month" icon="coins" tone="pos" />
        <Tile label="Costs" value={fmtMoney(exp, cur, { decimals: 0 })} sub="/ month" icon="cart" />
        <Tile label="Net profit" value={fmtMoney(profit, cur, { decimals: 0 })} sub="feeds the Sweep" tone={profit >= 0 ? "pos" : "neg"} icon="trend" />
      </div>
      <span className="section-label">Revenue</span>
      <Table items={s.side.income} edit={editInc} del={delInc} kind="income" />
      <AddRow onClick={addInc} label="Add revenue source" />
      <div style={{ height: 22 }}></div>
      <span className="section-label">Costs</span>
      <Table items={s.side.expense} edit={editExp} del={delExp} kind="expense" />
      <AddRow onClick={addExp} label="Add cost" />
    </div>
  );
}

/* ---- Debt Tracker (snowball + avalanche) ---- */
function DebtModule() {
  const s = useStore(); const cur = s.settings.currency;
  const grid = { gridTemplateColumns: "1.6fr 1.1fr 0.9fr 1fr 40px" };
  const [method, setMethod] = React.useState("avalanche");
  const add = () => Store.update("debt", (l) => [...l, { id: uid(), name: "", balance: 0, rate: 0, min: 0 }]);
  const edit = (id, k, v) => Store.update("debt", (l) => l.map((r) => r.id === id ? { ...r, [k]: v } : r));
  const del = (id) => Store.update("debt", (l) => l.filter((r) => r.id !== id));
  const total = s.debt.reduce((a, d) => a + (+d.balance || 0), 0);
  const minTotal = s.debt.reduce((a, d) => a + (+d.min || 0), 0);
  const ordered = [...s.debt].sort((a, b) => method === "avalanche" ? (b.rate - a.rate) : (a.balance - b.balance));
  return (
    <div>
      <PageHead title="Debt Tracker">List every debt, then pick a payoff order. Avalanche kills the priciest interest first; snowball clears the smallest balance first for momentum.</PageHead>
      <div className="flex gap12 wrap mb16">
        <div className="seg">
          <button className={method === "avalanche" ? "on" : ""} onClick={() => setMethod("avalanche")}>Avalanche</button>
          <button className={method === "snowball" ? "on" : ""} onClick={() => setMethod("snowball")}>Snowball</button>
        </div>
        <span className="chip"><Icon name="flame" size={13} />{fmtMoney(total, cur, { decimals: 0 })} total debt</span>
        <span className="chip"><Icon name="receipt" size={13} />{fmtMoney(minTotal, cur, { decimals: 0 })}/mo minimums</span>
      </div>

      <Card className="tablecard">
        <div className="row head" style={grid}><span>Debt</span><span style={{ textAlign: "right" }}>Balance</span><span style={{ textAlign: "right" }}>Rate</span><span style={{ textAlign: "right" }}>Min / mo</span><span></span></div>
        {s.debt.map((r) => (
          <div className="row" style={grid} key={r.id}>
            <TextCell value={r.name} placeholder="e.g. Credit card" onChange={(v) => edit(r.id, "name", v)} />
            <AmountCell value={r.balance} currency={cur} onChange={(v) => edit(r.id, "balance", v)} />
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input className="cell-input amount num" value={r.rate} inputMode="decimal" style={{ paddingRight: 18 }} onChange={(e) => edit(r.id, "rate", parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0)} />
              <span style={{ position: "absolute", right: 8, color: "var(--ink-faint)", fontSize: 12, pointerEvents: "none" }}>%</span>
            </div>
            <AmountCell value={r.min} currency={cur} onChange={(v) => edit(r.id, "min", v)} />
            <DelBtn onClick={() => del(r.id)} />
          </div>
        ))}
        <div className="row total" style={grid}><span>Totals</span><span className="num" style={{ textAlign: "right" }}>{fmtMoney(total, cur, { decimals: 0 })}</span><span></span><span className="num" style={{ textAlign: "right" }}>{fmtMoney(minTotal, cur, { decimals: 0 })}</span><span></span></div>
      </Card>
      <AddRow onClick={add} label="Add debt" />

      <Card soft style={{ padding: 20, marginTop: 18 }}>
        <span className="section-label">{method === "avalanche" ? "Avalanche order — highest rate first" : "Snowball order — smallest balance first"}</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ordered.filter((d) => (+d.balance || 0) > 0).map((d, i) => (
            <div className="flex gap12" key={d.id} style={{ padding: "10px 12px", background: "var(--glass)", borderRadius: 11, border: "1px solid var(--stroke-soft)" }}>
              <span className="step-num" style={{ background: i === 0 ? "linear-gradient(140deg,var(--accent),var(--accent-2))" : "var(--glass-strong)", color: i === 0 ? "#06131a" : "var(--ink)" }}>{i + 1}</span>
              <span style={{ flex: 1, fontWeight: 550 }}>{d.name || "Untitled"}</span>
              <span className="chip" style={{ fontSize: 11 }}>{(+d.rate || 0).toFixed(1)}%</span>
              <span className="num" style={{ fontWeight: 600, width: 90, textAlign: "right" }}>{fmtMoney(+d.balance || 0, cur, { decimals: 0 })}</span>
            </div>
          ))}
        </div>
        <p className="loan-hint" style={{ marginTop: 12 }}>Pay minimums on all, then throw every spare dollar (your Sweep!) at #1 until it's gone — then roll that payment onto #2.</p>
      </Card>
    </div>
  );
}

Object.assign(window, { MODULE_META, CarModule, SharesModule, RetirementModule, SideModule, DebtModule });
