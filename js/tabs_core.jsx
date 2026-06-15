/* ============================================================
   tabs_core.jsx — Income (recurring sources + actual log)
   ============================================================ */

function IncomeTab() {
  const s = useStore();
  const cur = s.settings.currency;
  const grid = { gridTemplateColumns: "1.6fr 1fr 1.1fr 1fr 40px" };

  const add = () => Store.update("income", (l) => [...l, { id: uid(), name: "", amount: 0, freq: "monthly" }]);
  const edit = (id, key, val) => Store.update("income", (l) => l.map((r) => r.id === id ? { ...r, [key]: val } : r));
  const del = (id) => Store.update("income", (l) => l.filter((r) => r.id !== id));

  const monthlyTotal = s.income.reduce((a, i) => a + toMonthly(i.amount, i.freq), 0);

  return (
    <div>
      <PageHead title="Income">Two views of your earnings. <b>Recurring sources</b> are what you expect to receive — that's what feeds the Sweep. <b>Logged income</b> is a running record of what actually landed, which matters when your income varies week to week.</PageHead>

      <span className="section-label">Recurring sources</span>
      <Card className="tablecard">
        <div className="row head" style={grid}>
          <span>Source</span><span style={{ textAlign: "right" }}>Amount</span>
          <span>Frequency</span>
          <span style={{ textAlign: "right" }}>Monthly <Lock /></span>
          <span></span>
        </div>
        {s.income.length === 0 &&
        <Empty icon="wallet" title="No income yet" sub="Add your salary, side gigs, anything." action={<button className="btn btn-accent" onClick={add}><Icon name="plus" size={16} />Add income</button>} />
        }
        {s.income.map((r) =>
        <div className="row" style={grid} key={r.id}>
            <TextCell value={r.name} placeholder="e.g. Salary" onChange={(v) => edit(r.id, "name", v)} />
            <AmountCell value={r.amount} currency={cur} onChange={(v) => edit(r.id, "amount", v)} />
            <FreqCell value={r.freq} onChange={(v) => edit(r.id, "freq", v)} />
            <LockCell>{fmtMoney(toMonthly(r.amount, r.freq), cur)}</LockCell>
            <DelBtn onClick={() => del(r.id)} />
          </div>
        )}
        {s.income.length > 0 &&
        <div className="row total" style={grid}>
            <span>Expected / month</span><span></span><span></span>
            <span className="num" style={{ textAlign: "right" }}>{fmtMoney(monthlyTotal, cur)}</span>
            <span></span>
          </div>
        }
      </Card>
      <AddRow onClick={add} label="Add income source" />

      <div style={{ height: 28 }}></div>

      <IncomeLog cur={cur} sources={s.income} log={s.incomeLog || []} accounts={s.accounts || []} />
    </div>);

}

function IncomeLog({ cur, sources, log, accounts }) {
  const today = () => todayLocal();
  const sourceNames = sources.map((s) => s.name || "Untitled");
  const multiAccount = (accounts || []).length >= 2;

  const [form, setForm] = React.useState({
    amount: "",
    source: sourceNames[0] || "",
    accountId: accounts[0]?.id || "",
    date: today(),
    note: "",
  });
  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = (e) => {
    e?.preventDefault?.();
    const amt = parseFloat(String(form.amount).replace(/[^0-9.]/g, "")) || 0;
    if (!amt) return;
    Store.addIncomeEntry({
      id: uid(),
      amount: amt,
      source: form.source || "",
      accountId: multiAccount ? (form.accountId || null) : (accounts[0]?.id || null),
      date: form.date || today(),
      note: form.note.trim(),
    });
    setForm({ amount: "", source: form.source || sourceNames[0] || "", accountId: form.accountId || accounts[0]?.id || "", date: today(), note: "" });
  };

  const [period, setPeriod] = React.useState("month");
  const cutoff = (() => {
    const d = new Date();
    if (period === "week") d.setDate(d.getDate() - 7);else
    if (period === "month") d.setMonth(d.getMonth() - 1);else
    if (period === "year") d.setFullYear(d.getFullYear() - 1);else
    return 0;
    return d.getTime();
  })();
  const visible = log.
  filter((x) => period === "all" || parseYMD(x.date).getTime() >= cutoff).
  slice().
  sort((a, b) => a.date < b.date ? 1 : -1);
  const total = visible.reduce((a, x) => a + (+x.amount || 0), 0);

  const editTx = (id, k, v) => Store.updateIncomeEntry(id, { [k]: v });
  const delTx = (id) => Store.deleteIncomeEntry(id);

  return (
    <>
      <span className="section-label">Logged income</span>
      <Card style={{ padding: 20, marginBottom: 14 }}>
        <form onSubmit={submit} className={`tx-form ${multiAccount ? "with-account" : ""}`}>
          <div className="tx-field tx-amount">
            <label>Received</label>
            <div className="loan-input">
              <span className="pre">{curSymbol(cur)}</span>
              <input className="num" inputMode="decimal" placeholder="0.00" value={form.amount}
              style={{ paddingLeft: 24 }}
              onChange={(e) => setF("amount", e.target.value)} />
            </div>
          </div>
          <div className="tx-field tx-cat">
            <label>Source</label>
            <select className="loan-select" style={{ width: "100%" }} value={form.source} onChange={(e) => setF("source", e.target.value)}>
              {sourceNames.length === 0 && <option value="">Add a source above first</option>}
              {sourceNames.map((n) => <option key={n} value={n}>{n}</option>)}
              <option value="">Other / one-off</option>
            </select>
          </div>
          {multiAccount && (
            <div className="tx-field tx-acct">
              <label>Into account</label>
              <select className="loan-select" style={{ width: "100%" }} value={form.accountId} onChange={(e) => setF("accountId", e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name || "Account"}</option>)}
                <option value="">— none</option>
              </select>
            </div>
          )}
          <div className="tx-field tx-date">
            <label>Date paid</label>
            <input className="tx-input num" type="date" value={form.date} onChange={(e) => setF("date", e.target.value)} />
          </div>
          <div className="tx-field tx-note">
            <label>Note <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}>· optional</span></label>
            <input className="tx-input" placeholder="Bonus, hours worked, client name…" value={form.note} onChange={(e) => setF("note", e.target.value)} />
          </div>
          <div className="tx-field tx-submit">
            <button type="submit" className="btn btn-accent" style={{ height: 42 }}>
              <Icon name="plus" size={16} /> Log it
            </button>
          </div>
        </form>
      </Card>

      <Card style={{ padding: 6 }}>
        <div className="tx-toolbar">
          <div className="seg">
            {[{ k: "week", l: "Week" }, { k: "month", l: "Month" }, { k: "year", l: "Year" }, { k: "all", l: "All time" }].map((p) =>
            <button key={p.k} className={period === p.k ? "on" : ""} onClick={() => setPeriod(p.k)}>{p.l}</button>
            )}
          </div>
          <span className="spacer" style={{ flex: 1 }}></span>
          <span className="chip">{visible.length} entries · <span className="pos">{fmtMoney(total, cur, { decimals: 0 })}</span></span>
        </div>

        <div className="tablecard" style={{ padding: 0, background: "transparent", border: "none", boxShadow: "none" }}>
          {visible.length === 0 &&
          <Empty icon="coins" title="No income logged in this view" sub="Log a paycheck above — useful when income varies." />
          }
          {visible.map((tx) =>
          <IncomeLogRow key={tx.id} tx={tx} cur={cur} sourceNames={sourceNames}
          accounts={accounts} multiAccount={multiAccount}
          accountName={tx.accountId ? (accounts.find((a) => a.id === tx.accountId)?.name || null) : null}
          onEdit={(k, v) => editTx(tx.id, k, v)} onDelete={() => delTx(tx.id)} />
          )}
        </div>
      </Card>
    </>);

}

