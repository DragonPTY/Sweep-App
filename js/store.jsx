/* ============================================================
   store.jsx — global state, persistence, money + loan math
   ============================================================ */

/* ---------- Currencies ---------- */
const CURRENCIES = {
  USD: { symbol: "$",  locale: "en-US", name: "US Dollar" },
  EUR: { symbol: "€",  locale: "de-DE", name: "Euro" },
  GBP: { symbol: "£",  locale: "en-GB", name: "British Pound" },
  AUD: { symbol: "$",  locale: "en-AU", name: "Australian Dollar" },
  NZD: { symbol: "$",  locale: "en-NZ", name: "New Zealand Dollar" },
  CAD: { symbol: "$",  locale: "en-CA", name: "Canadian Dollar" },
  JPY: { symbol: "¥",  locale: "ja-JP", name: "Japanese Yen" },
  INR: { symbol: "₹",  locale: "en-IN", name: "Indian Rupee" },
  SGD: { symbol: "$",  locale: "en-SG", name: "Singapore Dollar" },
  ZAR: { symbol: "R",  locale: "en-ZA", name: "South African Rand" },
};

/* ---------- Frequencies → multiplier to monthly ---------- */
const FREQS = {
  weekly:      { label: "Weekly",      m: 52 / 12 },
  fortnightly: { label: "Fortnightly", m: 26 / 12 },
  monthly:     { label: "Monthly",     m: 1 },
  quarterly:   { label: "Quarterly",   m: 1 / 3 },
  yearly:      { label: "Yearly",      m: 1 / 12 },
};
const toMonthly = (amount, freq) => (Number(amount) || 0) * (FREQS[freq]?.m ?? 1);
const toAnnual  = (amount, freq) => toMonthly(amount, freq) * 12;

/* ---------- Currency formatting ---------- */
function fmtMoney(value, currency = "USD", opts = {}) {
  const c = CURRENCIES[currency] || CURRENCIES.USD;
  const n = Number(value) || 0;
  const decimals = opts.decimals != null ? opts.decimals
    : (currency === "JPY" ? 0 : (Math.abs(n) >= 100000 && opts.compact !== false ? 0 : 2));
  try {
    return new Intl.NumberFormat(c.locale, {
      style: "currency", currency,
      minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    }).format(n);
  } catch (e) {
    return c.symbol + n.toFixed(decimals);
  }
}
function curSymbol(currency) { return (CURRENCIES[currency] || CURRENCIES.USD).symbol; }

const uid = () => Math.random().toString(36).slice(2, 9);

/* ============================================================
   Loan amortization engine — month-by-month simulation
   ============================================================ */

// Standard amortizing payment for a balance over n months at annual rate %.
function requiredPayment(balance, annualRatePct, months) {
  const r = annualRatePct / 100 / 12;
  if (months <= 0) return balance;
  if (r === 0) return balance / months;
  return (balance * r) / (1 - Math.pow(1 + r, -months));
}

// Simulate paying down a loan. Offset reduces the balance interest is charged on.
// Returns { months, totalInterest, schedule[] }  (months = Infinity if never paid off)
function simulateLoan({ balance, annualRatePct, payment, offset = 0, extra = 0 }) {
  const r = annualRatePct / 100 / 12;
  let bal = balance;
  let totalInterest = 0;
  let months = 0;
  const schedule = [];
  const cap = 1200; // 100-year safety cap
  const pay = payment + extra;

  while (bal > 0.005 && months < cap) {
    const effective = Math.max(0, bal - offset);
    const interest = effective * r;
    let principal = pay - interest;
    if (principal <= 0) { return { months: Infinity, totalInterest: Infinity, schedule }; }
    if (principal > bal) principal = bal;
    bal -= principal;
    totalInterest += interest;
    months++;
    if (months % 12 === 0 || bal <= 0.005) {
      schedule.push({ month: months, balance: Math.max(0, bal), interest: totalInterest });
    }
  }
  return { months, totalInterest, schedule };
}

