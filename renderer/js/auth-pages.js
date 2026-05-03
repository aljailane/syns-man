/* ─── Setup / Login Page Templates ─────────────────────────────────── */

let _authSettingsBound = false;

function getAuthAppVersion() {
  return (window.syns && window.syns.appVersion) || "1.0.0";
}

function authLogoHTML() {
  return `
    <svg width="42" height="42" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M24 4L38 10V22C38 32.5 31.5 40.3 24 44C16.5 40.3 10 32.5 10 22V10L24 4Z" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>
      <rect x="16" y="19" width="16" height="12" rx="3" stroke="currentColor" stroke-width="2.2"/>
      <path d="M20 19V16.6C20 14.4 21.8 12.6 24 12.6C26.2 12.6 28 14.4 28 16.6V19" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="24" cy="25" r="1.5" fill="currentColor"/>
    </svg>
  `;
}

function authSettingsIconHTML() {
  return `
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M3 6.75C3 6.34 3.34 6 3.75 6H12.25C12.66 6 13 6.34 13 6.75C13 7.16 12.66 7.5 12.25 7.5H3.75C3.34 7.5 3 7.16 3 6.75ZM16.5 5A1.75 1.75 0 1 0 16.5 8.5A1.75 1.75 0 0 0 16.5 5ZM10.25 11C10.66 11 11 11.34 11 11.75C11 12.16 10.66 12.5 10.25 12.5H3.75C3.34 12.5 3 12.16 3 11.75C3 11.34 3.34 11 3.75 11H10.25ZM14.5 10A1.75 1.75 0 1 0 14.5 13.5A1.75 1.75 0 0 0 14.5 10ZM3.75 16C3.34 16 3 16.34 3 16.75C3 17.16 3.34 17.5 3.75 17.5H14.25C14.66 17.5 15 17.16 15 16.75C15 16.34 14.66 16 14.25 16H3.75ZM18.5 15A1.75 1.75 0 1 0 18.5 18.5A1.75 1.75 0 0 0 18.5 15Z" fill="currentColor"/>
    </svg>
  `;
}

function authSettingsModalHTML() {
  return `
  <div class="modal-overlay" id="auth-settings-modal">
    <div class="modal" style="width:560px;max-width:96vw;">
      <div class="modal-header">
        <span class="modal-title">Settings</span>
        <button class="modal-close" id="auth-settings-close">✕</button>
      </div>

      <div id="auth-settings-alert"></div>

      <div class="form-group">
        <label class="form-label">Theme</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-ghost" id="auth-stg-theme-dark"   style="min-width:90px;justify-content:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:#6366f1;display:inline-block;flex-shrink:0;"></span>Dark</button>
          <button type="button" class="btn btn-ghost" id="auth-stg-theme-light"  style="min-width:90px;justify-content:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:#94a3b8;display:inline-block;flex-shrink:0;"></span>Light</button>
          <button type="button" class="btn btn-ghost" id="auth-stg-theme-ocean"  style="min-width:90px;justify-content:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:#06b6d4;display:inline-block;flex-shrink:0;"></span>Ocean</button>
          <button type="button" class="btn btn-ghost" id="auth-stg-theme-forest" style="min-width:90px;justify-content:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:#22c55e;display:inline-block;flex-shrink:0;"></span>Forest</button>
          <button type="button" class="btn btn-ghost" id="auth-stg-theme-violet" style="min-width:90px;justify-content:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:#a855f7;display:inline-block;flex-shrink:0;"></span>Violet</button>
          <button type="button" class="btn btn-ghost" id="auth-stg-theme-rose"   style="min-width:90px;justify-content:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:#f43f5e;display:inline-block;flex-shrink:0;"></span>Rose</button>
        </div>
      </div>

      <div style="margin:8px 0 14px;height:1px;background:var(--border);"></div>

      <div class="form-group" style="margin-bottom:10px;">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;">
          <input type="checkbox" id="auth-stg-proxy-enabled"/>
          <span style="font-size:13px;color:var(--text);font-weight:600;">Enable Proxy</span>
        </label>
      </div>

      <div id="auth-proxy-fields">
        <div class="form-group">
          <label class="form-label">Proxy Type</label>
          <select class="form-input" id="auth-stg-proxy-type">
            <option value="socks5">SOCKS5</option>
            <option value="socks4">SOCKS4</option>
            <option value="http">HTTP CONNECT</option>
          </select>
        </div>

        <div style="display:grid;grid-template-columns:1fr 120px;gap:10px;">
          <div class="form-group">
            <label class="form-label">Host</label>
            <input class="form-input" id="auth-stg-proxy-host" placeholder="127.0.0.1"/>
          </div>
          <div class="form-group">
            <label class="form-label">Port</label>
            <input class="form-input" id="auth-stg-proxy-port" type="number" min="1" max="65535" placeholder="1080"/>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group">
            <label class="form-label">Username</label>
            <input class="form-input" id="auth-stg-proxy-username" placeholder="optional"/>
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input class="form-input" id="auth-stg-proxy-password" type="password" placeholder="optional"/>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <span id="auth-stg-test-result" style="margin-right:auto;font-size:12px;color:var(--text2);"></span>
        <button type="button" class="btn btn-ghost" id="auth-stg-test-btn">Test Proxy</button>
        <button type="button" class="btn btn-primary" id="auth-stg-save-btn">Save</button>
      </div>
    </div>
  </div>`;
}