function IncomeLogRow({ tx, cur, sourceNames, accounts, multiAccount, accountName, onEdit, onDelete }) {
  const [editing, setEditing] = React.useState(false);
  if (editing) {
    return (
      <div className="tx-row editing">
        <div className="tx-row-edit">
          <div className="loan-input" style={{ width: 130 }}>
            <span className="pre">{curSymbol(cur)}</span>
            <input className="num" inputMode="decimal" value={tx.amount} style={{ paddingLeft: 24 }}
            onChange={(e) => onEdit("amount", parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0)} />
          </div>
          <select className="loan-select" value={tx.source || ""} onChange={(e) => onEdit("source", e.target.value)}>
            {sourceNames.map((n) => <option key={n} value={n}>{n}</option>)}
            <option value="">Other / one-off</option>
          </select>
          {multiAccount && (
            <select className="loan-select" value={tx.accountId || ""} onChange={(e) => onEdit("accountId", e.target.value || null)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              <option value="">— none</option>
            </select>
          )}
          <input className="tx-input num" type="date" value={tx.date} onChange={(e) => onEdit("date", e.target.value)} style={{ width: 140 }} />
          <input className="tx-input" placeholder="Note" value={tx.note || ""} onChange={(e) => onEdit("note", e.target.value)} style={{ flex: 1, minWidth: 0 }} />
          <button className="btn btn-sm btn-accent" onClick={() => setEditing(false)}><Icon name="check" size={14} />Done</button>
          <button className="del-btn" style={{ opacity: 1 }} onClick={onDelete}><Icon name="trash" size={15} /></button>
        </div>
      </div>);

  }
  return (
    <div className={`tx-row ${multiAccount ? "with-account" : ""}`} onClick={() => setEditing(true)} tabIndex="0" role="button" onKeyDown={(e) => e.key === "Enter" && setEditing(true)}>
      <span className="tx-date">{parseYMD(tx.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
      <span className="tx-cat-pill">
        <i></i>{tx.source || "Other"}
      </span>
      {multiAccount && (
        <span className="tx-acct-chip" title={accountName || "No account tagged"}>
          <Icon name="bank" size={11} />
          {accountName || <em style={{ color: "var(--ink-faint)", fontStyle: "normal" }}>—</em>}
        </span>
      )}
      <span className="tx-note-text">{tx.note || <em style={{ color: "var(--ink-faint)", fontStyle: "normal" }}>—</em>}</span>
      <span className="tx-amt num pos">+{fmtMoney(tx.amount, cur)}</span>
      <button className="del-btn" onClick={(e) => {e.stopPropagation();onDelete();}}><Icon name="trash" size={15} /></button>
    </div>);

}

function Lock() {
  return <span className="lockchip" title="Calculated — locked"><Icon name="lock" size={11} /></span>;
}

/* W/F/M-only frequency select (Budget tab uses this) */
function BudgetFreqCell({ value, onChange }) {
  return (
    <select className="cell-input" value={value} onChange={(e) => onChange(e.target.value)}>
      {Object.entries(BUDGET_FREQS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
    </select>);

}

Object.assign(window, { IncomeTab, IncomeLog, IncomeLogRow, Lock, BudgetFreqCell });