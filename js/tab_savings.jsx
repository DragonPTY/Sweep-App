/* ============================================================
   tab_savings.jsx — Savings Goals with account routing,
                     percentage splits, and ad-hoc deposits.
   ============================================================

   Replaces the old SavingsModule. Each goal:
     - lives in a real account (accountId)
     - has a share (% of payday allocation that flows to it)
     - tracks contributions[] (a ledger of deposits, each optionally
       backed by a transfer transaction)

   Per-payday flow:
     1. User sets the savings pool (the $ they want to put aside each cycle).
     2. They tap "Split now", pick which account it leaves, and the app fans
        out one transfer per goal based on its share %.

   Ad-hoc flow:
     1. "Add deposit" on any goal opens an inline form.
     2. Pick amount, source account, date, optional note.
     3. Logged as a contribution and (optionally) a real transfer transaction
        so account balances stay accurate.
   ============================================================ */

function SavingsModule() {
  const s = useStore();
  const cur = s.settings.currency;
  const accounts = s.accounts || [];
  const pool = Number(s.settings.savingsPool) || 0;
  const goals = s.savings || [];
  const totalShare = goals.reduce((a, g) => a + (Number(g.share) || 0), 0);
  const totalSaved = goals.reduce((a, g) => a + savedOf(g), 0);
  const monthlyPlanned = goals.reduce((a, g) => a + pool * (Number(g.share) || 0) / 100, 0);
  const sparePct = Math.max(0, 100 - totalShare);
  const spareAmt = pool * sparePct / 100;

  const setPool = (v) => Store.set("settings.savingsPool", v);
  const addGoal = () =>
    Store.update("savings", (l) => [...l, {
      id: uid(), name: "", target: 0,
      accountId: accounts.find((a) => a.type === "savings")?.id || null,
      share: 0, contributions: [],
    }]);
  const editGoal = (id, k, v) =>
    Store.update("savings", (l) => l.map((g) => g.id === id ? { ...g, [k]: v } : g));
  const delGoal = (id) => {
    const g = goals.find((x) => x.id === id);
    const hasHistory = (g?.contributions || []).length > 0;
    if (hasHistory && !confirm(`Delete "${g.name || 'goal'}"? Its deposit history will be removed but the transactions in your Transactions tab stay intact.`)) return;
    Store.update("savings", (l) => l.filter((x) => x.id !== id));
  };

  return (
    <div>
      <PageHead title="Savings Goals">Set a target, pick the account it lives in, and tell each goal what slice of every payday it gets. Drop in birthday cash or windfalls any time — each deposit can post as a real transfer so your balances stay honest.</PageHead>

      <SplitPanel cur={cur} pool={pool} setPool={setPool}
        accounts={accounts} goals={goals}
        totalShare={totalShare} sparePct={sparePct} spareAmt={spareAmt} />

      <div className="goals-grid">
        {goals.map((g) =>
          <GoalCard key={g.id} g={g} cur={cur} accounts={accounts} pool={pool}
            onEdit={(k, v) => editGoal(g.id, k, v)}
            onDelete={() => delGoal(g.id)} />
        )}
        <button className="addrow goals-addbtn" onClick={addGoal}>
          <Icon name="plus" size={18} /> Add a savings goal
        </button>
      </div>

      <Card soft style={{ padding: "14px 20px", marginTop: 16 }} className="flex gap12 wrap">
        <div className="flex gap12 wrap" style={{ flex: 1 }}>
          <span className="chip"><Icon name="piggy" size={13} />{fmtMoney(totalSaved, cur, { decimals: 0 })} saved</span>
          <span className="chip"><Icon name="trend" size={13} />{fmtMoney(monthlyPlanned, cur, { decimals: 0 })} planned / split</span>
          {totalShare !== 100 && pool > 0 && (
            <span className={`chip ${totalShare > 100 ? "warn" : ""}`}>
              {totalShare > 100
                ? <>⚠︎ Shares total {totalShare}% — over 100%</>
                : <>Shares total {totalShare}% — {sparePct}% stays unallocated</>}
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}

function savedOf(g) {
  return (g.contributions || []).reduce((a, c) => a + (Number(c.amount) || 0), 0);
}

/* The "set pool + split now" panel that lives above the goal grid.
   This is the heart of Chandler's spec — set the allocation, see the
   per-goal split preview, fire the split. */
function SplitPanel({ cur, pool, setPool, accounts, goals, totalShare, sparePct, spareAmt }) {
  /* The default split source is the user's checking account (where the
     paycheck typically lands); transfers route from there into each goal's
     savings account. */
  const defaultSource = accounts.find((a) => a.type === "checking")?.id
                     || accounts.find((a) => a.type !== "savings")?.id
                     || accounts[0]?.id || "";
  const [src, setSrc] = React.useState(defaultSource);
  const [open, setOpen] = React.useState(false);

  /* Preview slices using the same rounding the store uses so what the user
     sees is what gets logged. */
  const previewSlices = React.useMemo(() => {
    const active = goals.filter((g) => (Number(g.share) || 0) > 0);
    if (!active.length || pool <= 0) return [];
    const totalActiveShare = active.reduce((a, g) => a + (Number(g.share) || 0), 0);
    let allocated = 0;
    return active.map((g, i) => {
      const amt = i === active.length - 1
        ? Math.round((pool - allocated) * 100) / 100
        : Math.round((pool * (Number(g.share) || 0) / totalActiveShare) * 100) / 100;
      allocated += amt;
      return { goal: g, amount: amt };
    });
  }, [goals, pool]);

  const canSplit = pool > 0 && previewSlices.length > 0 && totalShare > 0;

  const runSplit = () => {
    if (!canSplit) return;
    const lines = previewSlices.map((p) => `  · ${fmtMoney(p.amount, cur)} → ${p.goal.name || "goal"}`).join("\n");
    if (!confirm(`Split ${fmtMoney(pool, cur)} from ${accounts.find((a) => a.id === src)?.name || "source"}?\n\n${lines}\n\nEach line posts as a transfer in your Transactions tab.`)) return;
    Store.runSavingsSplit(src, pool);
    setOpen(false);
  };

  return (
    <Card className="split-panel">
      <div className="split-grid">
        <div className="split-info">
          <span className="section-label">Per payday allocation</span>
          <div className="split-pool">
            <div className="loan-input" style={{ width: 180 }}>
              <span className="pre">{curSymbol(cur)}</span>
              <input className="num" inputMode="decimal" value={pool}
                style={{ paddingLeft: 26, fontSize: 18, fontWeight: 600, height: 44 }}
                onChange={(e) => setPool(parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0)} />
            </div>
          </div>
          <p className="split-blurb">
            {totalShare === 100
              ? <>Goals add up to 100%. The whole pool gets split when you tap Split now.</>
              : totalShare > 100
                ? <>Goals total <b style={{ color: "var(--neg)" }}>{totalShare}%</b> — over 100%. Adjust shares before splitting.</>
                : pool > 0
                  ? <>Goals total {totalShare}%. The remaining <b style={{ color: "var(--ink)" }}>{fmtMoney(spareAmt, cur)}</b> ({sparePct}%) stays in the source account.</>
                  : <>Set how much you want to put aside each payday, then assign each goal a slice.</>}
          </p>
        </div>

        <div className="split-actions">
          {accounts.length >= 2 && (
            <select className="loan-select" value={src} onChange={(e) => setSrc(e.target.value)} aria-label="Source account">
              {accounts.map((a) => <option key={a.id} value={a.id}>From {a.name}</option>)}
            </select>
          )}
          <button className="btn btn-accent split-btn" onClick={() => setOpen(true)} disabled={!canSplit}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h13M3 12h13M3 18h13M19 9l3 3-3 3" />
            </svg>
            Split now
          </button>
        </div>
      </div>

      {open && (
        <div className="split-preview">
          <div className="flex between" style={{ marginBottom: 10 }}>
            <span className="section-label" style={{ margin: 0 }}>Split preview</span>
            <button className="iconbtn" style={{ width: 26, height: 26 }} onClick={() => setOpen(false)} aria-label="Close">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 5l14 14M5 19L19 5" /></svg>
            </button>
          </div>
          <div className="split-rows">
            {previewSlices.map((p) =>
              <div className="split-row" key={p.goal.id}>
                <span className="sr-name">{p.goal.name || "Goal"}</span>
                <span className="sr-share">{p.goal.share}%</span>
                <span className="sr-amt num">{fmtMoney(p.amount, cur)}</span>
              </div>
            )}
            {spareAmt > 0 && (
              <div className="split-row residual">
                <span className="sr-name">Stays in source</span>
                <span className="sr-share">{sparePct}%</span>
                <span className="sr-amt num">{fmtMoney(spareAmt, cur)}</span>
              </div>
            )}
          </div>
          <div className="flex gap8" style={{ marginTop: 12, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-accent" onClick={runSplit}>Log split · {fmtMoney(pool, cur)}</button>
          </div>
        </div>
      )}
    </Card>
  );
}

function GoalCard({ g, cur, accounts, pool, onEdit, onDelete }) {
  const target = Number(g.target) || 0;
  const saved = savedOf(g);
  const pct = target > 0 ? Math.min(100, saved / target * 100) : 0;
  const done = saved >= target && target > 0;
  const share = Number(g.share) || 0;
  const perCycle = pool * share / 100;
  const account = accounts.find((a) => a.id === g.accountId);
  const monthsToGo = (!done && target > saved && perCycle > 0) ? Math.ceil((target - saved) / perCycle) : null;

  const [depositOpen, setDepositOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);

  return (
    <Card soft className="goal-card">
      <div className="goal-head">
        <input className="goal-name" value={g.name} placeholder="Goal name" onChange={(e) => onEdit("name", e.target.value)} aria-label="Goal name" />
        <button className="del-btn" style={{ opacity: 0.7 }} onClick={onDelete} aria-label="Delete goal"><Icon name="trash" size={15} /></button>
      </div>

      <div className="goal-amounts">
        <span className="num goal-saved" style={{ color: done ? "var(--pos)" : "var(--ink)" }}>{fmtMoney(saved, cur, { decimals: 0 })}</span>
        <span className="goal-of num">of {fmtMoney(target, cur, { decimals: 0 })}</span>
      </div>

      <Bar pct={pct} />

      <div className="goal-meta">
        <span>{Math.round(pct)}% there</span>
        {done && <span className="pos">Reached ✦</span>}
        {!done && monthsToGo !== null && <span>{monthsToGo} payday{monthsToGo === 1 ? "" : "s"} to go</span>}
      </div>

      <div className="goal-grid">
        <div className="g-field">
          <label>Target</label>
          <AmountCell value={g.target} currency={cur} align="left" onChange={(v) => onEdit("target", v)} />
        </div>
        <div className="g-field">
          <label>Saves into</label>
          <select className="cell-input" value={g.accountId || ""} onChange={(e) => onEdit("accountId", e.target.value || null)}>
            <option value="">— pick an account —</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="g-field">
          <label>Share of payday</label>
          <div className="share-input">
            <input className="num" inputMode="decimal" type="number" min="0" max="100" step="5"
              value={share} onChange={(e) => onEdit("share", Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))} />
            <span className="suf">%</span>
          </div>
          {pool > 0 && share > 0 && (
            <span className="g-hint">≈ {fmtMoney(perCycle, cur)} / split</span>
          )}
        </div>
      </div>

      <div className="goal-actions">
        <button className="btn btn-sm btn-accent" onClick={() => setDepositOpen((o) => !o)}>
          <Icon name="plus" size={13} /> Add deposit
        </button>
        {(g.contributions || []).length > 0 && (
          <button className="btn btn-sm btn-ghost" onClick={() => setHistoryOpen((o) => !o)}>
            <Icon name="coins" size={13} /> {historyOpen ? "Hide" : "History"} · {(g.contributions || []).length}
          </button>
        )}
        {!account && g.accountId !== null && (
          <span className="g-warn">⚠︎ Account missing — pick one above</span>
        )}
      </div>

      {depositOpen && (
        <DepositForm goal={g} cur={cur} accounts={accounts}
          onClose={() => setDepositOpen(false)} />
      )}

      {historyOpen && (
        <ContributionHistory g={g} cur={cur} />
      )}
    </Card>
  );
}

function DepositForm({ goal, cur, accounts, onClose }) {
  const [amount, setAmount] = React.useState("");
  const [src, setSrc] = React.useState(accounts.find((a) => a.type === "checking")?.id || accounts[0]?.id || "");
  const [date, setDate] = React.useState(todayLocal());
  const [note, setNote] = React.useState("");
  const [link, setLink] = React.useState(true);

  const submit = (e) => {
    e?.preventDefault?.();
    const amt = parseFloat(String(amount).replace(/[^0-9.]/g, "")) || 0;
    if (!amt) return;
    Store.addSavingsContribution(goal.id, {
      amount: amt,
      sourceAccountId: link ? src : null,
      date,
      note: note.trim(),
      kind: "adhoc",
      link,
    });
    onClose?.();
  };

  return (
    <form className="deposit-form" onSubmit={submit}>
      <div className="df-row">
        <div className="df-field df-amt">
          <label>Amount</label>
          <div className="loan-input">
            <span className="pre">{curSymbol(cur)}</span>
            <input className="num" inputMode="decimal" autoFocus value={amount}
              style={{ paddingLeft: 24 }}
              placeholder="50"
              onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        <div className="df-field">
          <label>Date</label>
          <input className="cell-input num" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      {accounts.length >= 1 && link && (
        <div className="df-field">
          <label>From account</label>
          <select className="cell-input" value={src} onChange={(e) => setSrc(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      )}
      <div className="df-field">
        <label>Note <span style={{ color: "var(--ink-faint)" }}>· optional</span></label>
        <input className="cell-input" placeholder="Birthday money, tax refund…" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <label className="df-link">
        <input type="checkbox" checked={link} onChange={(e) => setLink(e.target.checked)} />
        <span>Also log as a transfer in Transactions</span>
      </label>
      <div className="flex gap8" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-accent btn-sm">Add deposit</button>
      </div>
    </form>
  );
}

function ContributionHistory({ g, cur }) {
  const contribs = g.contributions || [];
  return (
    <div className="contrib-history">
      {contribs.map((c) =>
        <div className="contrib-row" key={c.id}>
          <span className={`contrib-kind ${c.kind || "adhoc"}`}>
            {c.kind === "split" ? "Split" : c.kind === "initial" ? "Start" : "Deposit"}
          </span>
          <span className="contrib-date">{parseYMD(c.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
          <span className="contrib-note">{c.note || <em style={{ color: "var(--ink-faint)", fontStyle: "normal" }}>—</em>}</span>
          <span className="contrib-amt num pos">+{fmtMoney(c.amount, cur)}</span>
          <button className="del-btn" style={{ opacity: 0.7 }}
            onClick={() => {
              if (c.txId && !confirm("Remove this deposit and its linked transfer transaction? Balances will reverse.")) return;
              if (!c.txId && !confirm("Remove this deposit?")) return;
              Store.deleteSavingsContribution(g.id, c.id);
            }}
            aria-label="Remove deposit"><Icon name="trash" size={13} /></button>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { SavingsModule, savedOf });