function setupPageHTML() {
  const appVer = getAuthAppVersion();
  return `
  <div class="auth-wrap">
    <div class="auth-top-meta">
      <span class="auth-version">SYNS Man v${appVer}</span>
    </div>
    <div style="position:fixed;top:12px;right:12px;">
      <div class="win-controls">
        <button class="win-btn min"   id="auth-win-min"></button>
        <button class="win-btn max"   id="auth-win-max"></button>
        <button class="win-btn close" id="auth-win-close"></button>
      </div>
    </div>
    <button id="auth-settings-btn" title="Settings" style="position:fixed;left:14px;bottom:14px;width:52px;height:52px;border:none;background:transparent;color:var(--text);cursor:pointer;z-index:6;display:inline-flex;align-items:center;justify-content:center;opacity:.95;">
      ${authSettingsIconHTML()}
    </button>
    <div class="auth-card">
      <div class="auth-logo">
        <div class="logo-icon">${authLogoHTML()}</div>
        <h1>SYNS Man</h1>
        <p>SSH / SFTP Manager</p>
      </div>
      <h2>Create Admin Account</h2>
      <p class="sub">This account will be used to manage your servers.</p>
      <div id="setup-alert"></div>
      <form id="setup-form">
        <div class="form-group">
          <label class="form-label">Username</label>
          <input class="form-input" id="setup-username" placeholder="admin" autocomplete="off" required/>
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input class="form-input" id="setup-password" type="password" placeholder="••••••••" required/>
          <div class="strength-bar"><div class="strength-fill" id="strength-fill" style="width:0;"></div></div>
        </div>
        <div class="form-group">
          <label class="form-label">Confirm Password</label>
          <input class="form-input" id="setup-confirm" type="password" placeholder="••••••••" required/>
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:8px;" id="setup-btn">
          Create Account
        </button>
      </form>
    </div>
    ${authSettingsModalHTML()}
  </div>`;
}

function loginPageHTML() {
  const appVer = getAuthAppVersion();
  let savedUsername = "";
  try { savedUsername = localStorage.getItem("syns_last_username") || ""; } catch {}
  const hasSavedUser = !!savedUsername;
  return `
  <div class="auth-wrap">
    <div class="auth-top-meta">
      <span class="auth-version">SYNS Man v${appVer}</span>
    </div>
    <div style="position:fixed;top:12px;right:12px;">
      <div class="win-controls">
        <button class="win-btn min"   id="auth-win-min"></button>
        <button class="win-btn max"   id="auth-win-max"></button>
        <button class="win-btn close" id="auth-win-close"></button>
      </div>
    </div>
    <button id="auth-settings-btn" title="Settings" style="position:fixed;left:14px;bottom:14px;width:52px;height:52px;border:none;background:transparent;color:var(--text);cursor:pointer;z-index:6;display:inline-flex;align-items:center;justify-content:center;opacity:.95;">
      ${authSettingsIconHTML()}
    </button>
    <div style="position:fixed;top:92px;left:50%;transform:translateX(-50%);z-index:4;padding:10px 16px;border-radius:12px;border:1px solid var(--border);background:var(--bg2);color:var(--text);font-size:14px;font-weight:700;box-shadow:var(--shadow);">
      Welcome back again
    </div>
    <div class="auth-card">
      <div class="auth-logo">
        <div class="logo-icon">${authLogoHTML()}</div>
        <h1>SYNS Man</h1>
        <p>SSH / SFTP Manager</p>
      </div>
      <h2>Welcome back</h2>
      <p class="sub">Sign in to manage your servers.</p>
      <div id="login-alert"></div>
      <form id="login-form">
        <div class="form-group">
          <label class="form-label">Username</label>
          <input class="form-input${hasSavedUser ? " auth-prefilled" : ""}" id="login-username" placeholder="admin" autocomplete="off" required value="${savedUsername.replace(/"/g, '&quot;')}"/>
          ${hasSavedUser ? `<div style="font-size:11px;color:var(--text2);margin-top:4px;display:flex;align-items:center;gap:4px;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V11H13V17ZM13 9H11V7H13V9Z" fill="currentColor"/></svg>
            Last session: <b>${savedUsername.replace(/</g, '&lt;')}</b> — <a href="#" id="auth-clear-user" style="color:var(--accent);text-decoration:none;">change</a>
          </div>` : ""}
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input class="form-input" id="login-password" type="password" placeholder="••••••••" required/>
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:8px;" id="login-btn">
          Sign In
        </button>
      </form>
      <div class="auth-reset-wrap">
        <a href="#" id="reset-password-link" class="auth-reset-link">Forgot password? (Reset)</a>
      </div>
    </div>
    ${authSettingsModalHTML()}
  </div>`;
}

