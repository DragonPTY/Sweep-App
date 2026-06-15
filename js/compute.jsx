/* ============================================================
   compute.jsx — derived monthly $ + period helpers
   Driven by transactions, not by an "actual" field.
   ============================================================ */

/* ---------- Period model ----------
   "Period" is a viewing lens (Weekly / Monthly / Annual / All time) used by the Dashboard.
   For weekly/monthly/annual we also support stepping backwards through history via `offset`.
*/
const PERIODS = {
  weekly: {
    label: "Weekly",
    mult: { weekly: 1, fortnightly: 0.5, monthly: 12 / 52 },
  },
  monthly: {
    label: "Monthly",
    mult: { weekly: 52 / 12, fortnightly: 26 / 12, monthly: 1 },
  },
  annual: {
    label: "Annual",
    mult: { weekly: 52, fortnightly: 26, monthly: 12 },
  },
  all: {
    label: "All time",
    mult: { weekly: 52 / 12, fortnightly: 26 / 12, monthly: 1 }, // budgeted shown as monthly rate
  },
};

/* Compute the calendar window for a period + offset (0 = current, 1 = previous, etc).
   Returns { from, to, label }. For "all" returns the unbounded window. */
function periodWindow(period, offset = 0) {
  const now = new Date();
  if (period === "all") {
    return { from: 0, to: Infinity, label: "All time" };
  }
  if (period === "weekly") {
    // Calendar week starting Monday
    const d = new Date(now);
    const dow = (d.getDay() + 6) % 7; // 0 = Monday
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - dow - offset * 7);
    const from = new Date(d);
    const to = new Date(d); to.setDate(to.getDate() + 7);
    const fmt = { day: "numeric", month: "short" };
    const label = offset === 0 ? "This week"
                : offset === 1 ? "Last week"
                : `${from.toLocaleDateString(undefined, fmt)} – ${new Date(to.getTime() - 1).toLocaleDateString(undefined, fmt)}`;
    return { from: from.getTime(), to: to.getTime(), label };
  }
  if (period === "monthly") {
    const from = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const to = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
    const label = offset === 0 ? "This month"
                : offset === 1 ? "Last month"
                : from.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    return { from: from.getTime(), to: to.getTime(), label };
  }
  if (period === "annual") {
    const from = new Date(now.getFullYear() - offset, 0, 1);
    const to = new Date(now.getFullYear() - offset + 1, 0, 1);
    const label = offset === 0 ? "This year" : offset === 1 ? "Last year" : `${from.getFullYear()}`;
    return { from: from.getTime(), to: to.getTime(), label };
  }
  return { from: 0, to: Infinity, label: "All time" };
}

/* Walk every category in the budget (flat list with section info) */
function eachCategory(s) {
  const out = [];
  for (const sec of s.budget.sections || []) {
    for (const item of sec.items || []) {
      out.push({ ...item, sectionId: sec.id, sectionName: sec.name });
    }
  }
  return out;
}
function findCategory(s, id) {
  for (const sec of s.budget.sections || []) {
    for (const item of sec.items || []) if (item.id === id) return { ...item, sectionId: sec.id, sectionName: sec.name };
  }
  return null;
}

/* Convert a budgeted line item to the chosen period */
function budgetedIn(item, period) {
  const p = PERIODS[period] || PERIODS.monthly;
  return (Number(item.amount) || 0) * (p.mult[item.freq] || 0);
}

/* Sum transactions falling inside the given window. */
function spentInWindow(s, win, filter = () => true) {
  let sum = 0;
  for (const tx of s.transactions || []) {
    if (tx.kind === "transfer") continue;
    if (!filter(tx)) continue;
    const t = parseYMD(tx.date).getTime();
    if (!isNaN(t) && t >= win.from && t < win.to) sum += Number(tx.amount) || 0;
  }
  return sum;
}
function spentByCategoryInWindow(s, win) {
  const map = {};
  for (const tx of s.transactions || []) {
    if (tx.kind === "transfer") continue;
    const t = parseYMD(tx.date).getTime();
    if (isNaN(t) || t < win.from || t >= win.to) continue;
    const k = tx.categoryId || "__uncat";
    map[k] = (map[k] || 0) + (Number(tx.amount) || 0);
  }
  return map;
}

/* Trailing-30-day spend for the live Sweep math. Kept independent of the Dashboard
   period selector so the headline figure stays stable. */
function spentInPeriod(s, period, filter = () => true) {
  const days = period === "weekly" ? 7 : period === "annual" ? 365.25 : 30.4375;
  const cutoff = Date.now() - days * 86400000;
  const win = { from: cutoff, to: Infinity };
  return spentInWindow(s, win, filter);
}
function spentByCategory(s, period) {
  const days = period === "weekly" ? 7 : period === "annual" ? 365.25 : 30.4375;
  const win = { from: Date.now() - days * 86400000, to: Infinity };
  return spentByCategoryInWindow(s, win);
}

