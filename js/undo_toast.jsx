/* ============================================================
   undo_toast.jsx — bottom-center toast for destructive actions
   ============================================================
   Two roles:

   1) Watches the store's undo-depth. When a new snapshot lands, surface a
      "X — Undo" toast (auto-dismisses after 6s).
   2) Exposes window.__undoToast(message, isPositive) so the keyboard handler
      can flash a confirmation after Ctrl/Cmd-Z fires.

   We never toast every store change — only when historyDepth grows past the
   previous tick. That keeps it tied to the explicitly-snapshotted operations
   (add/delete/edit transaction, payday, account reorder, reset, clear all). */

function UndoToast() {
  // Subscribe so we re-render on every Store mutation and can detect depth deltas.
  useStore();
  const [toast, setToast] = React.useState(null); // { label, ts, kind }
  const lastDepth = React.useRef(Store.historyDepth());
  const timerRef = React.useRef(null);

  // Detect newly-pushed undo snapshots
  React.useEffect(() => {
    const depth = Store.historyDepth();
    if (depth > lastDepth.current) {
      const label = Store.lastUndoLabel();
      lastDepth.current = depth;
      flash({ label, kind: "undoable" });
    } else if (depth < lastDepth.current) {
      // history shrank — typically the user undid; the keyboard path already
      // shows its own confirmation, but in case the toast button was clicked,
      // lastDepth needs to catch up silently.
      lastDepth.current = depth;
    }
  });

  // Imperative API for the global keyboard handler
  React.useEffect(() => {
    window.__undoToast = (label, isFlash) => flash({ label, kind: isFlash ? "flash" : "undoable" });
    return () => { delete window.__undoToast; };
  }, []);

  function flash(t) {
    setToast({ ...t, id: Math.random() });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), t.kind === "flash" ? 2200 : 6000);
  }

  function undo() {
    const label = Store.undo();
    clearTimeout(timerRef.current);
    if (label) {
      setToast({ label: `Undid: ${label}`, kind: "flash", id: Math.random() });
      timerRef.current = setTimeout(() => setToast(null), 2200);
    } else {
      setToast(null);
    }
  }

  function dismiss() {
    clearTimeout(timerRef.current);
    setToast(null);
  }

  if (!toast) return null;

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const shortcut = isMac ? "⌘Z" : "Ctrl+Z";

  return (
    <div className={`undo-toast ${toast.kind}`} role="status" aria-live="polite" key={toast.id}>
      <div className="ut-dot"></div>
      <span className="ut-label">{toast.label}</span>
      {toast.kind === "undoable" && (
        <>
          <button className="ut-btn" onClick={undo} title={`Undo (${shortcut})`}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6" /><path d="M3 13a9 9 0 1 0 3-7" /></svg>
            Undo
            <kbd className="ut-kbd">{shortcut}</kbd>
          </button>
          <button className="ut-x" onClick={dismiss} aria-label="Dismiss">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 5l14 14M5 19L19 5" /></svg>
          </button>
        </>
      )}
    </div>
  );
}

Object.assign(window, { UndoToast });