function bindAuthWinControls() {
  document
    .getElementById("auth-win-min")
    ?.addEventListener("click", () => window.syns.minimize());
  document
    .getElementById("auth-win-max")
    ?.addEventListener("click", () => window.syns.maximize());
  document
    .getElementById("auth-win-close")
    ?.addEventListener("click", () => window.syns.close());

  document.getElementById("auth-settings-btn").onclick = openAuthSettingsModal;
  bindAuthSettingsEvents();
}

function bindAuthSettingsEvents() {
  if (_authSettingsBound) return;
  _authSettingsBound = true;

  document.getElementById("auth-settings-close").onclick =
    closeAuthSettingsModal;
  document.getElementById("auth-stg-test-btn").onclick = testAuthProxy;
  document.getElementById("auth-stg-save-btn").onclick = saveAuthSettings;

  document.getElementById("auth-settings-modal").onclick = (e) => {
    if (e.target === document.getElementById("auth-settings-modal"))
      closeAuthSettingsModal();
  };

  ["dark","light","ocean","forest","violet","rose"].forEach(t => {
    const btn = document.getElementById(`auth-stg-theme-${t}`);
    if (btn) btn.onclick = () => setAuthTheme(t);
  });
  document.getElementById("auth-stg-proxy-enabled").onchange = () => {
    const on = document.getElementById("auth-stg-proxy-enabled").checked;
    document.getElementById("auth-proxy-fields").style.opacity = on
      ? "1"
      : "0.6";
  };
}

async function openAuthSettingsModal() {
  const modal = document.getElementById("auth-settings-modal");
  if (!modal) return;

  const s = await window.syns.settingsGet();
  applyAuthSettingsToUI(s || {});
  modal.classList.add("show");
}

function closeAuthSettingsModal() {
  document.getElementById("auth-settings-modal")?.classList.remove("show");
}

function setAuthTheme(theme) {
  ["dark","light","ocean","forest","violet","rose"].forEach(t => {
    const btn = document.getElementById(`auth-stg-theme-${t}`);
    if (!btn) return;
    btn.classList.toggle("btn-primary", t === theme);
    btn.classList.toggle("btn-ghost",   t !== theme);
  });
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem("syns-theme", theme); } catch {}
}

function applyAuthSettingsToUI(s) {
  const theme = s.theme || "dark";
  setAuthTheme(theme);

  const p = s.proxy || {};
  document.getElementById("auth-stg-proxy-enabled").checked = !!p.enabled;
  document.getElementById("auth-stg-proxy-type").value = p.type || "socks5";
  document.getElementById("auth-stg-proxy-host").value = p.host || "";
  document.getElementById("auth-stg-proxy-port").value = p.port || 1080;
  document.getElementById("auth-stg-proxy-username").value = p.username || "";
  document.getElementById("auth-stg-proxy-password").value = p.password || "";
  document.getElementById("auth-proxy-fields").style.opacity = p.enabled
    ? "1"
    : "0.6";

  const test = document.getElementById("auth-stg-test-result");
  if (test) test.textContent = "";
  const alert = document.getElementById("auth-settings-alert");
  if (alert) alert.innerHTML = "";
}

function readAuthSettingsFromUI() {
  return {
    theme: document
      .getElementById("auth-stg-theme-light")
      .classList.contains("btn-primary")
      ? "light"
      : "dark",
    proxy: {
      enabled: document.getElementById("auth-stg-proxy-enabled").checked,
      type: document.getElementById("auth-stg-proxy-type").value || "socks5",
      host: document.getElementById("auth-stg-proxy-host").value.trim(),
      port:
        parseInt(document.getElementById("auth-stg-proxy-port").value, 10) ||
        1080,
      username: document.getElementById("auth-stg-proxy-username").value.trim(),
      password: document.getElementById("auth-stg-proxy-password").value || "",
    },
  };
}

async function testAuthProxy() {
  const proxy = readAuthSettingsFromUI().proxy;
  const el = document.getElementById("auth-stg-test-result");
  el.textContent = "Testing…";

  const res = await window.syns.settingsTestProxy(proxy);
  el.textContent = res.ok ? "Proxy reachable" : `Failed: ${res.error}`;
  el.style.color = res.ok ? "var(--success)" : "var(--danger)";
}

async function saveAuthSettings() {
  const nextSettings = readAuthSettingsFromUI();
  await window.syns.settingsSet(nextSettings);

  const alert = document.getElementById("auth-settings-alert");
  if (alert)
    alert.innerHTML = '<div class="alert alert-success">Settings saved.</div>';
}