// Add months to today's date → "Mon YYYY"
function payoffDate(months) {
  if (!isFinite(months)) return "—";
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + Math.ceil(months));
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
function fmtDuration(months) {
  if (!isFinite(months)) return "Never";
  const y = Math.floor(months / 12), m = Math.round(months % 12);
  if (y === 0) return `${m} mo`;
  if (m === 0) return `${y} yr`;
  return `${y} yr ${m} mo`;
}

/* Subset of frequencies allowed inside the Budget tab. */
const BUDGET_FREQS = {
  weekly:      FREQS.weekly,
  fortnightly: FREQS.fortnightly,
  monthly:     FREQS.monthly,
};

/* Constrain any older freq value to one of weekly/fortnightly/monthly. */
function clampBudgetFreq(amount, freq) {
  if (freq === "quarterly") return { amount: amount / 3,  freq: "monthly" };
  if (freq === "yearly")    return { amount: amount / 12, freq: "monthly" };
  if (!BUDGET_FREQS[freq])  return { amount, freq: "monthly" };
  return { amount, freq };
}

/* Date helpers */
function dayOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return ymdLocal(d);
}

/* ============================================================
   Default pre-filled data
   ============================================================ */
function defaultPeople() {
  /* Distinct accent hues; chroma kept low so the chips don't fight with the
     theme colour. Light/dark-mode friendly because we use oklch. */
  return [
    { id: uid(), name: "Shared",   color: "oklch(0.62 0.04 250)" },
    { id: uid(), name: "Person 1", color: "oklch(0.70 0.12 195)" },
    { id: uid(), name: "Person 2", color: "oklch(0.68 0.13 25)"  },
  ];
}

function defaultBudget() {
  const billsId = uid(), spendId = uid();
  const cat = (name, amount, freq) => ({ id: uid(), name, amount, freq });
  return {
    sections: [
      {
        id: billsId, name: "Bills",
        items: [
          cat("Rent / Mortgage", 380, "weekly"),
          cat("Electricity", 140, "monthly"),
          cat("Internet", 65, "monthly"),
          cat("Phone", 45, "monthly"),
          cat("Insurance", 107, "monthly"),
          cat("Streaming bundle", 28, "monthly"),
        ],
      },
      {
        id: spendId, name: "Everyday Spending",
        items: [
          cat("Groceries", 150, "weekly"),
          cat("Dining out", 50, "weekly"),
          cat("Transport / fuel", 45, "weekly"),
          cat("Health & fitness", 90, "monthly"),
          cat("Subscriptions", 50, "monthly"),
        ],
      },
    ],
  };
}

function defaultTransactions() {
  // Realistic recent transactions matching the seeded categories.
  // resolves names → ids once the budget is in place.
  return [
    { id: uid(), date: dayOffset(0),  amount: 47.20, name: "Groceries",       note: "Weekly shop" },
    { id: uid(), date: dayOffset(1),  amount: 38.50, name: "Dining out",      note: "Pizza night" },
    { id: uid(), date: dayOffset(2),  amount: 62.40, name: "Transport / fuel",note: "Fill-up" },
    { id: uid(), date: dayOffset(4),  amount: 84.10, name: "Groceries",       note: "Top-up + meat" },
    { id: uid(), date: dayOffset(5),  amount: 28.00, name: "Streaming bundle",note: "Monthly" },
    { id: uid(), date: dayOffset(7),  amount: 65.00, name: "Internet",        note: "" },
    { id: uid(), date: dayOffset(8),  amount: 22.80, name: "Dining out",      note: "Lunch out" },
    { id: uid(), date: dayOffset(10), amount: 56.30, name: "Groceries",       note: "" },
    { id: uid(), date: dayOffset(12), amount: 45.00, name: "Phone",           note: "Monthly plan" },
    { id: uid(), date: dayOffset(14), amount: 50.00, name: "Subscriptions",   note: "Apps & cloud" },
    { id: uid(), date: dayOffset(18), amount: 380.00, name: "Rent / Mortgage",note: "Weekly rent" },
    { id: uid(), date: dayOffset(22), amount: 90.00, name: "Health & fitness",note: "Gym" },
  ];
}

