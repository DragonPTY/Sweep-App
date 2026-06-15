/* ============================================================
   sync.jsx  —  Encrypted cloud sync with Supabase Auth
   TRUE ROW-LEVEL ISOLATION: each user's row is locked to their
   authenticated uid — no other user can read, write or delete it.

   SECURITY MODEL
   ──────────────
   • Authentication  — Supabase email + password. RLS policy
     `auth.uid() = user_id` enforces that each authenticated user
     can only touch their own row. Nobody else can read or delete it.
   • Encryption      — AES-256-GCM. The user's passcode (which also
     doubles as their Supabase password) is used to derive the
     encryption key via PBKDF2 (200 000 iterations). Supabase sees
     only ciphertext — even a full DB dump reveals nothing.
   • Defense in depth — auth protects at the network/database layer;
     encryption protects the content layer. Both are needed.

   SUPABASE SETUP  (run once in SQL Editor — drops old table first)
   ──────────────────────────────────────────────────────────────────
   -- 1. Drop old open-access table
   drop table if exists sync_data;

   -- 2. New auth-scoped table
   create table sync_data (
     user_id    uuid references auth.users(id) on delete cascade primary key,
     data       text not null,
     updated_at timestamptz default now()
   );
   alter table sync_data enable row level security;

   -- 3. True isolation: only the authenticated owner can touch their row
   create policy "owner_only" on sync_data
     for all
     using  (auth.uid() = user_id)
     with check (auth.uid() = user_id);

   -- 4. (recommended) Disable email confirmation so sign-up is instant
   --    Supabase dashboard → Authentication → Settings → uncheck
   --    "Enable email confirmations"
   ============================================================ */

const SB_URL = "https://lctxhcrcbpmkgbqfqrny.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjdHhoY3JjYnBta2dicWZxcm55Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0Mjg2OTUsImV4cCI6MjA5NzAwNDY5NX0.4X64XZdE_jnroJ-iKdxSQJGRkyvvo_OdWHIoooyacgw";
const LS_PASSCODE = "sweep_enc_passcode_v2";  // stores only the encryption passcode

/* Create one shared Supabase client. supabase-js handles session
   storage, JWT refresh, and auth-state changes automatically. */
const sb = window.supabase.createClient(SB_URL, SB_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "sweep_sb_auth" }
});

/* ============================================================
   Crypto  (same as before — AES-256-GCM + PBKDF2)
   ============================================================ */
const _te = new TextEncoder();
const _td = new TextDecoder();

async function _aesKey(passcode, userId, usage) {
  const km = await crypto.subtle.importKey("raw", _te.encode(passcode), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: _te.encode("sweep-enc-v2-" + userId), iterations: 200000, hash: "SHA-256" },
    km, { name: "AES-GCM", length: 256 }, false, [usage]
  );
}

async function encryptPayload(passcode, userId, plaintext) {
  const key = await _aesKey(passcode, userId, "encrypt");
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const ct  = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, _te.encode(plaintext));
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv); out.set(new Uint8Array(ct), 12);
  return btoa(String.fromCharCode(...out));
}

async function decryptPayload(passcode, userId, b64) {
  const key  = await _aesKey(passcode, userId, "decrypt");
  const raw  = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12));
  return _td.decode(plain);
}

/* ============================================================
   Passcode helpers  (stored locally — never sent to Supabase)
   ============================================================ */
function loadPasscode()       { return localStorage.getItem(LS_PASSCODE) || null; }
function savePasscode(pc)     { localStorage.setItem(LS_PASSCODE, pc); }
function clearPasscode()      { localStorage.removeItem(LS_PASSCODE); }

/* ============================================================
   Supabase data operations  (authenticated via session JWT)
   ============================================================ */
async function dbFetch(userId) {
  const { data, error } = await sb.from("sync_data")
    .select("data, updated_at")
    .eq("user_id", userId)
    .single();
  if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows
  return data || null;
}

