/* ============================================================
   tab_budget.jsx — sections of categories with W/F/M frequencies
                   + per-item account routing + person/owner tagging
                   + Payday batch logger
   ============================================================ */

function BudgetTab() {
  const s = useStore();
  const cur = s.settings.currency;
  const sections = s.budget.sections || [];
  const accounts = s.accounts || [];
  const multiAccount = accounts.length >= 2;
  const people = s.people || [];
  const multiPerson = people.length >= 2;

  /* Filter chip state. "all" means every owner. Persists across re-renders
     but resets if the filtered person gets deleted. */
  const [filterOwner, setFilterOwner] = React.useState("all");
  React.useEffect(() => {
    if (filterOwner !== "all" && !people.some((p) => p.id === filterOwner)) {
      setFilterOwner("all");
    }
  }, [people, filterOwner]);

  const matchOwner = (it) => filterOwner === "all" || (it.ownerId || people[0]?.id) === filterOwner;

  /* Totals reflect the active filter — Chandler's use case is "show me my half
     of the rent" so the chip totals adapt rather than always reporting the
     whole household. */
  const filteredItems = sections.flatMap((sec) => sec.items.filter(matchOwner));
  const totalMonthly = filteredItems.reduce((a, it) => a + toMonthly(it.amount, it.freq), 0);
  const totalAnnual = totalMonthly * 12;
  const itemCount = filteredItems.length;

  const addSection = () => {
    const name = prompt("Name this section (e.g. Kids, Pets, Subscriptions):", "Custom");
    if (!name) return;
    Store.update("budget.sections", (l) => [...l, { id: uid(), name: name.trim(), items: [] }]);
  };
  const renameSection = (id, name) =>
    Store.update("budget.sections", (l) => l.map((sec) => sec.id === id ? { ...sec, name } : sec));
  const deleteSection = (id) => {
    const sec = sections.find((x) => x.id === id);
    if (!sec) return;
    if (sec.items.length && !confirm(`Delete "${sec.name}" and its ${sec.items.length} categories? Existing transactions stay but lose their category.`)) return;
    const ids = sec.items.map((i) => i.id);
    Store.update("budget.sections", (l) => l.filter((x) => x.id !== id));
    Store.update("transactions", (l) => l.map((tx) => ids.includes(tx.categoryId) ? { ...tx, categoryId: null } : tx));
  };

  /* New rows inherit the active filter — if you're viewing "Person 2"
     and click Add, the new item belongs to Person 2. Saves a click. */
  const defaultOwnerForNew = filterOwner === "all" ? (people[0]?.id || null) : filterOwner;

  const addItem = (secId) =>
    Store.update("budget.sections", (l) => l.map((sec) => sec.id === secId ?
      { ...sec, items: [...sec.items, { id: uid(), name: "", amount: 0, freq: "monthly", accountId: accounts[0]?.id || null, payIntoId: null, ownerId: defaultOwnerForNew }] } :
      sec));
  const editItem = (secId, itemId, key, val) =>
    Store.update("budget.sections", (l) => l.map((sec) => sec.id === secId ?
      { ...sec, items: sec.items.map((it) => it.id === itemId ? { ...it, [key]: val } : it) } :
      sec));
  const deleteItem = (secId, itemId) => {
    Store.update("budget.sections", (l) => l.map((sec) => sec.id === secId ?
      { ...sec, items: sec.items.filter((it) => it.id !== itemId) } :
      sec));
    Store.update("transactions", (l) => l.map((tx) => tx.categoryId === itemId ? { ...tx, categoryId: null } : tx));
  };

  /* Payday respects the filter too. If you're viewing just your own column,
     running Payday only logs *your* items. Useful when partners pay their
     own share on separate paydays. */
  const allItemsForPayday = sections.flatMap((sec) => sec.items.filter((it) => matchOwner(it) && (+it.amount || 0) > 0));
  const paydayTotal = allItemsForPayday.reduce((a, it) => a + (+it.amount || 0), 0);

  const runPayday = () => {
    if (!allItemsForPayday.length) return;
    const date = todayLocal();
    const transfers = allItemsForPayday.filter((it) => it.payIntoId).length;
    const scope = filterOwner === "all" ? "" : ` for ${people.find((p) => p.id === filterOwner)?.name || ""}`;
    const msg = `Log ${allItemsForPayday.length} transactions${scope} totalling ${fmtMoney(paydayTotal, cur, { decimals: 0 })} as paid today?\n\nEach moves money out of its “Pay from” account` + (transfers > 0 ? ` and into its “Pay into” account where set (${transfers} transfer${transfers === 1 ? "" : "s"}).` : `.`);
    if (!confirm(msg)) return;
    Store.runPayday(allItemsForPayday.map((it) => ({
      amount: +it.amount || 0,
      categoryId: it.id,
      fromId: it.accountId || accounts[0]?.id || null,
      intoId: it.payIntoId || null,
      note: `Payday: ${it.name || "budgeted item"}`,
    })), date);
  };

  return (
    <div>
      <PageHead title="Budget">Everything you plan to spend, grouped your way. Each line has a budgeted amount, a frequency, and (if you share with a partner or housemate) who's on the hook. Log the real spend on the Transactions tab — actuals roll up here.</PageHead>

      {multiPerson && (
        <PeopleChips people={people} active={filterOwner} onChange={setFilterOwner} sections={sections} />
      )}

      <div className="flex gap12 wrap mb16">
        <span className="chip"><Icon name="wallet" size={14} />{fmtMoney(totalMonthly, cur, { decimals: 0 })} / month {filterOwner !== "all" && people.find((p) => p.id === filterOwner) && <em style={{ color: "var(--ink-faint)", fontStyle: "normal" }}>· {people.find((p) => p.id === filterOwner).name}</em>}</span>
        <span className="chip"><Icon name="calendar" size={14} />{fmtMoney(totalAnnual, cur, { decimals: 0 })} / year</span>
        <span className="chip">{itemCount} {itemCount === 1 ? "category" : "categories"}{filterOwner === "all" ? ` across ${sections.length} sections` : ""}</span>
      </div>

      {multiAccount && (
        <Card className="payday-card" style={{ marginBottom: 18, padding: "20px 24px" }}>
          <div className="payday-grid">
            <div>
              <span className="section-label">Payday</span>
              <p style={{ margin: "2px 0 0", color: "var(--ink-dim)", fontSize: 14, maxWidth: "44ch", lineHeight: 1.5 }}>
                One click logs <b style={{ color: "var(--ink)" }}>every budgeted item{filterOwner === "all" ? "" : " in this view"}</b> as paid today. Each leaves its <b style={{ color: "var(--ink)" }}>Pay-from</b> account and, where you've set one, lands in its <b style={{ color: "var(--ink)" }}>Pay-into</b> account — so balances update across the board.
              </p>
            </div>
            <button className="btn btn-accent payday-btn" onClick={runPayday} disabled={!allItemsForPayday.length}>
              <Icon name="arrowdown" size={16} /> Run payday · {fmtMoney(paydayTotal, cur, { decimals: 0 })}
            </button>
          </div>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {sections.map((sec) =>
          <BudgetSection key={sec.id} sec={sec} cur={cur}
            accounts={accounts} multiAccount={multiAccount}
            people={people} multiPerson={multiPerson}
            matchOwner={matchOwner} filterOwner={filterOwner}
            onRename={(n) => renameSection(sec.id, n)}
            onDelete={() => deleteSection(sec.id)}
            onAddItem={() => addItem(sec.id)}
            onEditItem={(id, k, v) => editItem(sec.id, id, k, v)}
            onDeleteItem={(id) => deleteItem(sec.id, id)} />
        )}
      </div>

      <button className="addrow" style={{ marginTop: 18 }} onClick={addSection}>
        <Icon name="plus" size={16} /> Add a section
      </button>

      {!multiPerson && (
        <Card soft style={{ padding: "13px 18px", marginTop: 16 }} className="flex gap12">
          <Icon name="info" size={16} style={{ color: "var(--accent)", flex: "none" }} />
          <span style={{ fontSize: 13, color: "var(--ink-dim)" }}>
            Sharing a budget with a partner or housemate? Add people in <b style={{ color: "var(--ink)" }}>Settings → People</b> and you can tag each item as Shared, Person 1, etc., then filter by who.
          </span>
        </Card>
      )}
    </div>
  );
}

/* People filter chips at the top of the Budget tab.
   Each chip shows a person's name + how many items they own; clicking it
   filters the budget to just that person. "All" shows the whole household. */
function PeopleChips({ people, active, onChange, sections }) {
  const countFor = (pid) => {
    let n = 0;
    for (const sec of sections) for (const it of sec.items) {
      const owner = it.ownerId || people[0]?.id;
      if (owner === pid) n++;
    }
    return n;
  };
  const total = sections.reduce((a, sec) => a + sec.items.length, 0);
  return (
    <div className="people-chips" role="tablist" aria-label="Filter by person">
      <button role="tab" aria-selected={active === "all"} className={`person-chip ${active === "all" ? "on" : ""}`} onClick={() => onChange("all")}>
        <span className="pc-dot" style={{ background: "var(--ink-faint)" }}></span>
        Everyone <small>{total}</small>
      </button>
      {people.map((p) => (
        <button key={p.id} role="tab" aria-selected={active === p.id} className={`person-chip ${active === p.id ? "on" : ""}`} onClick={() => onChange(p.id)} style={active === p.id ? { borderColor: p.color, boxShadow: `inset 0 0 0 1px ${p.color}` } : null}>
          <span className="pc-dot" style={{ background: p.color }}></span>
          {p.name} <small>{countFor(p.id)}</small>
        </button>
      ))}
    </div>
  );
}

function BudgetSection({ sec, cur, accounts, multiAccount, people, multiPerson, matchOwner, filterOwner, onRename, onDelete, onAddItem, onEditItem, onDeleteItem }) {
  /* Grid columns depend on which optional columns are showing. Person column
     only appears if there are 2+ people. */
  const cols = [
    "1.4fr",                                // Category
    "0.9fr",                                // Budgeted
    "0.95fr",                               // Frequency
    multiPerson ? "1fr" : null,             // Person
    multiAccount ? "1fr" : null,            // Pay from
    multiAccount ? "1fr" : null,            // Pay into
    "1fr",                                  // Monthly (locked)
    "40px",                                 // Delete
  ].filter(Boolean).join(" ");
  const grid = { gridTemplateColumns: cols };

  const visibleItems = sec.items.filter(matchOwner);
  const hiddenCount = sec.items.length - visibleItems.length;
  const monthly = visibleItems.reduce((a, it) => a + toMonthly(it.amount, it.freq), 0);

  return (
    <Card style={{ padding: 6 }}>
      <div className="sec-head">
        <input className="sec-title" value={sec.name} onChange={(e) => onRename(e.target.value)} aria-label="Section name" />
        <span className="chip" style={{ fontSize: 11 }}>{fmtMoney(monthly, cur, { decimals: 0 })}/mo</span>
        <span className="chip" style={{ fontSize: 11 }}>
          {visibleItems.length} {visibleItems.length === 1 ? "item" : "items"}
          {hiddenCount > 0 && <em style={{ color: "var(--ink-faint)", fontStyle: "normal", marginLeft: 4 }}>· {hiddenCount} hidden</em>}
        </span>
        <span className="spacer" style={{ flex: 1 }}></span>
        <button className="iconbtn" style={{ width: 32, height: 32 }} onClick={onDelete} title="Delete section" aria-label="Delete section">
          <Icon name="trash" size={14} />
        </button>
      </div>
      <div className="tablecard" style={{ background: "transparent", border: "none", boxShadow: "none", padding: 0 }}>
        <div className="row head" style={grid}>
          <span>Category</span>
          <span style={{ textAlign: "right" }}>Budgeted</span>
          <span>Frequency</span>
          {multiPerson && <span>Person</span>}
          {multiAccount && <span>Pay from</span>}
          {multiAccount && <span>Pay into</span>}
          <span style={{ textAlign: "right" }}>Monthly <Lock /></span>
          <span></span>
        </div>
        {visibleItems.length === 0 &&
          <div className="empty" style={{ padding: "28px 16px" }}>
            <div className="big" style={{ marginBottom: 4 }}>
              {sec.items.length === 0 ? "No categories in this section yet" : "Nothing for this person here"}
            </div>
          </div>
        }
        {visibleItems.map((it) =>
          <div className="row" style={grid} key={it.id}>
            <TextCell value={it.name} placeholder="e.g. Groceries" onChange={(v) => onEditItem(it.id, "name", v)} />
            <AmountCell value={it.amount} currency={cur} onChange={(v) => onEditItem(it.id, "amount", v)} />
            <BudgetFreqCell value={it.freq} onChange={(v) => onEditItem(it.id, "freq", v)} />
            {multiPerson && (
              <PersonSelect people={people} value={it.ownerId || people[0]?.id} onChange={(v) => onEditItem(it.id, "ownerId", v)} />
            )}
            {multiAccount && (
              <select className="cell-input" value={it.accountId || ""} onChange={(e) => onEditItem(it.id, "accountId", e.target.value || null)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                <option value="">— none</option>
              </select>
            )}
            {multiAccount && (
              <select className="cell-input" value={it.payIntoId || ""} onChange={(e) => onEditItem(it.id, "payIntoId", e.target.value || null)} title="Optional — set if this payment transfers into another account you track">
                <option value="">External / paid out</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>→ {a.name}</option>)}
              </select>
            )}
            <LockCell>{fmtMoney(toMonthly(it.amount, it.freq), cur)}</LockCell>
            <DelBtn onClick={() => onDeleteItem(it.id)} />
          </div>
        )}
        <button className="addrow" style={{ marginTop: 4 }} onClick={onAddItem}>
          <Icon name="plus" size={14} /> Add category to {sec.name || "this section"}
          {multiPerson && filterOwner !== "all" && (
            <em style={{ color: "var(--ink-faint)", fontStyle: "normal", marginLeft: 6 }}>· for {people.find((p) => p.id === filterOwner)?.name}</em>
          )}
        </button>
      </div>
    </Card>
  );
}

/* Single-cell person picker. Native <select> with a coloured dot via background
   trick — keeps it accessible while still showing who owns the row at a glance. */
function PersonSelect({ people, value, onChange }) {
  const cur = people.find((p) => p.id === value) || people[0];
  return (
    <div className="person-cell" style={{ "--owner-color": cur?.color || "var(--ink-faint)" }}>
      <span className="pc-dot" aria-hidden="true"></span>
      <select className="cell-input person-select" value={value || ""} onChange={(e) => onChange(e.target.value)}>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );
}

Object.assign(window, { BudgetTab, BudgetSection, PeopleChips, PersonSelect });