function defaultIncomeLog() {
  return [
    { id: uid(), date: dayOffset(2),  amount: 4200, source: "Primary salary", note: "Fortnightly paycheck" },
    { id: uid(), date: dayOffset(16), amount: 4200, source: "Primary salary", note: "Fortnightly paycheck" },
    { id: uid(), date: dayOffset(8),  amount: 480,  source: "Freelance / side", note: "Logo project" },
  ];
}

function defaultData() {
  return {
    settings: {
      theme: "aurora",
      currency: "USD",
      mode: "dark",
      displayPeriod: "monthly",
      savingsPool: 200,
      modules: { car: false, savings: false, shares: false, retirement: false, side: false, debt: false },
      hiddenTabs: { misc: false, sweep: false, loan: false, moves: false },
    },
    /* People who share the budget. Always has at least one entry; first one
       acts as the catch-all fallback. We seed two so the partner pattern
       Chandler asked about works out of the box, plus a "Shared" bucket. */
    people: defaultPeople(),
    income: [
      { id: uid(), name: "Primary salary", amount: 4200, freq: "monthly" },
      { id: uid(), name: "Freelance / side", amount: 350, freq: "monthly" },
    ],
    incomeLog: defaultIncomeLog(),
    accounts: [
      { id: uid(), name: "Everyday checking", balance: 2400, type: "checking" },
      { id: uid(), name: "Savings", balance: 8600, type: "savings" },
      { id: uid(), name: "Mortgage offset", balance: 12000, type: "offset" },
    ],
    budget: defaultBudget(),
    transactions: defaultTransactions(),
    misc: {
      allowance: 200,
      items: [
        { id: uid(), name: "New headphones", amount: 120 },
        { id: uid(), name: "Birthday gift", amount: 45 },
      ],
    },
    sweep: {
      destination: "offset",
      history: [
        { id: uid(), date: "2026-05-01", amount: 540, dest: "offset" },
        { id: uid(), date: "2026-04-01", amount: 610, dest: "offset" },
        { id: uid(), date: "2026-03-01", amount: 480, dest: "highest" },
      ],
    },
    loan: {
      balance: 285000, rate: 6.1,
      repayment: 1854, repayFreq: "monthly",
      offset: 12000,
      extraAuto: true, extraManual: 0, extraFreq: "monthly",
      boosts: { fortnightly: false, roundUp: false },
    },
    // optional modules
    car: [
      { id: uid(), name: "Fuel", amount: 60, freq: "weekly" },
      { id: uid(), name: "Registration", amount: 720, freq: "yearly" },
      { id: uid(), name: "Servicing", amount: 400, freq: "yearly" },
      { id: uid(), name: "Insurance", amount: 95, freq: "monthly" },
    ],
    savings: [
      { id: uid(), name: "Emergency fund", target: 10000, accountId: null, share: 50, contributions: [
        { id: uid(), amount: 6400, date: dayOffset(30), note: "Starting balance", kind: "initial" },
      ] },
      { id: uid(), name: "Holiday",        target: 4000,  accountId: null, share: 30, contributions: [
        { id: uid(), amount: 1200, date: dayOffset(60), note: "Starting balance", kind: "initial" },
      ] },
      { id: uid(), name: "New phone",      target: 1500,  accountId: null, share: 20, contributions: [] },
    ],
    shares: [
      { id: uid(), name: "Index fund (VOO)", units: 12, price: 480, cost: 5100 },
      { id: uid(), name: "Tech ETF", units: 30, price: 88, cost: 2400 },
    ],
    retirement: [
      { id: uid(), name: "Employer fund", balance: 84000, contrib: 540 },
    ],
    side: {
      income: [{ id: uid(), name: "Etsy store", amount: 600, freq: "monthly" }],
      expense: [{ id: uid(), name: "Materials", amount: 180, freq: "monthly" }, { id: uid(), name: "Listing fees", amount: 40, freq: "monthly" }],
    },
    debt: [
      { id: uid(), name: "Credit card", balance: 3200, rate: 19.9, min: 95 },
      { id: uid(), name: "Car loan", balance: 8800, rate: 7.4, min: 240 },
      { id: uid(), name: "Personal loan", balance: 5400, rate: 11.2, min: 180 },
    ],
  };
}