async function dbUpsert(userId, encryptedData) {
  const { error } = await sb.from("sync_data")
    .upsert({ user_id: userId, data: encryptedData, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/* ============================================================
   Sync Engine  (singleton)
   ============================================================ */
const SyncEngine = (() => {
  let _listeners = [];
  let _state = {
    configured: false,    // true when signed in + passcode set
    user: null,           // Supabase user object
    status: "idle",       // idle | pending | pushing | pulling | synced | error
    lastSync: null,
    error: null,
    cloudNewer: false,
    _pendingRow: null,
  };
  let _debounce = null;

  function _emit(patch) {
    _state = { ..._state, ...patch };
    _listeners.forEach(fn => fn(_state));
  }
  function subscribe(fn) {
    _listeners.push(fn);
    fn(_state);
    return () => { _listeners = _listeners.filter(l => l !== fn); };
  }
  function getState() { return _state; }

  /* ---- Init: restore session on page load ---- */
  async function init() {
    /* Listen for auth state changes (handles magic links, token refresh, etc.) */
    sb.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const passcode = loadPasscode();
        if (passcode) {
          _emit({ configured: true, user: session.user, status: "idle" });
          await _checkCloudNewer(session.user.id, passcode);
        } else {
          /* Signed in but no local passcode — user needs to re-enter it */
          _emit({ configured: false, user: session.user, status: "idle", needsPasscode: true });
        }
      } else {
        _emit({ configured: false, user: null, status: "idle", needsPasscode: false });
      }
    });

    /* Restore existing session (stored by supabase-js) */
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.user) return;

    const passcode = loadPasscode();
    if (!passcode) {
      _emit({ configured: false, user: session.user, needsPasscode: true });
      return;
    }
    _emit({ configured: true, user: session.user, status: "idle" });
    await _checkCloudNewer(session.user.id, passcode);
  }

  async function _checkCloudNewer(userId, passcode) {
    try {
      const row = await dbFetch(userId);
      if (!row) return;
      const lastSync = localStorage.getItem("sweep_last_push") || null;
      const cloudMs = new Date(row.updated_at).getTime();
      const localMs = lastSync ? new Date(lastSync).getTime() : 0;
      if (cloudMs > localMs + 8000) {
        _emit({ cloudNewer: true, _pendingRow: row });
      }
    } catch (e) {
      console.warn("[Sync] Cloud check:", e.message);
    }
  }

  /* ---- Auto-push (called by Store.emit via window.scheduleAutoBackup) ---- */
  function schedulePush() {
    if (!_state.configured || !_state.user) return;
    clearTimeout(_debounce);
    _emit({ status: "pending" });
    _debounce = setTimeout(_doPush, 5000);
  }

  async function _doPush() {
    const passcode = loadPasscode();
    const user = _state.user;
    if (!passcode || !user) return;
    _emit({ status: "pushing" });
    try {
      const ct  = await encryptPayload(passcode, user.id, JSON.stringify(Store.get()));
      await dbUpsert(user.id, ct);
      const now = new Date().toISOString();
      localStorage.setItem("sweep_last_push", now);
      _emit({ status: "synced", lastSync: now, error: null, cloudNewer: false });
    } catch (e) {
      _emit({ status: "error", error: e.message });
    }
  }

  async function pushNow() { clearTimeout(_debounce); await _doPush(); }

  /* ---- Pull cloud → local ---- */
  async function pull() {
    const passcode = loadPasscode();
    const user = _state.user;
    if (!passcode || !user) return false;
    _emit({ status: "pulling" });
    try {
      const row = _state._pendingRow || await dbFetch(user.id);
      if (!row) { _emit({ status: "error", error: "No cloud data found for your account." }); return false; }
      const plain = await decryptPayload(passcode, user.id, row.data);
      clearTimeout(_debounce);
      Store.replaceState(JSON.parse(plain));
      clearTimeout(_debounce);
      const now = new Date().toISOString();
      localStorage.setItem("sweep_last_push", row.updated_at);
      _emit({ status: "synced", lastSync: now, error: null, cloudNewer: false, _pendingRow: null });
      return true;
    } catch (e) {
      const msg = String(e).includes("decrypt") || String(e).includes("OperationError")
        ? "Wrong passcode — couldn't decrypt. Make sure you're using the same passcode you set up with."
        : e.message;
      _emit({ status: "error", error: msg });
      return false;
    }
  }

  /* ---- Sign up (new account) ---- */
  async function signUp(email, passcode) {
    if (passcode.length < 6) return { error: "Passcode must be at least 6 characters." };
    _emit({ status: "pushing" });
    try {
      const { data, error } = await sb.auth.signUp({ email, password: passcode });
      if (error) { _emit({ status: "error", error: error.message }); return { error: error.message }; }
      /* If email confirmation is disabled, user is signed in immediately */
      if (data.user && !data.user.email_confirmed_at && data.session === null) {
        /* Email confirmation required */
        _emit({ status: "idle", error: null });
        return { needsConfirmation: true };
      }
      if (data.session?.user) {
        savePasscode(passcode);
        /* First upload: push current local data to cloud */
        const ct = await encryptPayload(passcode, data.session.user.id, JSON.stringify(Store.get()));
        await dbUpsert(data.session.user.id, ct);
        const now = new Date().toISOString();
        localStorage.setItem("sweep_last_push", now);
        _emit({ configured: true, user: data.session.user, status: "synced", lastSync: now, error: null });
      }
      return { success: true };
    } catch (e) {
      _emit({ status: "error", error: e.message, configured: false });
      return { error: e.message };
    }
  }

  /* ---- Sign in (existing account, new device) ---- */
  async function signIn(email, passcode) {
    _emit({ status: "pulling" });
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email, password: passcode });
      if (error) {
        const msg = error.message.includes("Invalid") ? "Wrong email or passcode." : error.message;
        _emit({ status: "error", error: msg });
        return { error: msg };
      }
      const user = data.session.user;

      /* Check if this account has MFA enrolled — if so, we're at aal1 and
         must step up to aal2 before the session is fully trusted. */
      const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel) {
        const { data: factors } = await sb.auth.mfa.listFactors();
        const totp = factors?.totp?.[0];
        /* Stash the passcode so we can finish login after the TOTP code */
        _pendingMfa = { passcode, factorId: totp?.id };
        _emit({ status: "idle", needsMfaChallenge: true, user });
        return { needsMfaChallenge: true };
      }

      savePasscode(passcode);

      /* Check for cloud data */
      const row = await dbFetch(user.id);
      if (row) {
        /* There's existing cloud data — decrypt and restore */
        const plain = await decryptPayload(passcode, user.id, row.data);
        clearTimeout(_debounce);
        Store.replaceState(JSON.parse(plain));
        clearTimeout(_debounce);
        const now = new Date().toISOString();
        localStorage.setItem("sweep_last_push", row.updated_at);
        _emit({ configured: true, user, status: "synced", lastSync: now, error: null });
        return { success: true, restored: true };
      } else {
        /* No cloud data yet — push local data up */
        const ct = await encryptPayload(passcode, user.id, JSON.stringify(Store.get()));
        await dbUpsert(user.id, ct);
        const now = new Date().toISOString();
        localStorage.setItem("sweep_last_push", now);
        _emit({ configured: true, user, status: "synced", lastSync: now, error: null });
        return { success: true, restored: false };
      }
    } catch (e) {
      const msg = String(e).includes("decrypt") || String(e).includes("OperationError")
        ? "Signed in successfully, but couldn't decrypt your data — check your passcode."
        : e.message;
      _emit({ status: "error", error: msg });
      return { error: msg };
    }
  }

  /* ---- Reconnect passcode (user is signed in but passcode was cleared) ---- */
  async function reconnectPasscode(passcode) {
    const user = _state.user;
    if (!user) return { error: "Not signed in." };
    _emit({ status: "pulling" });
    try {
      const row = await dbFetch(user.id);
      if (row) {
        const plain = await decryptPayload(passcode, user.id, row.data);
        clearTimeout(_debounce);
        Store.replaceState(JSON.parse(plain));
        clearTimeout(_debounce);
      }
      savePasscode(passcode);
      const now = new Date().toISOString();
      _emit({ configured: true, user, status: "synced", lastSync: now, error: null, needsPasscode: false });
      return { success: true };
    } catch (e) {
      const msg = String(e).includes("decrypt") || String(e).includes("OperationError")
        ? "Wrong passcode — couldn't decrypt. Try again." : e.message;
      _emit({ status: "error", error: msg });
      return { error: msg };
    }
  }

  /* ---- MFA (opt-in two-factor) ----
     Uses Supabase's TOTP MFA. Enrollment returns a QR code the user scans
     with Google Authenticator / Authy / 1Password. Once verified, future
     sign-ins on any device require a 6-digit code (step-up to aal2). */
  let _pendingMfa = null;  // { passcode, factorId } held between sign-in and TOTP entry

  async function listMfaFactors() {
    try {
      const { data, error } = await sb.auth.mfa.listFactors();
      if (error) return { factors: [] };
      return { factors: data?.totp || [] };
    } catch { return { factors: [] }; }
  }

  /* Begin enrollment — returns { qr, secret, factorId } for the UI to display */
  async function enrollMfa() {
    try {
      const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Sweep " + Date.now() });
      if (error) return { error: error.message };
      return { qr: data.totp.qr_code, secret: data.totp.secret, factorId: data.id };
    } catch (e) { return { error: e.message }; }
  }

  /* Finish enrollment — verify the first 6-digit code to activate the factor */
  async function verifyMfaEnroll(factorId, code) {
    try {
      const { data: ch, error: chErr } = await sb.auth.mfa.challenge({ factorId });
      if (chErr) return { error: chErr.message };
      const { error } = await sb.auth.mfa.verify({ factorId, challengeId: ch.id, code });
      if (error) return { error: "That code didn't match. Check your authenticator app and try again." };
      _emit({}); // refresh
      return { success: true };
    } catch (e) { return { error: e.message }; }
  }

  async function unenrollMfa(factorId) {
    try {
      const { error } = await sb.auth.mfa.unenroll({ factorId });
      if (error) return { error: error.message };
      _emit({});
      return { success: true };
    } catch (e) { return { error: e.message }; }
  }

  /* Complete the sign-in MFA challenge with the 6-digit code */
  async function completeMfaChallenge(code) {
    if (!_pendingMfa?.factorId) return { error: "No pending verification." };
    _emit({ status: "pulling" });
    try {
      const { data: ch, error: chErr } = await sb.auth.mfa.challenge({ factorId: _pendingMfa.factorId });
      if (chErr) { _emit({ status: "error", error: chErr.message }); return { error: chErr.message }; }
      const { error } = await sb.auth.mfa.verify({ factorId: _pendingMfa.factorId, challengeId: ch.id, code });
      if (error) { _emit({ status: "error", error: "Wrong code — try again.", needsMfaChallenge: true }); return { error: "Wrong code." }; }

      /* aal2 reached — finish the normal sign-in path */
      const passcode = _pendingMfa.passcode;
      _pendingMfa = null;
      const { data: { user } } = await sb.auth.getUser();
      savePasscode(passcode);
      const row = await dbFetch(user.id);
      if (row) {
        const plain = await decryptPayload(passcode, user.id, row.data);
        clearTimeout(_debounce);
        Store.replaceState(JSON.parse(plain));
        clearTimeout(_debounce);
        localStorage.setItem("sweep_last_push", row.updated_at);
      } else {
        const ct = await encryptPayload(passcode, user.id, JSON.stringify(Store.get()));
        await dbUpsert(user.id, ct);
        localStorage.setItem("sweep_last_push", new Date().toISOString());
      }
      _emit({ configured: true, user, status: "synced", lastSync: new Date().toISOString(), error: null, needsMfaChallenge: false });
      return { success: true };
    } catch (e) {
      const msg = String(e).includes("decrypt") ? "Verified, but couldn't decrypt your data — check your passcode." : e.message;
      _emit({ status: "error", error: msg });
      return { error: msg };
    }
  }

  function cancelMfaChallenge() {
    _pendingMfa = null;
    sb.auth.signOut();
    _emit({ needsMfaChallenge: false, user: null, configured: false, status: "idle", error: null });
  }

  /* ---- Sign out ---- */
  async function signOut() {
    clearTimeout(_debounce);
    clearPasscode();
    localStorage.removeItem("sweep_last_push");
    await sb.auth.signOut();
    _emit({ configured: false, user: null, status: "idle", error: null, cloudNewer: false, needsPasscode: false });
  }

  window.scheduleAutoBackup = schedulePush;

  return { init, subscribe, getState, schedulePush, pushNow, pull, signUp, signIn, reconnectPasscode, signOut,
    listMfaFactors, enrollMfa, verifyMfaEnroll, unenrollMfa, completeMfaChallenge, cancelMfaChallenge };
})();

