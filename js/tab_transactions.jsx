/* ============================================================
   tab_transactions.jsx — quick-add + filterable list
   ============================================================ */

function TransactionsTab() {
  const s = useStore();
  const cur = s.settings.currency;
  const today = () => todayLocal();
  const cats = eachCategory(s);
  const accounts = s.accounts || [];
  const multiAccount = accounts.length >= 2;
  const grouped = (() => {
    const g = {};
    for (const c of cats) (g[c.sectionName] ||= []).push(c);
    return g;
  })();

  /* "Log activity" mode — switches the form between a regular spend
     and an account-to-account transfer. Only shown when 2+ accounts exist
     (a transfer needs somewhere to go). */
  const [mode, setMode] = React.useState("spend");
  React.useEffect(() => { if (!multiAccount && mode === "transfer") setMode("spend"); }, [multiAccount, mode]);

  /* --- Quick-add form: spend --- */
  const [form, setForm] = React.useState({
    amount: "",
    categoryId: cats[0]?.id || "",
    accountId: accounts[0]?.id || "",
    date: today(),
    note: ""
  });
  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const reset = () => setForm({
    amount: "",
    categoryId: form.categoryId || cats[0]?.id || "",
    accountId: form.accountId || accounts[0]?.id || "",
    date: today(),
    note: ""
  });

  const submit = (e) => {
    e?.preventDefault?.();
    const amt = parseFloat(String(form.amount).replace(/[^0-9.]/g, "")) || 0;
    if (!amt) return;
    const tx = {
      id: uid(),
      amount: amt,
      categoryId: form.categoryId || null,
      accountId: multiAccount ? form.accountId || null : accounts[0]?.id || null,
      date: form.date || today(),
      note: form.note.trim()
    };
    Store.addTransaction(tx);
    reset();
  };

  /* --- Quick-add form: transfer --- */
  const [xfer, setXfer] = React.useState({
    amount: "",
    fromId: accounts[0]?.id || "",
    toId: accounts[1]?.id || "",
    date: today(),
    note: ""
  });
  const setX = (k, v) => setXfer((p) => ({ ...p, [k]: v }));

  const submitTransfer = (e) => {
    e?.preventDefault?.();
    const amt = parseFloat(String(xfer.amount).replace(/[^0-9.]/g, "")) || 0;
    if (!amt) return;
    if (!xfer.fromId || !xfer.toId) return;
    if (xfer.fromId === xfer.toId) { alert("Pick two different accounts for a transfer."); return; }
    Store.addTransaction({
      id: uid(),
      kind: "transfer",
      amount: amt,
      accountId: xfer.fromId,
      intoAccountId: xfer.toId,
      categoryId: null,
      date: xfer.date || today(),
      note: xfer.note.trim()
    });
    setXfer({ amount: "", fromId: xfer.fromId, toId: xfer.toId, date: today(), note: "" });
  };

  /* --- Filter state --- */
  const [filterCat, setFilterCat] = React.useState("all");
  const [filterPeriod, setFilterPeriod] = React.useState("month");

  const cutoff = (() => {
    const d = new Date();
    if (filterPeriod === "week") d.setDate(d.getDate() - 7);else
    if (filterPeriod === "month") d.setMonth(d.getMonth() - 1);else
    if (filterPeriod === "year") d.setFullYear(d.getFullYear() - 1);else
    return 0;
    return d.getTime();
  })();

  /* Newest first, stable on date ties: when two rows share a date, leave
     them in array order — addTransaction prepends, so the most-recently-
     logged entry wins. Returning 0 (not -1) for equal dates is what
     preserves stability across re-renders. */
  const visible = (s.transactions || []).
  filter((tx) => {
    if (filterCat === "all") return true;
    if (filterCat === "transfers") return tx.kind === "transfer";
    if (filterCat === "uncat") return tx.kind !== "transfer" && !tx.categoryId;
    return tx.kind !== "transfer" && tx.categoryId === filterCat;
  }).
  filter((tx) => filterPeriod === "all" || parseYMD(tx.date).getTime() >= cutoff).
  slice().
  sort((a, b) => {
    if (a.date === b.date) return 0;
    return a.date < b.date ? 1 : -1;
  });

  const visTotal = visible.filter((tx) => tx.kind !== "transfer").reduce((a, tx) => a + (Number(tx.amount) || 0), 0);

  const catName = (id) => {
    if (!id) return "Uncategorised";
    const c = findCategory(s, id);
    return c ? c.name : "Uncategorised";
  };
  const sectionName = (id) => {
    if (!id) return null;
    const c = findCategory(s, id);
    return c ? c.sectionName : null;
  };
  const accountName = (id) => {
    if (!id) return null;
    const a = accounts.find((x) => x.id === id);
    return a ? a.name : null;
  };

  const editTx = (id, k, v) => Store.updateTransaction(id, { [k]: v });
  const delTx = (id) => Store.deleteTransaction(id);

  return (
    <div>
      <PageHead title="Transactions">Log what you actually spend — or move money between your own accounts. Spends roll up into the Dashboard breakdown; transfers just shuffle balances and don't count as spending.</PageHead>

      {/* Quick add */}
      <Card style={{ padding: 20, marginBottom: 18 }}>
        <div className="flex between gap12" style={{ marginBottom: 12, alignItems: "center" }}>
          <span className="section-label" style={{ marginBottom: 0 }}>Log {mode === "transfer" ? "a transfer" : "a transaction"}</span>
          {multiAccount && (
            <div className="seg seg-sm">
              <button type="button" className={mode === "spend" ? "on" : ""} onClick={() => setMode("spend")}>
                <Icon name="cart" size={13} /> Spend
              </button>
              <button type="button" className={mode === "transfer" ? "on" : ""} onClick={() => setMode("transfer")}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17l-4-4 4-4M17 7l4 4-4 4M3 13h14M21 11H7" /></svg>
                Transfer
              </button>
            </div>
          )}
        </div>

        {mode === "spend" && (
          <form onSubmit={submit} className={`tx-form ${multiAccount ? "with-account" : ""}`}>
            <div className="tx-field tx-amount">
              <label>Amount</label>
              <div className="loan-input">
                <span className="pre">{curSymbol(cur)}</span>
                <input className="num" inputMode="decimal" placeholder="0.00" autoFocus={false} value={form.amount}
                style={{ paddingLeft: 24 }}
                onChange={(e) => setF("amount", e.target.value)} />
              </div>
            </div>
            <div className="tx-field tx-cat">
              <label>Category</label>
              <select className="loan-select" style={{ width: "100%" }} value={form.categoryId} onChange={(e) => setF("categoryId", e.target.value)}>
                {Object.keys(grouped).map((sn) =>
                <optgroup key={sn} label={sn}>
                    {grouped[sn].map((c) => <option key={c.id} value={c.id}>{c.name || "Untitled"}</option>)}
                  </optgroup>
                )}
                <option value="">Uncategorised</option>
              </select>
            </div>
            {multiAccount &&
            <div className="tx-field tx-acct">
                <label>From account</label>
                <select className="loan-select" style={{ width: "100%" }} value={form.accountId} onChange={(e) => setF("accountId", e.target.value)}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name || "Account"}</option>)}
                  <option value="">— none</option>
                </select>
              </div>
            }
            <div className="tx-field tx-date">
              <label>Date</label>
              <input className="tx-input num" type="date" value={form.date} onChange={(e) => setF("date", e.target.value)} />
            </div>
            <div className="tx-field tx-note">
              <label>Note <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}>· optional</span></label>
              <input className="tx-input" placeholder="What was it?" value={form.note} onChange={(e) => setF("note", e.target.value)} />
            </div>
            <div className="tx-field tx-submit">
              <button type="submit" className="btn btn-accent" style={{ height: 42 }}>
                <Icon name="plus" size={16} /> Log it
              </button>
            </div>
          </form>
        )}

        {mode === "transfer" && multiAccount && (
          <form onSubmit={submitTransfer} className="tx-form xfer-form">
            <div className="tx-field tx-amount">
              <label>Amount</label>
              <div className="loan-input">
                <span className="pre">{curSymbol(cur)}</span>
                <input className="num" inputMode="decimal" placeholder="0.00" value={xfer.amount}
                style={{ paddingLeft: 24 }}
                onChange={(e) => setX("amount", e.target.value)} />
              </div>
            </div>
            <div className="tx-field">
              <label>From account</label>
              <select className="loan-select" style={{ width: "100%" }} value={xfer.fromId} onChange={(e) => setX("fromId", e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name || "Account"}</option>)}
              </select>
            </div>
            <div className="xfer-arrow" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </div>
            <div className="tx-field">
              <label>To account</label>
              <select className="loan-select" style={{ width: "100%" }} value={xfer.toId} onChange={(e) => setX("toId", e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id} disabled={a.id === xfer.fromId}>{a.name || "Account"}</option>)}
              </select>
            </div>
            <div className="tx-field tx-date">
              <label>Date</label>
              <input className="tx-input num" type="date" value={xfer.date} onChange={(e) => setX("date", e.target.value)} />
            </div>
            <div className="tx-field tx-note">
              <label>Note <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}>· optional</span></label>
              <input className="tx-input" placeholder="e.g. weekly savings transfer" value={xfer.note} onChange={(e) => setX("note", e.target.value)} />
            </div>
            <div className="tx-field tx-submit">
              <button type="submit" className="btn btn-accent" style={{ height: 42 }}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                Log transfer
              </button>
            </div>
          </form>
        )}
      </Card>

      {/* Filters + list */}
      <Card style={{ padding: 6 }}>
        <div className="tx-toolbar">
          <div className="seg">
            {[{ k: "week", l: "Week" }, { k: "month", l: "Month" }, { k: "year", l: "Year" }, { k: "all", l: "All time" }].map((p) =>
            <button key={p.k} className={filterPeriod === p.k ? "on" : ""} onClick={() => setFilterPeriod(p.k)}>{p.l}</button>
            )}
          </div>
          <select className="loan-select" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
            <option value="all">All categories</option>
            <option value="transfers">Transfers only</option>
            <option value="uncat">Uncategorised</option>
            {Object.keys(grouped).map((sn) =>
            <optgroup key={sn} label={sn}>
                {grouped[sn].map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            )}
          </select>
          <span className="spacer" style={{ flex: 1 }}></span>
          <span className="chip">{visible.length} entries · {fmtMoney(visTotal, cur, { decimals: 0 })} spent</span>
        </div>

        <div className="tablecard" style={{ padding: 0, background: "transparent", border: "none", boxShadow: "none" }}>
          {visible.length === 0 &&
          <Empty icon="coins" title="No transactions in this view" sub="Log one above — it takes about three seconds." />
          }
          {visible.map((tx) =>
          <TransactionRow key={tx.id} tx={tx} cur={cur}
          categoryName={catName(tx.categoryId)} sectionName={sectionName(tx.categoryId)}
          fromName={accountName(tx.accountId)} toName={accountName(tx.intoAccountId)}
          cats={cats} grouped={grouped} accounts={accounts} multiAccount={multiAccount}
          onEdit={(k, v) => editTx(tx.id, k, v)} onDelete={() => delTx(tx.id)} />
          )}
        </div>
      </Card>
    </div>);

}