/* ============================================================
   Tiny global store with subscribe + localStorage persistence
   ============================================================ */
const STORAGE_KEY = "budget_planner_v1";

/* Migration: legacy `bills` / `expenses` → `budget.sections`, and resolve
   seeded transactions whose categoryId is keyed by `name`. */
function migrate(stored, merged) {
  const out = { ...merged };
  const hadLegacy = stored && (stored.bills || stored.expenses);
  if (hadLegacy) {
    const bills = (stored.bills || []).map((b) => {
      const c = clampBudgetFreq(+b.amount || 0, b.freq);
      return { id: b.id || uid(), name: b.name || "Untitled", amount: c.amount, freq: c.freq };
    });
    const exp = (stored.expenses || []).map((e) => ({
      id: e.id || uid(), name: e.name || "Untitled", amount: +e.budget || 0, freq: "monthly",
    }));
    out.budget = {
      sections: [
        { id: uid(), name: "Bills", items: bills },
        { id: uid(), name: "Everyday Spending", items: exp },
      ],
    };
    out.transactions = stored.transactions || [];
  }
  delete out.bills;
  delete out.expenses;

  // Resolve seed transactions that key by category name → real category id
  const byName = {};
  for (const sec of (out.budget && out.budget.sections) || []) {
    for (const item of sec.items || []) byName[item.name] = item.id;
  }
  out.transactions = (out.transactions || []).map((tx) => {
    if (tx.categoryId !== undefined) return tx;
    if (tx.name && byName[tx.name]) {
      const { name, ...rest } = tx;
      return { ...rest, categoryId: byName[name] };
    }
    return { ...tx, categoryId: tx.categoryId ?? null };
  });

  /* Ensure People exist for any prior install. The default seed has 3 people
     but an old stored state won't, so we top up. Then default every existing
     budget item to the first (Shared) person — clearly visible but cheap to
     change. We never overwrite an explicit ownerId. */
  if (!Array.isArray(out.people) || out.people.length === 0) out.people = defaultPeople();
  const defaultOwner = out.people[0].id;
  if (out.budget && out.budget.sections) {
    out.budget.sections = out.budget.sections.map((sec) => ({
      ...sec,
      items: (sec.items || []).map((it) => ({
        ...it,
        ownerId: it.ownerId || defaultOwner,
      })),
    }));
  }
  /* Savings goals: migrate legacy {saved, contrib} to {accountId, share, contributions[]}.
     We seed a single "Starting balance" contribution with the old saved amount so the
     running total stays correct. Share defaults to an even split when not set. */
  if (Array.isArray(out.savings)) {
    const sumOld = out.savings.reduce((a, x) => a + (Number(x.contrib) || 0), 0);
    const evenShare = out.savings.length > 0 ? Math.floor(100 / out.savings.length) : 0;
    const savingsAcct = (out.accounts || []).find((a) => a.type === "savings")?.id || null;
    out.savings = out.savings.map((g) => {
      if (Array.isArray(g.contributions)) return g; // already migrated
      const initial = Number(g.saved) || 0;
      const inferredShare = sumOld > 0 ? Math.round((Number(g.contrib) || 0) / sumOld * 100) : evenShare;
      return {
        id: g.id || uid(),
        name: g.name || "",
        target: Number(g.target) || 0,
        accountId: g.accountId ?? savingsAcct,
        share: g.share ?? inferredShare,
        contributions: initial > 0 ? [{ id: uid(), amount: initial, date: todayLocal(), note: "Starting balance", kind: "initial" }] : [],
      };
    });
    if (out.settings && (out.settings.savingsPool === undefined || out.settings.savingsPool === null)) {
      out.settings.savingsPool = sumOld || 200;
    }
  }

  return out;
}