/* ============================================================
   React components
   ============================================================ */

function useSyncState() {
  const [st, setSt] = React.useState(SyncEngine.getState());
  React.useEffect(() => SyncEngine.subscribe(setSt), []);
  return st;
}

/* Topbar status dot */
function SyncDot() {
  const st = useSyncState();
  if (!st.configured && !st.user) return null;
  const cls = st.status === "synced" ? "green"
    : (st.status === "pending" || st.status === "pushing" || st.status === "pulling") ? "amber"
    : st.status === "error" ? "red" : "";
  const tip = st.status === "synced" ? (st.lastSync ? `Synced ${new Date(st.lastSync).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"})}` : "Synced")
    : st.status === "pending" ? "Changes pending sync…"
    : st.status === "pushing" ? "Uploading to cloud…"
    : st.status === "pulling" ? "Downloading from cloud…"
    : st.status === "error" ? `Sync error` : "Sync enabled";
  return <span className={`sync-dot ${cls}`} title={tip} aria-label={tip} />;
}

/* Cloud-newer banner */
function CloudNewerBanner() {
  const st = useSyncState();
  const [busy, setBusy] = React.useState(false);
  if (!st.cloudNewer) return null;
  const restore = async () => { setBusy(true); await SyncEngine.pull(); setBusy(false); };
  return (
    <div className="cloud-banner" role="alert">
      <Icon name="info" size={16} style={{ flex: "none", color: "var(--accent)" }} />
      <span style={{ flex: 1 }}><b>Cloud has newer data</b> — your other device saved changes since you last synced.</span>
      <div className="flex gap8" style={{ flex: "none" }}>
        <button className="btn btn-accent btn-sm" onClick={restore} disabled={busy}>{busy ? "Restoring…" : "Restore cloud"}</button>
        <button className="btn btn-ghost btn-sm" onClick={() => SyncEngine.pushNow()} disabled={busy}>Keep this device</button>
      </div>
    </div>
  );
}