/* ---------- Headline totals (always normalised to monthly for the Sweep) ---------- */
function computeTotals(s) {
  const mods = s.settings.modules;
  const sum = (arr, fn) => arr.reduce((a, x) => a + fn(x), 0);

  const incomeMonthly = sum(s.income, (i) => toMonthly(i.amount, i.freq));
  // Budgeted monthly across all categories (what you've planned to spend)
  const budgetedMonthly = eachCategory(s).reduce((a, c) => a + toMonthly(c.amount, c.freq), 0);
  // Actual monthly = trailing-30-day transactions
  const actualMonthly = spentInPeriod(s, "monthly");

  // Misc still has its allowance-as-buffer behaviour (kept separate from transactions)
  const miscTotal = sum(s.misc.items, (m) => Number(m.amount) || 0);
  const miscAllowance = Number(s.misc.allowance) || 0;
  const miscImpact = Math.max(miscAllowance, miscTotal);

  // Optional modules (only counted when switched on)
  const carMonthly     = mods.car        ? sum(s.car,        (c) => toMonthly(c.amount, c.freq)) : 0;
  const savingsMonthly = mods.savings    ? Number(s.settings.savingsPool) || 0                            : 0;
  const retireMonthly  = mods.retirement ? sum(s.retirement, (x) => Number(x.contrib) || 0)      : 0;
  const sideIncome     = mods.side       ? sum(s.side.income,  (x) => toMonthly(x.amount, x.freq)) : 0;
  const sideExpense    = mods.side       ? sum(s.side.expense, (x) => toMonthly(x.amount, x.freq)) : 0;
  const debtMinMonthly = mods.debt       ? sum(s.debt,       (d) => Number(d.min) || 0)           : 0;

  // Net-worth-ish balances
  const sharesValue    = mods.shares     ? sum(s.shares,     (x) => (Number(x.units) || 0) * (Number(x.price) || 0)) : 0;
  const sharesCost     = mods.shares     ? sum(s.shares,     (x) => Number(x.cost) || 0) : 0;
  const retireBalance  = mods.retirement ? sum(s.retirement, (x) => Number(x.balance) || 0) : 0;
  const debtBalance    = mods.debt       ? sum(s.debt,       (d) => Number(d.balance) || 0) : 0;
  const savingsBalance = mods.savings    ? sum(s.savings,    (g) => (g.contributions || []).reduce((a, c) => a + (Number(c.amount) || 0), 0)) : 0;

  const totalIncome   = incomeMonthly + sideIncome;
  const sideProfit    = sideIncome - sideExpense;
  // Total spending = actual transactions + misc impulse buffer + optional modules
  const totalSpending = actualMonthly + miscImpact
                      + carMonthly + savingsMonthly + retireMonthly + sideExpense + debtMinMonthly;

  // Planned sweep — what you'd have if you stayed on budget. Stable, good for projections.
  const plannedSpending = budgetedMonthly + miscAllowance
                        + carMonthly + savingsMonthly + retireMonthly + sideExpense + debtMinMonthly;
  const plannedSweep = totalIncome - plannedSpending;
  // Actual sweep — feeds the loan calculator per spec
  const sweep = totalIncome - totalSpending;

  return {
    incomeMonthly, budgetedMonthly, actualMonthly,
    miscTotal, miscAllowance, miscImpact,
    carMonthly, savingsMonthly, retireMonthly, sideIncome, sideExpense, sideProfit, debtMinMonthly,
    sharesValue, sharesCost, retireBalance, debtBalance, savingsBalance,
    totalIncome, totalSpending, sweep, plannedSweep,
  };
}

// The extra payment fed to the loan calculator (monthly): live Sweep when auto, else manual.
function effectiveExtra(s, totals) {
  if (s.loan.extraAuto) return Math.max(0, Math.round(totals.sweep));
  return toMonthly(Number(s.loan.extraManual) || 0, s.loan.extraFreq || "monthly");
}

/* Effective offset for the loan calculation. If the user has any accounts of
   type "offset", those are the source of truth (summed). Otherwise fall back
   to the manual `loan.offset` field. This is what "auto-sync offset accounts
   into the Loan tab" reduces to. */
function effectiveOffset(s) {
  const offsetAccts = (s.accounts || []).filter((a) => a.type === "offset");
  if (offsetAccts.length > 0) {
    return offsetAccts.reduce((a, x) => a + (Number(x.balance) || 0), 0);
  }
  return Number(s.loan.offset) || 0;
}
function hasOffsetAccounts(s) {
  return (s.accounts || []).some((a) => a.type === "offset");
}

// Full breakdown of what gets added to the base repayment in the calculator.
function loanExtras(s, totals) {
  const payment = toMonthly(Number(s.loan.repayment) || 0, s.loan.repayFreq || "monthly");
  const base = effectiveExtra(s, totals);
  const boosts = s.loan.boosts || {};
  let fortnightly = 0, roundUp = 0;
  if (boosts.fortnightly) fortnightly = payment / 12;
  if (boosts.roundUp) roundUp = Math.ceil((payment + base) / 50) * 50 - (payment + base);
  const extra = base + fortnightly + roundUp;
  return { payment, base, fortnightly, roundUp, extra, offset: effectiveOffset(s) };
}

Object.assign(window, {
  PERIODS, periodWindow, eachCategory, findCategory, budgetedIn,
  spentInPeriod, spentByCategory, spentInWindow, spentByCategoryInWindow,
  computeTotals, effectiveExtra, loanExtras, effectiveOffset, hasOffsetAccounts,
});