const Store = (function () {
  let state;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stored = raw ? JSON.parse(raw) : null;
    state = stored ? migrate(stored, deepMerge(defaultData(), stored)) : migrate(null, defaultData());
  } catch (e) { state = migrate(null, defaultData()); }

  const listeners = new Set();
  let saveTimer = null;

  /* ---- Undo stack ----
     A capped LIFO of { label, snapshot }. Mutations call snapshot(label) BEFORE
     mutating; undo() pops the most recent and restores state.
     We never auto-clear when state changes — only `clearHistory` does. */
  const HISTORY_LIMIT = 30;
  const history = [];
  function snapshot(label) {
    // Structured clone keeps nested arrays/objects independent of live state.
    history.push({ label, ts: Date.now(), data: JSON.parse(JSON.stringify(state)) });
    if (history.length > HISTORY_LIMIT) history.shift();
  }

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
    }, 250);
  }
  function emit() {
    listeners.forEach((l) => l());
    /* Hook for the sync module — scheduleAutoBackup is defined in sync.jsx
       (loaded after this file). By the time any user action fires, all scripts
       are loaded, so the optional-chaining check is only needed on first boot. */
    if (typeof window.scheduleAutoBackup === "function") window.scheduleAutoBackup();
  }

  return {
    get: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    /* ---- Undo API ---- */
    canUndo: () => history.length > 0,
    lastUndoLabel: () => history.length > 0 ? history[history.length - 1].label : null,
    historyDepth: () => history.length,
    undo() {
      const entry = history.pop();
      if (!entry) return null;
      state = entry.data;
      persist(); emit();
      return entry.label;
    },
    clearHistory() { history.length = 0; },

    // update(path, updaterOrValue) — path is dot string e.g. "loan.balance"
    set(path, value) {
      state = setPath(state, path, value);
      persist(); emit();
    },
    update(path, fn) {
      const cur = getPath(state, path);
      state = setPath(state, path, fn(cur));
      persist(); emit();
    },
    reset() { snapshot("Reset to example data"); state = migrate(null, defaultData()); persist(); emit(); },
    clearAll() {
      snapshot("Clear all data");
      // A truly blank canvas — nothing pre-filled. The app still renders.
      const seedPeople = defaultPeople();
      state = {
        settings: {
          theme: state.settings.theme, currency: state.settings.currency,
          mode: state.settings.mode || "dark",
          displayPeriod: state.settings.displayPeriod || "monthly",
          savingsPool: state.settings.savingsPool || 0,
          modules: { car: false, savings: false, shares: false, retirement: false, side: false, debt: false },
          hiddenTabs: { misc: false, sweep: false, loan: false, moves: false },
        },
        people: seedPeople,
        income: [],
        incomeLog: [],
        accounts: [],
        budget: { sections: [
          { id: uid(), name: "Bills", items: [] },
          { id: uid(), name: "Everyday Spending", items: [] },
        ] },
        transactions: [],
        misc: { allowance: 0, items: [] },
        sweep: { destination: "offset", history: [] },
        loan: { balance: 0, rate: 0, repayment: 0, repayFreq: "monthly", offset: 0, extraAuto: true, extraManual: 0, extraFreq: "monthly", boosts: {} },
        car: [], savings: [], shares: [], retirement: [],
        side: { income: [], expense: [] }, debt: [],
      };
      persist(); emit();
    },
    replace(next) { state = next; persist(); emit(); },
    /* Full state replacement — used by the sync layer on restore. Runs the
       migration pass so any schema differences between a backup and the
       current app version are handled cleanly. */
    replaceState(next) { state = migrate(null, next); persist(); emit(); },

    /* ---- Account-aware operations.
       These thread balance deltas through accounts atomically so the Accounts
       tab always reflects what's been spent or received. Each pushes an undo
       snapshot before mutating so Ctrl/Cmd-Z (and the toast button) can roll
       it back perfectly. ---- */
    addTransaction(tx) {
      snapshot(tx.kind === "transfer" ? "Add transfer" : "Add transaction");
      state = setPath(state, "transactions", [tx, ...(state.transactions || [])]);
      if (tx.accountId) state = adjustBalance(state, tx.accountId, -(Number(tx.amount) || 0));
      if (tx.intoAccountId) state = adjustBalance(state, tx.intoAccountId, +(Number(tx.amount) || 0));
      persist(); emit();
    },
    updateTransaction(id, patch) {
      const old = (state.transactions || []).find((t) => t.id === id);
      if (!old) return;
      snapshot(old.kind === "transfer" ? "Edit transfer" : "Edit transaction");
      const next = { ...old, ...patch };
      state = setPath(state, "transactions", state.transactions.map((t) => t.id === id ? next : t));
      // Reverse old debits/credits, apply new ones — covers spends, transfers, and payday-style paid-into items.
      if (old.accountId) state = adjustBalance(state, old.accountId, +(Number(old.amount) || 0));
      if (old.intoAccountId) state = adjustBalance(state, old.intoAccountId, -(Number(old.amount) || 0));
      if (next.accountId) state = adjustBalance(state, next.accountId, -(Number(next.amount) || 0));
      if (next.intoAccountId) state = adjustBalance(state, next.intoAccountId, +(Number(next.amount) || 0));
      persist(); emit();
    },
    deleteTransaction(id) {
      const tx = (state.transactions || []).find((t) => t.id === id);
      if (!tx) return;
      snapshot(tx.kind === "transfer" ? "Delete transfer" : "Delete transaction");
      state = setPath(state, "transactions", state.transactions.filter((t) => t.id !== id));
      if (tx.accountId) state = adjustBalance(state, tx.accountId, +(Number(tx.amount) || 0));
      if (tx.intoAccountId) state = adjustBalance(state, tx.intoAccountId, -(Number(tx.amount) || 0));
      persist(); emit();
    },
    addIncomeEntry(entry) {
      snapshot("Log income");
      state = setPath(state, "incomeLog", [entry, ...(state.incomeLog || [])]);
      if (entry.accountId) state = adjustBalance(state, entry.accountId, +(Number(entry.amount) || 0));
      persist(); emit();
    },
    updateIncomeEntry(id, patch) {
      const old = (state.incomeLog || []).find((t) => t.id === id);
      if (!old) return;
      snapshot("Edit income entry");
      const next = { ...old, ...patch };
      state = setPath(state, "incomeLog", state.incomeLog.map((t) => t.id === id ? next : t));
      if (old.accountId) state = adjustBalance(state, old.accountId, -(Number(old.amount) || 0));
      if (next.accountId) state = adjustBalance(state, next.accountId, +(Number(next.amount) || 0));
      persist(); emit();
    },
    deleteIncomeEntry(id) {
      const e = (state.incomeLog || []).find((t) => t.id === id);
      if (!e) return;
      snapshot("Delete income entry");
      state = setPath(state, "incomeLog", state.incomeLog.filter((t) => t.id !== id));
      if (e.accountId) state = adjustBalance(state, e.accountId, -(Number(e.amount) || 0));
      persist(); emit();
    },
    runPayday(items, date) {
      snapshot(`Run payday · ${items.length} entries`);
      // items: [{ amount, categoryId, fromId, intoId, note }]
      const txs = items.map((it) => ({
        id: uid(),
        amount: Number(it.amount) || 0,
        categoryId: it.categoryId || null,
        accountId: it.fromId || null,
        intoAccountId: it.intoId || null,
        date,
        note: it.note || "",
      }));
      state = setPath(state, "transactions", [...txs, ...(state.transactions || [])]);
      for (const t of txs) {
        if (t.accountId) state = adjustBalance(state, t.accountId, -t.amount);
        if (t.intoAccountId) state = adjustBalance(state, t.intoAccountId, +t.amount);
      }
      persist(); emit();
      return txs.length;
    },
    /* ---- Savings goals ----
       Each contribution can be backed by a real transfer transaction
       (out of a source account, into the goal's account). Linking that way
       keeps account balances honest and gives the user a paper trail in the
       Transactions tab. Deleting a contribution reverses its linked transaction. */
    addSavingsContribution(goalId, payload) {
      const goal = (state.savings || []).find((g) => g.id === goalId);
      if (!goal) return;
      snapshot("Add savings deposit");

      const amount = Number(payload.amount) || 0;
      const date = payload.date || todayLocal();
      const note = payload.note || "";
      const kind = payload.kind || "adhoc";
      const link = payload.link !== false;
      const srcId = payload.sourceAccountId || null;
      const dstId = goal.accountId || null;

      let txId = null;
      if (link && srcId && amount > 0) {
        txId = uid();
        const tx = {
          id: txId, kind: "transfer", amount,
          accountId: srcId,
          intoAccountId: dstId,
          categoryId: null,
          date,
          note: note || `${kind === "split" ? "Payday split" : "Deposit"} → ${goal.name || "savings"}`,
        };
        state = setPath(state, "transactions", [tx, ...(state.transactions || [])]);
        if (srcId) state = adjustBalance(state, srcId, -amount);
        if (dstId) state = adjustBalance(state, dstId, +amount);
      }

      const contrib = { id: uid(), amount, date, note, kind, txId };
      state = setPath(state, "savings", state.savings.map((g) =>
        g.id === goalId ? { ...g, contributions: [contrib, ...(g.contributions || [])] } : g));
      persist(); emit();
    },

    deleteSavingsContribution(goalId, contribId) {
      const goal = (state.savings || []).find((g) => g.id === goalId);
      const c = goal?.contributions?.find((x) => x.id === contribId);
      if (!goal || !c) return;
      snapshot("Remove savings deposit");

      if (c.txId) {
        const tx = (state.transactions || []).find((t) => t.id === c.txId);
        if (tx) {
          state = setPath(state, "transactions", state.transactions.filter((t) => t.id !== c.txId));
          if (tx.accountId) state = adjustBalance(state, tx.accountId, +(Number(tx.amount) || 0));
          if (tx.intoAccountId) state = adjustBalance(state, tx.intoAccountId, -(Number(tx.amount) || 0));
        }
      }
      state = setPath(state, "savings", state.savings.map((g) =>
        g.id === goalId ? { ...g, contributions: g.contributions.filter((x) => x.id !== contribId) } : g));
      persist(); emit();
    },

    /* Split the user's savings allocation across every goal's share %.
       Sends rounding residue to the last goal so the total matches exactly. */
    runSavingsSplit(sourceAccountId, totalAmount) {
      const total = Number(totalAmount) || 0;
      if (total <= 0) return 0;
      const goals = (state.savings || []).filter((g) => (Number(g.share) || 0) > 0);
      if (goals.length === 0) return 0;
      snapshot(`Split savings · ${goals.length} goals`);

      const date = todayLocal();
      const totalShare = goals.reduce((a, g) => a + (Number(g.share) || 0), 0);

      let allocated = 0;
      const slices = goals.map((g, i) => {
        const slice = i === goals.length - 1
          ? Math.round((total - allocated) * 100) / 100
          : Math.round((total * (Number(g.share) || 0) / totalShare) * 100) / 100;
        allocated += slice;
        return { goal: g, amount: slice };
      });

      for (const { goal, amount } of slices) {
        if (amount <= 0) continue;
        const txId = uid();
        const tx = {
          id: txId, kind: "transfer", amount,
          accountId: sourceAccountId || null,
          intoAccountId: goal.accountId || null,
          categoryId: null, date,
          note: `Payday split → ${goal.name || "savings"} (${goal.share}%)`,
        };
        state = setPath(state, "transactions", [tx, ...(state.transactions || [])]);
        if (sourceAccountId) state = adjustBalance(state, sourceAccountId, -amount);
        if (goal.accountId) state = adjustBalance(state, goal.accountId, +amount);
        state = setPath(state, "savings", state.savings.map((g) =>
          g.id === goal.id
            ? { ...g, contributions: [{ id: uid(), amount, date, note: `${goal.share}% of split`, kind: "split", txId }, ...(g.contributions || [])] }
            : g));
      }
      persist(); emit();
      return slices.length;
    },

    moveAccount(id, dir) {
      const arr = [...(state.accounts || [])];
      const i = arr.findIndex((a) => a.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return;
      snapshot("Reorder accounts");
      [arr[i], arr[j]] = [arr[j], arr[i]];
      state = setPath(state, "accounts", arr);
      persist(); emit();
    },
  };
})();