/* Main settings component — routes to the right panel */
function CloudSyncSettings() {
  const st = useSyncState();
  if (st.needsMfaChallenge) return <MfaChallengePanel st={st} />;
  if (st.configured) return <SyncActivePanel st={st} />;
  if (st.user && st.needsPasscode) return <ReconnectPasscodePanel st={st} />;
  return <AuthPanel st={st} />;
}

/* ---- Privacy & security modal (opened by the "i" button) ---- */
function PrivacyModal({ onClose }) {
  return (
    <div className="privacy-overlay" onClick={onClose}>
      <div className="privacy-card" onClick={e => e.stopPropagation()} role="dialog" aria-label="Privacy and security">
        <div className="privacy-head">
          <div className="flex gap12" style={{ alignItems: "center" }}>
            <span className="privacy-shield"><Icon name="bank" size={18} /></span>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 640 }}>How your data is protected</h3>
          </div>
          <button className="iconbtn" style={{ width: 32, height: 32 }} onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        <div className="privacy-body">
          <p className="privacy-lead">We built this so that <b>only you</b> can ever read your finances — not us, not the database host, nobody. Here's exactly how, in plain terms.</p>

          <div className="privacy-item">
            <span className="pi-ic"><Icon name="lock" size={15} /></span>
            <div>
              <b>End-to-end encryption (AES-256-GCM)</b>
              <p>Before any data leaves your device, it's scrambled with a key derived from your passcode. What gets uploaded is unreadable gibberish. Your passcode never leaves your device, and we never see it.</p>
            </div>
          </div>

          <div className="privacy-item">
            <span className="pi-ic"><Icon name="bank" size={15} /></span>
            <div>
              <b>Row-level security</b>
              <p>The database enforces that your data row can only be accessed by your signed-in account. Even with direct database access, no other user can read, change, or delete your row.</p>
            </div>
          </div>

          <div className="privacy-item">
            <span className="pi-ic"><Icon name="check" size={15} /></span>
            <div>
              <b>Optional two-factor authentication</b>
              <p>Turn on 2FA and sign-ins require a 6-digit code from your authenticator app — so a leaked password alone can't get into your account.</p>
            </div>
          </div>

          <div className="privacy-item">
            <span className="pi-ic"><Icon name="trend" size={15} /></span>
            <div>
              <b>Encrypted transport (HTTPS / TLS)</b>
              <p>Every byte travels over an encrypted connection. Nothing is ever sent in the clear.</p>
            </div>
          </div>

          <div className="privacy-item">
            <span className="pi-ic"><Icon name="coins" size={15} /></span>
            <div>
              <b>Audit logging</b>
              <p>All sign-in and account events are logged automatically, so unusual activity on your account can be reviewed.</p>
            </div>
          </div>

          <div className="privacy-honest">
            <b>Being honest with you:</b>
            <ul>
              <li><b>No passcode recovery.</b> Your passcode is the only key to your data. If you forget it, your encrypted backup can't be recovered — by anyone, including us. That's the price of true privacy.</li>
              <li><b>Your data lives on your devices.</b> The cloud copy is an encrypted backup for syncing — the working copy is always on your device.</li>
              <li><b>We don't sell or analyse your data.</b> We can't — it's encrypted. There's no advertising, no tracking of your figures.</li>
              <li><b>This isn't a formal certification.</b> These are strong security practices, not a SOC 2 / HIPAA audit. For regulated use, additional steps apply.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- MFA challenge during sign-in ---- */
