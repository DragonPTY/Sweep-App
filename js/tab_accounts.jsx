/* ============================================================
   tab_accounts.jsx — Bank accounts (live balances, reorderable)
   ============================================================ */

const ACCOUNT_TYPES = {
  checking: { label: "Checking", icon: "wallet" },
  savings:  { label: "Savings",  icon: "piggy" },
  offset:   { label: "Offset",   icon: "bank" },
  credit:   { label: "Credit",   icon: "receipt" },
  other:    { label: "Other",    icon: "coins" },
};

function AccountsTab() {
  const s = useStore();
  const cur = s.settings.currency;
  const grid = { gridTemplateColumns: "1.6fr 1.1fr 1fr 36px" };
  const accounts = s.accounts || [];

  const add = () => Store.update("accounts", (l) => [...l, { id: uid(), name: "", balance: 0, type: "checking" }]);
  const edit = (id, key, val) => Store.update("accounts", (l) => l.map((r) => r.id === id ? { ...r, [key]: val } : r));
  const del = (id) => {
    if (!confirm("Delete this account? Transactions and budget items pointing to it will become untagged.")) return;
    Store.update("accounts", (l) => l.filter((r) => r.id !== id));
    // Untag references
    Store.update("transactions", (l) => l.map((tx) => tx.accountId === id ? { ...tx, accountId: null } : tx.intoAccountId === id ? { ...tx, intoAccountId: null } : tx));
    Store.update("incomeLog", (l) => l.map((tx) => tx.accountId === id ? { ...tx, accountId: null } : tx));
    Store.update("budget.sections", (l) => l.map((sec) => ({ ...sec, items: sec.items.map((it) => ({ ...it, accountId: it.accountId === id ? null : it.accountId, payIntoId: it.payIntoId === id ? null : it.payIntoId })) })));
  };
  const move = (id, dir) => Store.moveAccount(id, dir);

  const total = accounts.reduce((a, x) => a + (Number(x.balance) || 0) * (x.type === "credit" ? -1 : 1), 0);
  const assets = accounts.filter((a) => a.type !== "credit").reduce((a, x) => a + (+x.balance || 0), 0);
  const debts  = accounts.filter((a) => a.type === "credit").reduce((a, x) => a + (+x.balance || 0), 0);

  return (
    <div>
      <PageHead title="Accounts">Every bank, savings and credit account. Balances update live as you log transactions, income, or run Payday — and your offset auto-syncs to the loan calculator.</PageHead>

      <div className="tile-grid" style={{ marginBottom: 16, gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <Tile label="Net balance" value={fmtMoney(total, cur, { decimals: 0 })} sub="assets − credit" icon="bank" tone={total >= 0 ? "pos" : "neg"} />
        <Tile label="Total in accounts" value={fmtMoney(assets, cur, { decimals: 0 })} sub={`${accounts.filter((a) => a.type !== "credit").length} accounts`} icon="coins" />
        <Tile label="Credit owed" value={fmtMoney(debts, cur, { decimals: 0 })} sub="credit cards" icon="flame" tone={debts > 0 ? "neg" : null} />
      </div>

      <Card className="tablecard">
        <div className="row head" style={grid}>
          <span>Account</span>
          <span>Type</span>
          <span style={{ textAlign: "right" }}>Balance</span>
          <span></span>
        </div>
        {accounts.length === 0 && (
          <Empty icon="bank" title="No accounts yet" sub="Add your everyday checking, savings, offset or credit cards." action={<button className="btn btn-accent" onClick={add}><Icon name="plus" size={16} />Add an account</button>} />
        )}
        {accounts.map((r, i) =>
          <AccountRow key={r.id} r={r} i={i} count={accounts.length} cur={cur} grid={grid}
            onEdit={(k, v) => edit(r.id, k, v)}
            onMove={(dir) => move(r.id, dir)}
            onDelete={() => del(r.id)}
          />
        )}
        {accounts.length > 0 && (
          <div className="row total" style={grid}>
            <span>Net balance</span><span></span>
            <span className="num" style={{ textAlign: "right", color: total >= 0 ? "var(--pos)" : "var(--neg)" }}>{fmtMoney(total, cur)}</span>
            <span></span>
          </div>
        )}
      </Card>
      <AddRow onClick={add} label="Add an account" />

      <Card soft style={{ padding: "13px 18px", marginTop: 16 }} className="flex gap12">
        <Icon name="info" size={16} style={{ color: "var(--accent)", flex: "none" }} />
        <span style={{ fontSize: 13, color: "var(--ink-dim)" }}>
          Balances change automatically when you log a transaction, income entry, or run Payday — and any account tagged <b style={{ color: "var(--ink)" }}>Offset</b> feeds straight into the Loan calculator. Edit a balance any time to reconcile against your bank.
        </span>
      </Card>
    </div>
  );
}

function AccountRow({ r, i, count, cur, grid, onEdit, onMove, onDelete }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const act = (fn) => { setOpen(false); fn(); };

  return (
    <div className="row acct-row" style={grid}>
      <div className="flex gap12" style={{ alignItems: "center", minWidth: 0 }}>
        <span className="acct-ic" style={{ background: r.type === "credit" ? "oklch(0.70 0.18 18 / 0.18)" : "var(--glow-b)", color: r.type === "credit" ? "var(--neg)" : "var(--accent-ink)" }}>
          <Icon name={(ACCOUNT_TYPES[r.type] || ACCOUNT_TYPES.other).icon} size={14} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <TextCell value={r.name} placeholder="e.g. Everyday" onChange={(v) => onEdit("name", v)} />
        </div>
      </div>
      <select className="cell-input" value={r.type} onChange={(e) => onEdit("type", e.target.value)}>
        {Object.entries(ACCOUNT_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
      </select>
      <AmountCell value={r.balance} currency={cur} onChange={(v) => onEdit("balance", v)} />
      <div className="acct-menu-wrap" ref={ref}>
        <button className="acct-menu-btn" onClick={() => setOpen((o) => !o)} aria-label="More actions" aria-haspopup="menu" aria-expanded={open}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="12" cy="6" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="18" r="1.5" /></svg>
        </button>
        {open && (
          <div className="acct-menu" role="menu">
            <button role="menuitem" disabled={i === 0} onClick={() => act(() => onMove(-1))}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg>
              Move up
            </button>
            <button role="menuitem" disabled={i === count - 1} onClick={() => act(() => onMove(+1))}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
              Move down
            </button>
            <div className="acct-menu-sep"></div>
            <button role="menuitem" className="danger" onClick={() => act(onDelete)}>
              <Icon name="trash" size={14} /> Delete account
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { AccountsTab, AccountRow, ACCOUNT_TYPES });