function adjustBalance(stateObj, accountId, delta) {
  if (!accountId) return stateObj;
  const list = stateObj.accounts || [];
  return setPath(stateObj, "accounts", list.map((a) =>
    a.id === accountId ? { ...a, balance: (Number(a.balance) || 0) + delta } : a
  ));
}

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split(".");
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  let cur = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    cur[k] = Array.isArray(cur[k]) ? [...cur[k]] : { ...cur[k] };
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
  return clone;
}
function deepMerge(base, over) {
  if (Array.isArray(base)) return over !== undefined ? over : base;
  if (typeof base === "object" && base && typeof over === "object" && over) {
    const out = { ...base };
    for (const k in over) out[k] = (k in base) ? deepMerge(base[k], over[k]) : over[k];
    return out;
  }
  return over !== undefined ? over : base;
}

/* React hook into the store */
function useStore() {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => Store.subscribe(force), []);
  return Store.get();
}

/* Display period helpers — let the UI re-scale a monthly figure to whatever
   default period the user picked in Settings.

   These are PRESENTATION ONLY. Stored amounts and the Sweep math stay anchored
   to monthly so totals never drift; we only re-label and re-scale at render time. */
const DISPLAY_PERIODS = {
  weekly:      { label: "Weekly",      noun: "week",      adverb: "weekly",      shortNoun: "wk", fromMonthly: 12 / 52 },
  fortnightly: { label: "Fortnightly", noun: "fortnight", adverb: "fortnightly", shortNoun: "fn", fromMonthly: 12 / 26 },
  monthly:     { label: "Monthly",     noun: "month",     adverb: "monthly",     shortNoun: "mo", fromMonthly: 1 },
  annual:      { label: "Annual",      noun: "year",      adverb: "annually",    shortNoun: "yr", fromMonthly: 12 },
};
function scaleFromMonthly(monthlyValue, period) {
  const p = DISPLAY_PERIODS[period] || DISPLAY_PERIODS.monthly;
  return (Number(monthlyValue) || 0) * p.fromMonthly;
}
function periodShort(period) {
  return (DISPLAY_PERIODS[period] || DISPLAY_PERIODS.monthly).shortNoun;
}
function periodNoun(period) {
  return (DISPLAY_PERIODS[period] || DISPLAY_PERIODS.monthly).noun;
}
function periodLabel(period) {
  return (DISPLAY_PERIODS[period] || DISPLAY_PERIODS.monthly).label;
}