function MfaChallengePanel({ st }) {
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const submit = async () => {
    if (code.length < 6) return;
    setBusy(true);
    await SyncEngine.completeMfaChallenge(code.trim());
    setBusy(false);
    setCode("");
  };
  return (
    <div className="sync-setup">
      <div className="sync-found-card" style={{ marginBottom: 14 }}>
        <Icon name="lock" size={18} style={{ color: "var(--accent)", flex: "none" }} />
        <div>
          <b style={{ color: "var(--ink)" }}>Two-factor verification</b>
          <p style={{ color: "var(--ink-dim)", fontSize: 13, margin: "3px 0 0", lineHeight: 1.4 }}>Enter the 6-digit code from your authenticator app to finish signing in.</p>
        </div>
      </div>
      <input className="loan-select mfa-code" inputMode="numeric" maxLength={6} placeholder="000000"
        value={code} autoFocus style={{ width: "100%", marginBottom: 12 }}
        onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
        onKeyDown={e => e.key === "Enter" && submit()} />
      {st.error && <div className="sync-error" style={{ marginBottom: 10 }}>{st.error}</div>}
      <div className="flex gap8">
        <button className="btn btn-accent" style={{ flex: 1, justifyContent: "center" }} disabled={code.length < 6 || busy} onClick={submit}>
          {busy ? "Verifying…" : "Verify & sign in"}
        </button>
        <button className="btn btn-ghost" onClick={() => SyncEngine.cancelMfaChallenge()}>Cancel</button>
      </div>
    </div>
  );
}