function TransactionRow({ tx, cur, categoryName, sectionName, fromName, toName, cats, grouped, accounts, multiAccount, onEdit, onDelete }) {
  const [editing, setEditing] = React.useState(false);
  const isTransfer = tx.kind === "transfer";

  if (editing && isTransfer) {
    return (
      <div className="tx-row editing">
        <div className="tx-row-edit">
          <div className="loan-input" style={{ width: 130 }}>
            <span className="pre">{curSymbol(cur)}</span>
            <input className="num" inputMode="decimal" value={tx.amount} style={{ paddingLeft: 24 }}
            onChange={(e) => onEdit("amount", parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0)} />
          </div>
          <select className="loan-select" value={tx.accountId || ""} onChange={(e) => onEdit("accountId", e.target.value || null)} title="From">
            {accounts.map((a) => <option key={a.id} value={a.id}>From: {a.name}</option>)}
          </select>
          <select className="loan-select" value={tx.intoAccountId || ""} onChange={(e) => onEdit("intoAccountId", e.target.value || null)} title="To">
            {accounts.map((a) => <option key={a.id} value={a.id} disabled={a.id === tx.accountId}>To: {a.name}</option>)}
          </select>
          <input className="tx-input num" type="date" value={tx.date} onChange={(e) => onEdit("date", e.target.value)} style={{ width: 140 }} />
          <input className="tx-input" placeholder="Note" value={tx.note || ""} onChange={(e) => onEdit("note", e.target.value)} style={{ flex: 1, minWidth: 0 }} />
          <button className="btn btn-sm btn-accent" onClick={() => setEditing(false)}><Icon name="check" size={14} />Done</button>
          <button className="del-btn" style={{ opacity: 1 }} onClick={onDelete} aria-label="Delete"><Icon name="trash" size={15} /></button>
        </div>
      </div>);
  }

  if (editing) {
    return (
      <div className="tx-row editing">
        <div className="tx-row-edit">
          <div className="loan-input" style={{ width: 130 }}>
            <span className="pre">{curSymbol(cur)}</span>
            <input className="num" inputMode="decimal" value={tx.amount} style={{ paddingLeft: 24 }}
            onChange={(e) => onEdit("amount", parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0)} />
          </div>
          <select className="loan-select" value={tx.categoryId || ""} onChange={(e) => onEdit("categoryId", e.target.value || null)}>
            {Object.keys(grouped).map((sn) =>
            <optgroup key={sn} label={sn}>
                {grouped[sn].map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            )}
            <option value="">Uncategorised</option>
          </select>
          {multiAccount &&
          <select className="loan-select" value={tx.accountId || ""} onChange={(e) => onEdit("accountId", e.target.value || null)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              <option value="">— none</option>
            </select>
          }
          <input className="tx-input num" type="date" value={tx.date} onChange={(e) => onEdit("date", e.target.value)} style={{ width: 140 }} />
          <input className="tx-input" placeholder="Note" value={tx.note || ""} onChange={(e) => onEdit("note", e.target.value)} style={{ flex: 1, minWidth: 0 }} />
          <button className="btn btn-sm btn-accent" onClick={() => setEditing(false)}><Icon name="check" size={14} />Done</button>
          <button className="del-btn" style={{ opacity: 1 }} onClick={onDelete} aria-label="Delete"><Icon name="trash" size={15} /></button>
        </div>
      </div>);

  }

  if (isTransfer) {
    return (
      <div className={`tx-row transfer-row ${multiAccount ? "with-account" : ""}`} onClick={() => setEditing(true)} tabIndex="0" role="button" onKeyDown={(e) => e.key === "Enter" && setEditing(true)}>
        <span className="tx-date">{parseYMD(tx.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
        <span className="tx-cat-pill transfer-pill" title="Transfer between accounts">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          Transfer
        </span>
        {multiAccount && (
          <span className="tx-acct-chip xfer-chip" title={`${fromName || "?"} → ${toName || "?"}`}>
            {fromName || "?"} <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}><path d="M5 12h14M13 6l6 6-6 6" /></svg> {toName || "?"}
          </span>
        )}
        <span className="tx-note-text">{tx.note || <em style={{ color: "var(--ink-faint)", fontStyle: "normal" }}>—</em>}</span>
        <span className="tx-amt num" style={{ color: "var(--accent-ink)" }}>{fmtMoney(tx.amount, cur)}</span>
        <button className="del-btn" onClick={(e) => {e.stopPropagation();onDelete();}} aria-label="Delete"><Icon name="trash" size={15} /></button>
      </div>);
  }

  return (
    <div className={`tx-row ${multiAccount ? "with-account" : ""}`} onClick={() => setEditing(true)} tabIndex="0" role="button" onKeyDown={(e) => e.key === "Enter" && setEditing(true)}>
      <span className="tx-date">{parseYMD(tx.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
      <span className="tx-cat-pill">
        <i></i>{categoryName}
        {sectionName && <small>{sectionName}</small>}
      </span>
      {multiAccount &&
      <span className="tx-acct-chip" title={fromName || "No account tagged"}>
          <Icon name="bank" size={11} />
          {fromName || <em style={{ color: "var(--ink-faint)", fontStyle: "normal" }}>—</em>}
        </span>
      }
      <span className="tx-note-text">{tx.note || <em style={{ color: "var(--ink-faint)", fontStyle: "normal" }}>—</em>}</span>
      <span className="tx-amt num">{fmtMoney(tx.amount, cur)}</span>
      <button className="del-btn" onClick={(e) => {e.stopPropagation();onDelete();}} aria-label="Delete"><Icon name="trash" size={15} /></button>
    </div>);

}

Object.assign(window, { TransactionsTab, TransactionRow });