/* Local-timezone date helpers. Using `Date#toISOString` gives UTC, which can
   be off by a day from the user's local calendar — show "10 Jun" when the
   device clock reads "11 Jun". Use these everywhere we record or display a
   transaction date. */
function todayLocal() {
  const d = new Date();
  return ymdLocal(d);
}
function ymdLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* Parse a stored YYYY-MM-DD string as LOCAL midnight (not UTC). The native
   `new Date("2026-06-11")` interprets it as UTC, then toLocaleDateString
   shifts it back to whatever the local zone is — which silently rolls dates
   backwards on negative-UTC timezones (Americas) and forwards on huge
   positive ones. Always use this for display, filtering, and sort. */
function parseYMD(str) {
  if (!str || typeof str !== "string") return new Date(NaN);
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return new Date(str);
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

/* Apply theme to the document. Must set on BOTH <html> and <body>: the static
   data-theme on <body> would otherwise re-apply its own vars to all descendants
   and shadow whatever we set on <html>. */
function applyTheme(theme, mode) {
  const t = theme || "aurora";
  document.documentElement.dataset.theme = t;
  if (document.body) document.body.dataset.theme = t;
  if (mode) {
    document.documentElement.dataset.mode = mode;
    if (document.body) document.body.dataset.mode = mode;
  }
}

Object.assign(window, {
  CURRENCIES, FREQS, BUDGET_FREQS, DISPLAY_PERIODS, toMonthly, toAnnual,
  scaleFromMonthly, periodShort, periodNoun, periodLabel, todayLocal, ymdLocal, parseYMD,
  fmtMoney, curSymbol, uid,
  requiredPayment, simulateLoan, payoffDate, fmtDuration,
  Store, useStore, applyTheme,
  defaultPeople,
});