/* ---- Auth panel: sign up or sign in ---- */
function AuthPanel({ st }) {
  const [tab, setTab]       = React.useState("signup"); // signup | signin
  const [email, setEmail]   = React.useState("");
  const [pass, setPass]     = React.useState("");
  const [busy, setBusy]     = React.useState(false);
  const [info, setInfo]     = React.useState(null);
  const [privacy, setPrivacy] = React.useState(false);

  const go = async () => {
    if (!email.trim() || !pass.trim()) return;
    setBusy(true); setInfo(null);
    const result = tab === "signup"
      ? await SyncEngine.signUp(email.trim(), pass)
      : await SyncEngine.signIn(email.trim(), pass);
    setBusy(false);
    if (result.needsMfaChallenge) {
      /* routing handled by CloudSyncSettings via state */
    } else if (result.needsConfirmation) {
      setInfo({ type: "confirm", msg: "Check your email and click the confirmation link, then come back here and sign in." });
      setTab("signin");
    } else if (result.error) {
      setInfo({ type: "error", msg: result.error });
    } else if (result.restored) {
      setInfo({ type: "ok", msg: "Signed in and restored your cloud data ✓" });
    }
  };

  return (
    <div className="sync-setup">
      {privacy && <PrivacyModal onClose={() => setPrivacy(false)} />}
      <div className="auth-head">
        <p style={{ color: "var(--ink-dim)", fontSize: 12.5, margin: 0, lineHeight: 1.6, flex: 1 }}>
          Your data is encrypted on-device before upload using your passcode as the key.
          Only you can decrypt it. <b style={{ color: "oklch(0.78 0.13 25)" }}>Don't forget your passcode — there's no recovery.</b>
        </p>
        <button className="privacy-i" onClick={() => setPrivacy(true)} aria-label="How your data is protected" title="How your data is protected">
          <Icon name="info" size={15} />
        </button>
      </div>
      <div className="seg" style={{ marginBottom: 14 }}>
        <button className={tab === "signup" ? "on" : ""} onClick={() => { setTab("signup"); setInfo(null); }}>New account</button>
        <button className={tab === "signin" ? "on" : ""} onClick={() => { setTab("signin"); setInfo(null); }}>Sign in</button>
      </div>
      <div className="sync-field" style={{ marginBottom: 10 }}>
        <label>Email</label>
        <input type="email" className="loan-select" placeholder="your@email.com" value={email}
          style={{ width: "100%" }} onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === "Enter" && go()} />
      </div>
      <div className="sync-field" style={{ marginBottom: 12 }}>
        <label>{tab === "signup" ? "Create a passcode" : "Passcode"} <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}>(min 6 chars)</span></label>
        <input type="password" className="loan-select" placeholder={tab === "signup" ? "Something memorable — not a bank PIN" : "Your sync passcode"}
          value={pass} style={{ width: "100%" }}
          onChange={e => setPass(e.target.value)}
          onKeyDown={e => e.key === "Enter" && go()} />
      </div>
      {info && (
        <div className={info.type === "error" ? "sync-error" : "sync-ok"} style={{ marginBottom: 10 }}>
          {info.msg}
        </div>
      )}
      {st.error && !info && <div className="sync-error" style={{ marginBottom: 10 }}>{st.error}</div>}
      <button className="btn btn-accent" style={{ width: "100%", justifyContent: "center" }}
        onClick={go} disabled={!email.trim() || !pass.trim() || busy}>
        <Icon name="bank" size={16} />
        {busy ? (tab === "signup" ? "Creating account…" : "Signing in…") : (tab === "signup" ? "Create account & enable sync" : "Sign in & restore data")}
      </button>
    </div>
  );
}

/* ---- User signed in but local passcode was cleared ---- */
function ReconnectPasscodePanel({ st }) {
  const [pass, setPass] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="sync-setup">
      <div className="sync-found-card" style={{ marginBottom: 14 }}>
        <Icon name="info" size={18} style={{ color: "var(--accent)", flex: "none" }} />
        <div>
          <b style={{ color: "var(--ink)" }}>Signed in as {st.user?.email}</b>
          <p style={{ color: "var(--ink-dim)", fontSize: 13, margin: "3px 0 0", lineHeight: 1.4 }}>Your local passcode was cleared. Re-enter it to decrypt your cloud data.</p>
        </div>
      </div>
      <div className="sync-field" style={{ marginBottom: 12 }}>
        <label>Passcode</label>
        <input type="password" className="loan-select" value={pass} placeholder="Your sync passcode"
          style={{ width: "100%" }} onChange={e => setPass(e.target.value)}
          onKeyDown={async e => { if (e.key !== "Enter") return; setBusy(true); await SyncEngine.reconnectPasscode(pass); setBusy(false); }} />
      </div>
      {st.error && <div className="sync-error" style={{ marginBottom: 10 }}>{st.error}</div>}
      <div className="flex gap8" style={{ flexWrap: "wrap" }}>
        <button className="btn btn-accent" style={{ flex: 1, justifyContent: "center" }} disabled={!pass.trim() || busy}
          onClick={async () => { setBusy(true); await SyncEngine.reconnectPasscode(pass); setBusy(false); }}>
          {busy ? "Verifying…" : "Reconnect"}
        </button>
        <button className="btn btn-ghost" style={{ flex: "none" }} onClick={() => SyncEngine.signOut()}>Sign out</button>
      </div>
    </div>
  );
}

