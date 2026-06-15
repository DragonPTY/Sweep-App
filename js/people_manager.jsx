/* ============================================================
   people_manager.jsx — Settings panel for adding/editing people
   ============================================================
   Lives in Settings → People. Lets the user:
     - add a new person (auto-picks the next colour in the rotation)
     - rename inline
     - reassign a colour swatch
     - delete (with re-assignment of their items to "Shared")

   We don't expose ownerId in JSON terms anywhere; users see names. */

/* A small palette to cycle through when adding new people. oklch keeps
   the chroma matched so the swatches look like siblings, not a rainbow. */
const PERSON_COLORS = [
  "oklch(0.62 0.04 250)",  // muted slate
  "oklch(0.70 0.12 195)",  // teal
  "oklch(0.68 0.13 25)",   // coral
  "oklch(0.72 0.11 290)",  // violet
  "oklch(0.74 0.13 145)",  // emerald
  "oklch(0.78 0.13 75)",   // amber
  "oklch(0.65 0.14 340)",  // pink
];

function PeopleManager({ people }) {
  const addPerson = () => {
    const used = new Set(people.map((p) => p.color));
    const color = PERSON_COLORS.find((c) => !used.has(c)) || PERSON_COLORS[people.length % PERSON_COLORS.length];
    const nextNumber = people.filter((p) => /^Person\s/.test(p.name)).length + 1;
    Store.update("people", (l) => [...l, { id: uid(), name: `Person ${nextNumber}`, color }]);
  };

  const editPerson = (id, key, val) =>
    Store.update("people", (l) => l.map((p) => p.id === id ? { ...p, [key]: val } : p));

  const deletePerson = (id) => {
    if (people.length <= 1) { alert("Keep at least one person — try renaming it instead."); return; }
    const p = people.find((x) => x.id === id);
    const fallback = people.find((x) => x.id !== id);
    if (!confirm(`Delete "${p.name}"? Any budget items they owned will move to "${fallback.name}".`)) return;
    // Re-assign their budget items to the fallback so nothing becomes orphaned.
    Store.update("budget.sections", (l) => l.map((sec) => ({
      ...sec,
      items: sec.items.map((it) => it.ownerId === id ? { ...it, ownerId: fallback.id } : it),
    })));
    Store.update("people", (l) => l.filter((x) => x.id !== id));
  };

  return (
    <div className="people-mgr">
      {people.map((p) => (
        <div className="person-row" key={p.id}>
          <ColorSwatch color={p.color} onChange={(c) => editPerson(p.id, "color", c)} />
          <input className="person-name" value={p.name} onChange={(e) => editPerson(p.id, "name", e.target.value)} placeholder="Name" aria-label="Person name" />
          <button className="iconbtn person-del" onClick={() => deletePerson(p.id)} disabled={people.length <= 1} aria-label="Delete person" title={people.length <= 1 ? "Need at least one person" : "Delete"}>
            <Icon name="trash" size={13} />
          </button>
        </div>
      ))}
      <button className="addrow" onClick={addPerson} style={{ marginTop: 6 }}>
        <Icon name="plus" size={14} /> Add a person
      </button>
    </div>
  );
}

/* Colour swatch with a popover palette. Hover/focus expands to show options. */
function ColorSwatch({ color, onChange }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="swatch-wrap" ref={ref}>
      <button className="swatch" style={{ background: color }} onClick={() => setOpen((o) => !o)} aria-label="Pick colour" aria-haspopup="menu" aria-expanded={open}></button>
      {open && (
        <div className="swatch-pop" role="menu">
          {PERSON_COLORS.map((c) => (
            <button key={c} className={`swatch ${c === color ? "on" : ""}`} style={{ background: c }} onClick={() => { onChange(c); setOpen(false); }} aria-label={`Colour ${c}`} role="menuitem"></button>
          ))}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { PeopleManager, ColorSwatch, PERSON_COLORS });