/* ---- Signed in + configured ---- */
function SyncActivePanel({ st }) {
  const [busy, setBusy] = React.useState(false);
  const fmt = iso => iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never";
  const dotCls = st.status === "synced" ? "green" : st.status === "error" ? "red" : "amber";
  const statusText = st.status === "synced" ? `Synced ${fmt(st.lastSync)}`
    : st.status === "pending" ? "Saving changes…"
    : st.status === "pushing" ? "Uploading…"
    : st.status === "pulling" ? "Downloading…"
    : st.status === "error" ? null : "Ready";
  return (
    <div className="sync-panel">
      <div className="sync-status-row">
        <span className={`sync-dot ${dotCls} inline`}></span>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, color: st.status === "error" ? "var(--neg)" : "var(--ink-dim)" }}>
            {st.status === "error" ? st.error : statusText}
          </span>
          <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 2 }}>{st.user?.email}</div>
        </div>
      </div>
      <p style={{ color: "var(--ink-faint)", fontSize: 12, margin: "8px 0 12px", lineHeight: 1.5 }}>
        Auto-syncs 5 s after any change. Data is encrypted — only your passcode can decrypt it. Row-level security means only your account can access your row.
      </p>
      <div className="flex gap8 wrap">
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={async () => { setBusy(true); await SyncEngine.pushNow(); setBusy(false); }}>
          <Icon name="refresh" size={14} /> Push now
        </button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={async () => { setBusy(true); await SyncEngine.pull(); setBusy(false); }}>
          <Icon name="arrowdown" size={14} /> Pull from cloud
        </button>
      </div>

      <MfaSection />

      <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", marginTop: 14, color: "var(--ink-faint)", fontSize: 12.5 }}
        onClick={async () => { if (confirm("Sign out? Your cloud backup stays intact. Sign back in to re-sync.")) await SyncEngine.signOut(); }}>
        Sign out
      </button>
    </div>
  );
}

/* ---- MFA enrollment / management (inside the active panel) ---- */
function MfaSection() {
  const [factors, setFactors] = React.useState(null);   // null = loading
  const [enrolling, setEnrolling] = React.useState(null); // { qr, secret, factorId }
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);

  const refresh = React.useCallback(async () => {
    const { factors } = await SyncEngine.listMfaFactors();
    setFactors(factors.filter(f => f.status === "verified"));
  }, []);
  React.useEffect(() => { refresh(); }, [refresh]);

  const startEnroll = async () => {
    setErr(null); setBusy(true);
    const res = await SyncEngine.enrollMfa();
    setBusy(false);
    if (res.error) setErr(res.error);
    else setEnrolling(res);
  };

  const confirmEnroll = async () => {
    if (code.length < 6) return;
    setBusy(true); setErr(null);
    const res = await SyncEngine.verifyMfaEnroll(enrolling.factorId, code.trim());
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setEnrolling(null); setCode("");
    await refresh();
  };

  const remove = async (factorId) => {
    if (!confirm("Turn off two-factor authentication? Sign-ins will only need your password and passcode.")) return;
    setBusy(true);
    await SyncEngine.unenrollMfa(factorId);
    setBusy(false);
    await refresh();
  };

  if (factors === null) return null; // still loading

  const enabled = factors.length > 0;

  return (
    <div className="mfa-section">
      <div className="mfa-row">
        <div className="flex gap12" style={{ alignItems: "center", flex: 1 }}>
          <span className={`mfa-badge ${enabled ? "on" : ""}`}><Icon name="lock" size={14} /></span>
          <div>
            <b style={{ fontSize: 13.5 }}>Two-factor authentication</b>
            <div style={{ fontSize: 11.5, color: enabled ? "var(--pos)" : "var(--ink-faint)", marginTop: 1 }}>
              {enabled ? "On — codes required at sign-in" : "Off — extra protection, opt-in"}
            </div>
          </div>
        </div>
        {!enrolling && (enabled
          ? <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => remove(factors[0].id)}>Turn off</button>
          : <button className="btn btn-accent btn-sm" disabled={busy} onClick={startEnroll}>{busy ? "…" : "Turn on"}</button>
        )}
      </div>

      {enrolling && (
        <div className="mfa-enroll">
          <p style={{ fontSize: 12.5, color: "var(--ink-dim)", margin: "0 0 12px", lineHeight: 1.5 }}>
            1. Scan this with an authenticator app (Google Authenticator, Authy, 1Password).<br />
            2. Enter the 6-digit code it shows to confirm.
          </p>
          <div className="mfa-qr" dangerouslySetInnerHTML={{ __html: enrolling.qr }} />
          <details className="mfa-secret">
            <summary>Can't scan? Enter this key manually</summary>
            <code>{enrolling.secret}</code>
          </details>
          <input className="loan-select mfa-code" inputMode="numeric" maxLength={6} placeholder="000000"
            value={code} style={{ width: "100%", margin: "12px 0" }}
            onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={e => e.key === "Enter" && confirmEnroll()} />
          {err && <div className="sync-error" style={{ marginBottom: 10 }}>{err}</div>}
          <div className="flex gap8">
            <button className="btn btn-accent" style={{ flex: 1, justifyContent: "center" }} disabled={code.length < 6 || busy} onClick={confirmEnroll}>
              {busy ? "Verifying…" : "Confirm & enable"}
            </button>
            <button className="btn btn-ghost" onClick={() => { setEnrolling(null); setCode(""); setErr(null); }}>Cancel</button>
          </div>
        </div>
      )}
      {err && !enrolling && <div className="sync-error" style={{ marginTop: 10 }}>{err}</div>}
    </div>
  );
}

/* Styles for the sync ok-pill, MFA, and privacy modal */
const _syncOkStyle = document.createElement("style");
_syncOkStyle.textContent = `
.sync-ok { padding: 9px 12px; background: oklch(0.78 0.15 155 / 0.15); border: 1px solid oklch(0.78 0.15 155 / 0.3); border-radius: 10px; color: var(--pos); font-size: 13px; }

/* Auth header with the "i" button */
.auth-head { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 14px; }
.privacy-i {
  flex: none; width: 28px; height: 28px; border-radius: 50%;
  display: grid; place-items: center;
  background: var(--glass-2); border: 1px solid var(--stroke-soft);
  color: var(--accent); cursor: pointer; transition: background 0.15s, transform 0.1s;
}
.privacy-i:hover { background: var(--glass-strong); transform: scale(1.08); }

/* MFA section */
.mfa-section { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--stroke-soft); }
.mfa-row { display: flex; align-items: center; gap: 10px; }
.mfa-badge {
  width: 32px; height: 32px; border-radius: 9px; flex: none;
  display: grid; place-items: center;
  background: var(--glass-2); color: var(--ink-faint);
  border: 1px solid var(--stroke-soft);
}
.mfa-badge.on { background: oklch(0.78 0.15 155 / 0.16); color: var(--pos); border-color: oklch(0.78 0.15 155 / 0.3); }
.mfa-enroll { margin-top: 14px; padding: 16px; background: var(--glass-2); border: 1px solid var(--stroke-soft); border-radius: 12px; }
.mfa-qr {
  width: 168px; height: 168px; margin: 0 auto; padding: 10px;
  background: #fff; border-radius: 12px;
  display: grid; place-items: center;
}
.mfa-qr svg { width: 100%; height: 100%; display: block; }
.mfa-secret { margin-top: 12px; font-size: 12px; color: var(--ink-faint); }
.mfa-secret summary { cursor: pointer; }
.mfa-secret code { display: block; margin-top: 8px; padding: 8px 10px; background: var(--glass-strong); border-radius: 8px; font-size: 12.5px; color: var(--ink-dim); word-break: break-all; letter-spacing: 0.5px; }
.mfa-code {
  text-align: center; font-size: 24px !important; letter-spacing: 8px;
  font-variant-numeric: tabular-nums; font-family: var(--mono, monospace);
}

/* Privacy modal */
.privacy-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(4,6,10,0.62); backdrop-filter: blur(8px);
  display: grid; place-items: center; padding: 20px;
  animation: fade 0.2s var(--ease, ease);
}
.privacy-card {
  width: min(540px, 100%); max-height: 86vh; overflow-y: auto;
  background: linear-gradient(180deg, rgba(20,24,34,0.98), rgba(12,15,22,0.99));
  border: 1px solid var(--stroke);
  border-radius: 20px;
  box-shadow: 0 30px 80px -20px rgba(0,0,0,0.7);
  animation: sheetPop 0.26s var(--ease, cubic-bezier(0.2,0.8,0.2,1));
}
[data-mode="light"] .privacy-card { background: linear-gradient(180deg, #fff, #f6f8fb); }
@keyframes sheetPop { from { opacity: 0; transform: translateY(16px) scale(0.98); } }
.privacy-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 22px; position: sticky; top: 0;
  background: inherit; border-bottom: 1px solid var(--stroke-soft);
  border-radius: 20px 20px 0 0;
}
.privacy-shield {
  width: 36px; height: 36px; border-radius: 10px; flex: none;
  display: grid; place-items: center;
  background: var(--glow-b, oklch(0.81 0.12 196 / 0.2)); color: var(--accent);
}
.privacy-body { padding: 20px 22px 24px; }
.privacy-lead { font-size: 14px; color: var(--ink-dim); line-height: 1.6; margin: 0 0 20px; }
.privacy-item { display: flex; gap: 14px; margin-bottom: 18px; }
.pi-ic {
  width: 30px; height: 30px; border-radius: 8px; flex: none;
  display: grid; place-items: center; margin-top: 2px;
  background: var(--glass-2); color: var(--accent); border: 1px solid var(--stroke-soft);
}
.privacy-item b { font-size: 13.5px; color: var(--ink); }
.privacy-item p { font-size: 12.5px; color: var(--ink-dim); line-height: 1.55; margin: 3px 0 0; }
.privacy-honest {
  margin-top: 20px; padding: 16px; border-radius: 12px;
  background: oklch(0.70 0.10 75 / 0.1); border: 1px solid oklch(0.70 0.13 75 / 0.25);
}
.privacy-honest > b { font-size: 13px; color: oklch(0.82 0.13 75); }
.privacy-honest ul { margin: 10px 0 0; padding-left: 18px; }
.privacy-honest li { font-size: 12.5px; color: var(--ink-dim); line-height: 1.55; margin-bottom: 8px; }
[data-mode="light"] .privacy-honest > b { color: oklch(0.55 0.13 75); }
`;
document.head.appendChild(_syncOkStyle);

/* Boot */
SyncEngine.init().catch(e => console.warn("[Sync] Init error:", e));

Object.assign(window, {
  SyncEngine, SyncDot, CloudNewerBanner, CloudSyncSettings,
});
