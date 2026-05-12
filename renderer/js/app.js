/* ─── SYNS Man — Main Renderer ──────────────────────────────────────── */

let currentPage = "dashboard";
let editingServerId = null;
let termSessionId = null;
let sftpSessionId = null;
let xtermInstance = null;
let fitAddon = null;
let serversCache = [];
let resizeTimer = null;
let _termServerId = null;
let sftpCurrentPath = "/";

// Remember last visited SFTP path per server id
const sftpLastPath = {};

// Path history per server: { [serverId]: [{path, visitCount, pinned, lastVisit}] }
const sftpPathHistory = {};

// Recent connections (last 10): [{serverId, type:'ssh'|'sftp', time}]
const recentConnections = [];

// Context menu target
let _ctxItem = null;

// CodeMirror instance
let cmEditor = null;
let _editorWrap = false;
let _editorFS = false;

// Upload modal state
let _uploadFileList = [];
let _uploadingIndex = -1;

// Layout controls
let _sidebarDragging = false;

/* ─── Session & Persistence ─────────────────────────────────────────── */
const SESSION_TTL = 3_600_000; // 1 hour in ms

function saveSession() {
  try {
    localStorage.setItem("syns_session", JSON.stringify({ ts: Date.now() }));
  } catch (e) {}
}

function hasValidSession() {
  try {
    const s = JSON.parse(localStorage.getItem("syns_session") || "null");
    return !!(s && Date.now() - s.ts < SESSION_TTL);
  } catch {
    return false;
  }
}

function clearSession() {
  localStorage.removeItem("syns_session");
}

function initLayoutControls() {
  const layoutToggle = document.getElementById("layout-expand-toggle");
  const cardsToggle = document.getElementById("cards-expand-toggle");
  const resizer = document.getElementById("sidebar-resizer");

  const persistedLayout = localStorage.getItem("syns_layout_expanded") === "1";
  const persistedCards = localStorage.getItem("syns_cards_expanded") === "1";
  const persistedSidebar = parseInt(
    localStorage.getItem("syns_sidebar_w") || "220",
    10,
  );

  if (persistedLayout) {
    document.body.classList.add("layout-expanded");
    layoutToggle?.classList.add("active");
  }

  if (persistedCards) {
    document.body.classList.add("cards-expanded");
    cardsToggle?.classList.add("active");
  }

  if (!Number.isNaN(persistedSidebar)) {
    const clamped = Math.max(180, Math.min(420, persistedSidebar));
    document.documentElement.style.setProperty("--sidebar-w", clamped + "px");
  }

  layoutToggle?.addEventListener("click", () => {
    const on = document.body.classList.toggle("layout-expanded");
    layoutToggle.classList.toggle("active", on);
    localStorage.setItem("syns_layout_expanded", on ? "1" : "0");
  });

  cardsToggle?.addEventListener("click", () => {
    const on = document.body.classList.toggle("cards-expanded");
    cardsToggle.classList.toggle("active", on);
    localStorage.setItem("syns_cards_expanded", on ? "1" : "0");
  });

  resizer?.addEventListener("mousedown", (e) => {
    _sidebarDragging = true;
    document.body.classList.add("sidebar-resizing");
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!_sidebarDragging) return;
    const w = Math.max(180, Math.min(420, e.clientX));
    document.documentElement.style.setProperty("--sidebar-w", w + "px");
  });

  document.addEventListener("mouseup", () => {
    if (!_sidebarDragging) return;
    _sidebarDragging = false;
    document.body.classList.remove("sidebar-resizing");
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue("--sidebar-w")
      .trim();
    if (v.endsWith("px")) {
      localStorage.setItem("syns_sidebar_w", v.replace("px", ""));
    }
  });
}

function savePersistentData() {
  try {
    localStorage.setItem(
      "syns_persist",
      JSON.stringify({
        sftpLastPath: { ...sftpLastPath },
        sftpPathHistory: { ...sftpPathHistory },
        recentConnections: recentConnections.slice(0, 10),
      }),
    );
  } catch (e) {}
}

function loadPersistentData() {
  try {
    const raw = localStorage.getItem("syns_persist");
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.sftpLastPath) Object.assign(sftpLastPath, d.sftpLastPath);
    if (d.sftpPathHistory) Object.assign(sftpPathHistory, d.sftpPathHistory);
    if (d.recentConnections?.length) {
      recentConnections.length = 0;
      recentConnections.push(...d.recentConnections);
    }
  } catch (e) {}
}

/* ─── Boot ──────────────────────────────────────────────────────────── */
async function boot() {
  bindStaticElements();
  const exists = await window.syns.adminExists();
  if (!exists) {
    showAuthPage("setup");
    return;
  }
  if (hasValidSession()) {
    loadPersistentData();
    enterApp(true);
    return;
  }
  showAuthPage("login");
}

/* ─── Static element bindings ───────────────────────────────────────── */
function bindStaticElements() {
  document
    .getElementById("win-min")
    .addEventListener("click", () => window.syns.minimize());
  document
    .getElementById("win-max")
    .addEventListener("click", () => window.syns.maximize());
  document
    .getElementById("win-close")
    .addEventListener("click", () => window.syns.close());

  // Theme toggle
  initTheme();
  initLayoutControls();

  document
    .querySelectorAll(".nav-item[data-page]")
    .forEach((item) =>
      item.addEventListener("click", () => navigateTo(item.dataset.page)),
    );
  document.getElementById("logout-btn").addEventListener("click", () => {
    clearSession();
    showAuthPage("login");
  });

  // Settings page
  initSettingsPage();

  // About page wiring
  initAboutPage();
  document
    .getElementById("btn-add-server")
    .addEventListener("click", openAddServerModal);

  document
    .getElementById("modal-server-close")
    .addEventListener("click", closeServerModal);
  document
    .getElementById("btn-modal-cancel")
    .addEventListener("click", closeServerModal);
  document.getElementById("modal-server").addEventListener("click", (e) => {
    if (e.target === document.getElementById("modal-server"))
      closeServerModal();
  });

  document
    .getElementById("auth-type-select")
    .addEventListener("change", (e) => {
      document.getElementById("auth-password-section").style.display =
        e.target.value === "password" ? "" : "none";
      document.getElementById("auth-key-section").style.display =
        e.target.value === "key" ? "" : "none";
    });

  document
    .getElementById("form-server")
    .addEventListener("submit", submitServerForm);
  document
    .getElementById("server-grid-container")
    .addEventListener("click", handleServerGridClick);

  document
    .getElementById("btn-browse-key")
    .addEventListener("click", async () => {
      const result = await window.syns.openKeyFile();
      if (!result) return;
      if (typeof result === "object" && result.error === "invalid") {
        showSftpToast("⚠️ Invalid key file. Please select a private key (not .pub or .ppk)", 4000);
        return;
      }
      document.getElementById("key-path-input").value = result;
    });

  // Adjust private-key path placeholder based on OS
  const keyPathInput = document.getElementById("key-path-input");
  if (keyPathInput) {
    const platform = window.syns.platform;
    if (platform === "win32") {
      keyPathInput.placeholder = "C:\\Users\\you\\.ssh\\id_ed25519";
    } else if (platform === "darwin") {
      keyPathInput.placeholder = "/Users/you/.ssh/id_ed25519";
    } else {
      keyPathInput.placeholder = "/home/you/.ssh/id_ed25519";
    }
  }

  // SFTP toolbar
  document
    .getElementById("sftp-go")
    .addEventListener("click", () =>
      sftpLoadDir(document.getElementById("sftp-path").value),
    );
  document.getElementById("sftp-path").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sftpLoadDir(e.target.value);
  });
  document.getElementById("sftp-back").addEventListener("click", () => {
    const parts = sftpCurrentPath.split("/").filter(Boolean);
    parts.pop();
    sftpLoadDir("/" + (parts.join("/") || ""));
  });
  document
    .getElementById("btn-disconnect-sftp")
    .addEventListener("click", () => {
      window.syns.sftpDisconnect({ sessionId: sftpSessionId });
      navigateTo("dashboard");
    });
  document
    .getElementById("sftp-refresh")
    .addEventListener("click", () => sftpLoadDir(sftpCurrentPath));
  document
    .getElementById("sftp-mkdir")
    .addEventListener("click", openNewFolderDialog);
  document
    .getElementById("sftp-upload")
    .addEventListener("click", openUploadModal);

  // SSH
  document
    .getElementById("btn-disconnect-ssh")
    .addEventListener("click", () => {
      if (termSessionId)
        window.syns.sshDisconnect({ sessionId: termSessionId });
      navigateTo("dashboard");
    });
  document.getElementById("btn-open-sftp").addEventListener("click", () => {
    if (_termServerId) connectSFTP(_termServerId);
  });

  // Resize + keyboard
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => fitAddon?.fit(), 80);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeServerModal();
      closeEditorModal();
      closeChmodModal();
      closeRenameModal();
      hideCtxMenu();
      hideHistoryPanel();
    }
  });

  // Hide context menu / history panel on click outside
  document.addEventListener("click", (e) => {
    const ctxMenu = document.getElementById("ctx-menu");
    if (ctxMenu && !ctxMenu.contains(e.target)) hideCtxMenu();
    const histPanel = document.getElementById("sftp-history-panel");
    const histBtn = document.getElementById("sftp-history-btn");
    if (histPanel && !histPanel.contains(e.target) && e.target !== histBtn)
      histPanel.style.display = "none";
  });

  // Path history toggle button
  document.getElementById("sftp-history-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleHistoryPanel();
  });

  // Context menu actions
  document.getElementById("ctx-edit").addEventListener("click", () => {
    hideCtxMenu();
    openEditor();
  });
  document.getElementById("ctx-download").addEventListener("click", () => {
    hideCtxMenu();
    downloadFile();
  });
  document.getElementById("ctx-rename").addEventListener("click", () => {
    hideCtxMenu();
    openRenameModal();
  });
  document.getElementById("ctx-chmod").addEventListener("click", () => {
    hideCtxMenu();
    openChmodModal();
  });
  document.getElementById("ctx-compress").addEventListener("click", () => {
    hideCtxMenu();
    compressItem();
  });
  document.getElementById("ctx-extract").addEventListener("click", () => {
    hideCtxMenu();
    extractFile();
  });
  document.getElementById("ctx-delete").addEventListener("click", () => {
    hideCtxMenu();
    confirmDelete();
  });

  // Track SFTP upload progress
  window.syns.onSftpProgress(({ transferred, total }) => {
    const pct = total > 0 ? Math.round((transferred / total) * 100) : 0;
    // toolbar progress bar
    const fill = document.getElementById("sftp-op-progress-fill");
    if (fill) fill.style.width = pct + "%";
    // per-file progress in upload modal
    if (_uploadingIndex >= 0) {
      const progEl = document.getElementById(`upload-prog-${_uploadingIndex}`);
      const statusEl = document.getElementById(
        `upload-status-${_uploadingIndex}`,
      );
      if (progEl) progEl.style.width = pct + "%";
      if (
        statusEl &&
        !statusEl.textContent.startsWith("✔") &&
        !statusEl.textContent.startsWith("✗")
      )
        statusEl.textContent = pct + "%";
    }
  });

  // Upload modal bindings
  document
    .getElementById("upload-close")
    .addEventListener("click", closeUploadModal);
  document
    .getElementById("upload-cancel-btn")
    .addEventListener("click", closeUploadModal);
  document.getElementById("modal-upload").addEventListener("click", (e) => {
    if (e.target === document.getElementById("modal-upload"))
      closeUploadModal();
  });
  document
    .getElementById("upload-start-btn")
    .addEventListener("click", startUpload);
  document
    .getElementById("upload-browse-btn")
    .addEventListener("click", () =>
      document.getElementById("upload-file-input").click(),
    );
  document
    .getElementById("upload-file-input")
    .addEventListener("change", (e) => {
      addFilesToUpload(Array.from(e.target.files));
      e.target.value = "";
    });
  const _dz = document.getElementById("upload-dropzone");
  _dz.addEventListener("dragover", (e) => {
    e.preventDefault();
    _dz.classList.add("drag-over");
  });
  _dz.addEventListener("dragleave", () => _dz.classList.remove("drag-over"));
  _dz.addEventListener("drop", (e) => {
    e.preventDefault();
    _dz.classList.remove("drag-over");
    addFilesToUpload(Array.from(e.dataTransfer.files));
  });

  // Editor modal
  document
    .getElementById("editor-close")
    .addEventListener("click", closeEditorModal);
  document.getElementById("modal-editor").addEventListener("click", (e) => {
    if (e.target === document.getElementById("modal-editor"))
      closeEditorModal();
  });
  document
    .getElementById("btn-editor-save")
    .addEventListener("click", saveEditorFile);

  // Editor toolbar
  document
    .getElementById("editor-undo")
    .addEventListener("click", () => cmEditor?.execCommand("undo"));
  document
    .getElementById("editor-redo")
    .addEventListener("click", () => cmEditor?.execCommand("redo"));
  document
    .getElementById("editor-find")
    .addEventListener("click", () => cmEditor?.execCommand("find"));
  document
    .getElementById("editor-replace")
    .addEventListener("click", openReplacePanel);
  document
    .getElementById("editor-goto")
    .addEventListener("click", () => cmEditor?.execCommand("jumpToLine"));
  document
    .getElementById("editor-comment")
    .addEventListener("click", () => cmEditor?.execCommand("toggleComment"));
  document
    .getElementById("editor-indent-all")
    .addEventListener("click", editorIndentAll);
  document
    .getElementById("editor-select-all")
    .addEventListener("click", () => cmEditor?.execCommand("selectAll"));
  document
    .getElementById("editor-wrap")
    .addEventListener("click", editorToggleWrap);
  document
    .getElementById("editor-fullscreen")
    .addEventListener("click", editorToggleFullscreen);

  // Find & Replace panel
  document
    .getElementById("er-prev")
    .addEventListener("click", () => erSearch(true));
  document
    .getElementById("er-next")
    .addEventListener("click", () => erSearch(false));
  document.getElementById("er-rep-one").addEventListener("click", erReplaceOne);
  document.getElementById("er-rep-all").addEventListener("click", erReplaceAll);
  document
    .getElementById("er-close-panel")
    .addEventListener("click", closeReplacePanel);
  document
    .getElementById("er-case")
    .addEventListener("change", (e) =>
      e.target.closest(".er-cb").classList.toggle("active", e.target.checked),
    );
  document
    .getElementById("er-regex")
    .addEventListener("change", (e) =>
      e.target.closest(".er-cb").classList.toggle("active", e.target.checked),
    );
  document.getElementById("er-find").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.shiftKey ? erSearch(true) : erSearch(false);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeReplacePanel();
    }
  });
  document.getElementById("er-replace-val").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      erReplaceOne();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeReplacePanel();
    }
  });

  // Chmod modal
  document
    .getElementById("chmod-close")
    .addEventListener("click", closeChmodModal);
  document
    .getElementById("chmod-cancel")
    .addEventListener("click", closeChmodModal);
  document
    .getElementById("btn-chmod-apply")
    .addEventListener("click", applyChmod);
  // Sync checkboxes → octal
  ["ur", "uw", "ux", "gr", "gw", "gx", "or", "ow", "ox"].forEach((id) => {
    document
      .getElementById("chmod-" + id)
      .addEventListener("change", syncChmodOctal);
  });
  // Sync octal → checkboxes
  document
    .getElementById("chmod-octal")
    .addEventListener("input", syncChmodCheckboxes);

  // Rename modal
  document
    .getElementById("rename-close")
    .addEventListener("click", closeRenameModal);
  document
    .getElementById("rename-cancel")
    .addEventListener("click", closeRenameModal);
  document.getElementById("modal-rename").addEventListener("click", (e) => {
    if (e.target === document.getElementById("modal-rename"))
      closeRenameModal();
  });
  document
    .getElementById("btn-rename-apply")
    .addEventListener("click", applyRename);
  document.getElementById("rename-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyRename();
  });
}

/* ─── Auth pages ────────────────────────────────────────────────────── */
function showAuthPage(type) {
  const root = document.getElementById("auth-root");
  document.getElementById("main-shell").style.display = "none";
  root.style.display = "block";
  root.innerHTML = type === "setup" ? setupPageHTML() : loginPageHTML();
  bindAuthWinControls();
  if (type === "setup") bindSetupForm();
  else bindLoginForm();
}

function bindSetupForm() {
  const pwd = document.getElementById("setup-password");
  pwd.addEventListener("input", () => updateStrength(pwd.value));

  document
    .getElementById("setup-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = document.getElementById("setup-username").value.trim();
      const password = document.getElementById("setup-password").value;
      const confirm = document.getElementById("setup-confirm").value;

      if (password !== confirm)
        return showAlert("setup-alert", "Passwords do not match.", "error");
      if (password.length < 6)
        return showAlert(
          "setup-alert",
          "Password must be at least 6 characters.",
          "error",
        );

      const btn = document.getElementById("setup-btn");
      btn.disabled = true;
      btn.textContent = "Creating…";

      const res = await window.syns.adminSetup({ username, password });
      if (res.ok) {
        showAlert("setup-alert", "Account created! Signing you in…", "success");
        setTimeout(() => {
          saveSession();
          enterApp();
        }, 800);
      } else {
        showAlert("setup-alert", res.error, "error");
        btn.disabled = false;
        btn.textContent = "Create Account";
      }
    });
}

function bindLoginForm() {
  document
    .getElementById("login-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = document.getElementById("login-username").value.trim();
      const password = document.getElementById("login-password").value;

      const btn = document.getElementById("login-btn");
      btn.disabled = true;
      btn.textContent = "Signing in…";

      const res = await window.syns.adminLogin({ username, password });
      if (res.ok) {
        try { localStorage.setItem("syns_last_username", username); } catch {}
        saveSession();
        enterApp();
      } else {
        showAlert("login-alert", res.error, "error");
        btn.disabled = false;
        btn.textContent = "Sign In";
      }
    });

  document.getElementById("reset-password-link")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const confirmed = confirm("هل أنت متأكد من إعادة تعيين كلمة المرور؟ سيتم مسح جميع البيانات والخوادم المحفوظة.");
    if (confirmed) {
      await window.syns.adminReset();
      window.location.reload();
    }
  });
}

function enterApp(silent) {
  document.getElementById("auth-root").style.display = "none";
  document.getElementById("main-shell").style.display = "flex";
  if (silent) showSftpToast("✅ Session restored");
  initGlobalUpdateListener();
  loadDashboard();
}

/* ─── Navigation ────────────────────────────────────────────────────── */
function navigateTo(page) {
  if (currentPage === page) return;
  document
    .querySelectorAll(".nav-item[data-page]")
    .forEach((i) => i.classList.remove("active"));
  document
    .querySelector(`.nav-item[data-page="${page}"]`)
    ?.classList.add("active");
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  document.getElementById(`page-${page}`)?.classList.add("active");
  currentPage = page;
  saveSession(); // refresh TTL on activity
}

/* ─── Dashboard / Servers ───────────────────────────────────────────── */
async function loadDashboard() {
  navigateTo("dashboard");
  serversCache = await window.syns.serversList();
  renderServerGrid(serversCache);
}

function renderServerGrid(servers) {
  const container = document.getElementById("server-grid-container");
  if (!servers.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">&#x1F5A5;&#xFE0F;</div>
        <h3>No servers yet</h3>
        <p>Add your first server to get started with SSH and SFTP connections.</p>
        <button class="btn btn-primary" id="btn-empty-add">&#xFF0B; Add Server</button>
      </div>`;
    document
      .getElementById("btn-empty-add")
      .addEventListener("click", openAddServerModal);
    return;
  }
  container.innerHTML = `<div class="server-grid">${servers.map(serverCardHTML).join("")}</div>`;
}

function serverCardHTML(s) {
  const authBadge =
    s.auth_type === "key"
      ? `<span class="badge badge-green" style="font-size:10px;">KEY</span>`
      : `<span class="badge badge-blue"  style="font-size:10px;">PWD</span>`;

  const iconServer = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4 5.5C4 4.67 4.67 4 5.5 4H18.5C19.33 4 20 4.67 20 5.5V14.5C20 15.33 19.33 16 18.5 16H13L10.5 18.5V16H5.5C4.67 16 4 15.33 4 14.5V5.5Z" fill="currentColor"/><circle cx="8" cy="10" r="1" fill="white"/><circle cx="12" cy="10" r="1" fill="white"/></svg>`;
  const iconSSH = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M13 3L6 14H11L10 21L18 10H13L13 3Z" fill="currentColor"/></svg>`;
  const iconSFTP = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 7.5C3 6.67 3.67 6 4.5 6H9L10.5 8H19.5C20.33 8 21 8.67 21 9.5V17.5C21 18.33 20.33 19 19.5 19H4.5C3.67 19 3 18.33 3 17.5V7.5Z" fill="currentColor"/></svg>`;
  const iconEdit = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4 16.5V20H7.5L17.6 9.9L14.1 6.4L4 16.5Z" fill="currentColor"/><path d="M18.3 9.2L14.8 5.7L16.2 4.3C16.98 3.52 18.24 3.52 19.02 4.3L19.7 4.98C20.48 5.76 20.48 7.02 19.7 7.8L18.3 9.2Z" fill="currentColor"/></svg>`;
  const iconDelete = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M9 4.5H15L15.6 6H20V8H4V6H8.4L9 4.5Z" fill="currentColor"/><path d="M7 9H17L16.2 19.2C16.14 19.94 15.52 20.5 14.78 20.5H9.22C8.48 20.5 7.86 19.94 7.8 19.2L7 9Z" fill="currentColor"/></svg>`;

  return `
  <div class="server-card" data-id="${s.id}" data-action="ssh">
    <div class="server-card-header">
      <div class="server-icon">${iconServer}</div>
      <div style="flex:1;min-width:0;">
        <div class="server-name">${esc(s.name)}</div>
        <div class="server-host">${esc(s.username)}@${esc(s.host)}:${s.port} ${authBadge}</div>
      </div>
    </div>
    <div class="server-actions">
      <button class="btn btn-primary btn-sm" data-id="${s.id}" data-action="ssh" style="display:inline-flex;align-items:center;gap:6px;">${iconSSH} SSH</button>
      <button class="btn btn-ghost btn-sm"   data-id="${s.id}" data-action="sftp" style="display:inline-flex;align-items:center;gap:6px;">${iconSFTP} SFTP</button>
      <button class="btn btn-ghost btn-sm"   data-id="${s.id}" data-action="edit" style="display:inline-flex;align-items:center;justify-content:center;">${iconEdit}</button>
      <button class="btn btn-danger btn-sm"  data-id="${s.id}" data-action="delete" style="display:inline-flex;align-items:center;justify-content:center;">${iconDelete}</button>
    </div>
  </div>`;
}

function handleServerGridClick(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  e.stopPropagation();
  const id = parseInt(btn.dataset.id);
  const action = btn.dataset.action;
  if (action === "ssh") connectSSH(id);
  if (action === "sftp") connectSFTP(id);
  if (action === "edit") openEditServerModal(id);
  if (action === "delete") deleteServer(id);
}

/* ─── Add / Edit Server Modal ───────────────────────────────────────── */
function openAddServerModal() {
  editingServerId = null;
  document.getElementById("modal-server-title").textContent = "Add Server";
  document.getElementById("form-server").reset();
  document.getElementById("auth-password-section").style.display = "";
  document.getElementById("auth-key-section").style.display = "none";
  document.getElementById("modal-server").classList.add("show");
  document.getElementById("form-server").querySelector('[name="name"]').focus();
}

async function openEditServerModal(id) {
  const s =
    serversCache.find((x) => x.id === id) || (await window.syns.serversGet(id));
  if (!s) return;
  editingServerId = id;
  document.getElementById("modal-server-title").textContent = "Edit Server";

  const form = document.getElementById("form-server");
  form.name.value = s.name;
  form.host.value = s.host;
  form.port.value = s.port;
  form.username.value = s.username;
  form.auth_type.value = s.auth_type;
  form.password.value = s.password || "";
  form.key_path.value = s.key_path || "";
  form.passphrase.value = s.passphrase || "";

  document.getElementById("auth-password-section").style.display =
    s.auth_type === "password" ? "" : "none";
  document.getElementById("auth-key-section").style.display =
    s.auth_type === "key" ? "" : "none";
  document.getElementById("modal-server").classList.add("show");
}

function closeServerModal() {
  document.getElementById("modal-server").classList.remove("show");
}

async function submitServerForm(e) {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById("btn-save-server");
  btn.disabled = true;

  const data = {
    name: form.name.value.trim(),
    host: form.host.value.trim(),
    port: parseInt(form.port.value) || 22,
    username: form.username.value.trim(),
    auth_type: form.auth_type.value,
    password: form.password.value,
    key_path: (form.key_path?.value || "").trim(),
    passphrase: form.passphrase.value,
  };

  if (editingServerId) {
    data.id = editingServerId;
    await window.syns.serversUpdate(data);
  } else {
    await window.syns.serversAdd(data);
  }

  btn.disabled = false;
  closeServerModal();
  loadDashboard();
}

async function deleteServer(id) {
  if (!confirm("Delete this server?")) return;
  await window.syns.serversDelete(id);
  serversCache = serversCache.filter((s) => s.id !== id);
  renderServerGrid(serversCache);
}

/* ─── SSH Terminal ───────────────────────────────────────────────────── */
async function connectSSH(serverId) {
  _termServerId = serverId;
  navigateTo("terminal");

  const server =
    serversCache.find((s) => s.id === serverId) ||
    (await window.syns.serversGet(serverId));
  document.getElementById("term-title").textContent =
    `${server.username}@${server.host}`;

  const container = document.getElementById("xterm-container");
  container.innerHTML = "";

  const term = new Terminal({
    theme: {
      background: "#0d1117",
      foreground: "#e2e8f0",
      cursor: "#4f8ef7",
      cursorAccent: "#0d1117",
      selectionBackground: "rgba(79,142,247,.3)",
    },
    fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
    fontSize: 14,
    lineHeight: 1.4,
    cursorBlink: true,
    scrollback: 5000,
    fastScrollModifier: "alt",
  });

  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(container);
  requestAnimationFrame(() => fit.fit());

  xtermInstance = term;
  fitAddon = fit;

  if (termSessionId) window.syns.sshDisconnect({ sessionId: termSessionId });
  termSessionId = "ssh_" + Date.now();

  term.writeln("\x1b[1;34m  Connecting to " + esc(server.host) + "...\x1b[0m");

  const res = await window.syns.sshConnect({
    sessionId: termSessionId,
    serverId,
  });
  if (!res.ok) {
    term.writeln(`\x1b[1;31m  Connection failed: ${res.error}\x1b[0m`);
    return;
  }
  addRecentConnection(serverId, "ssh");

  window.syns.onSshData(({ sessionId, data }) => {
    if (sessionId === termSessionId) term.write(data);
  });
  window.syns.onSshClosed(({ sessionId }) => {
    if (sessionId === termSessionId)
      term.writeln("\r\n\x1b[1;33m  Connection closed.\x1b[0m");
  });

  term.onData((data) =>
    window.syns.sshSend({ sessionId: termSessionId, data }),
  );
  term.onResize(({ cols, rows }) =>
    window.syns.sshResize({ sessionId: termSessionId, cols, rows }),
  );
}

/* ─── SFTP Browser ───────────────────────────────────────────────────── */
let _sftpServerId = null;

async function connectSFTP(serverId) {
  _sftpServerId = serverId;
  sftpSessionId = "sftp_" + Date.now();
  navigateTo("sftp");

  const server =
    serversCache.find((s) => s.id === serverId) ||
    (await window.syns.serversGet(serverId));
  document.getElementById("sftp-server-name").textContent = server.name;
  document.getElementById("file-list").innerHTML =
    `<div style="padding:40px;text-align:center;color:var(--text2);"><div class="spinner"></div><br/><br/>Connecting...</div>`;

  const res = await window.syns.sftpConnect({
    sessionId: sftpSessionId,
    serverId,
  });
  if (!res.ok) {
    document.getElementById("file-list").innerHTML =
      `<div class="empty-state"><div class="icon">&#x274C;</div><h3>Connection failed</h3><p>${esc(res.error)}</p></div>`;
    return;
  }
  addRecentConnection(serverId, "sftp");

  // Resume last visited path for this server, or default to /
  const startPath = sftpLastPath[serverId] || "/";
  sftpCurrentPath = "/";
  sftpLoadDir(startPath);
}

async function sftpLoadDir(path) {
  sftpCurrentPath = path || "/";
  if (_sftpServerId) {
    sftpLastPath[_sftpServerId] = sftpCurrentPath;
    addToPathHistory(_sftpServerId, sftpCurrentPath);
  }
  hideHistoryPanel();
  document.getElementById("sftp-path").value = sftpCurrentPath;
  document.getElementById("file-list").innerHTML =
    `<div style="padding:24px;text-align:center;color:var(--text2);"><div class="spinner"></div></div>`;

  const res = await window.syns.sftpList({
    sessionId: sftpSessionId,
    path: sftpCurrentPath,
  });
  if (!res.ok) {
    document.getElementById("file-list").innerHTML =
      `<div class="empty-state"><div class="icon">&#x26A0;&#xFE0F;</div><h3>Error</h3><p>${esc(res.error)}</p></div>`;
    return;
  }

  if (!res.items.length) {
    document.getElementById("file-list").innerHTML =
      `<div class="empty-state"><div class="icon">&#x1F4C2;</div><h3>Empty directory</h3></div>`;
    return;
  }

  const html = res.items
    .map((item) => {
      const icon =
        item.type === "directory" ? "&#x1F4C1;" : fileIcon(item.name);
      const size =
        item.type === "directory"
          ? '<span style="color:var(--text2);font-size:11px;">DIR</span>'
          : formatBytes(item.size);
      const date = new Date(item.modified).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const perms = item.permissions || "";
      return `<div class="file-item" data-name="${esc(item.name)}" data-type="${item.type}" data-perms="${esc(perms)}">
      <span class="file-icon">${icon}</span>
      <span class="file-name">${esc(item.name)}</span>
      <span class="file-size">${size}</span>
      <span class="file-date">${date}</span>
      <span class="file-perms" style="color:var(--text2);font-size:11px;font-family:Consolas,monospace;min-width:80px;text-align:right;">${esc(perms)}</span>
    </div>`;
    })
    .join("");

  const list = document.getElementById("file-list");
  list.innerHTML = html;

  // Use assignment (not addEventListener) so only ONE handler exists at a time,
  // preventing path duplication when navigating multiple directories.
  list.onclick = (e) => {
    const item = e.target.closest(".file-item");
    if (!item) return;
    list
      .querySelectorAll(".file-item")
      .forEach((i) => i.classList.remove("selected"));
    item.classList.add("selected");
    if (item.dataset.type === "directory") {
      const base = sftpCurrentPath.replace(/\/+$/, "");
      const name = item.dataset.name;
      sftpLoadDir((base === "" ? "" : base) + "/" + name);
    }
  };

  list.oncontextmenu = (e) => {
    const item = e.target.closest(".file-item");
    if (!item) return;
    e.preventDefault();
    list
      .querySelectorAll(".file-item")
      .forEach((i) => i.classList.remove("selected"));
    item.classList.add("selected");
    _ctxItem = item;
    showCtxMenu(e.clientX, e.clientY, item.dataset.type);
  };
}

/* ─── Context Menu ───────────────────────────────────────────────────── */
function showCtxMenu(x, y, type) {
  const menu = document.getElementById("ctx-menu");
  const name = _ctxItem?.dataset.name || "";
  const isFile = type === "file";
  const isArchive = /\.(zip|tar\.gz|tgz|tar\.bz2|tar|gz)$/i.test(name);

  document.getElementById("ctx-edit").style.display =
    isFile && isTextFile(name) ? "" : "none";
  document.getElementById("ctx-download").style.display = isFile ? "" : "none";
  document.getElementById("ctx-compress").style.display = ""; // always available
  document.getElementById("ctx-extract").style.display =
    isFile && isArchive ? "" : "none";

  menu.style.display = "block";
  const vw = window.innerWidth,
    vh = window.innerHeight;
  const mw = menu.offsetWidth || 200,
    mh = menu.offsetHeight || 200;
  menu.style.left = (x + mw > vw ? vw - mw - 8 : x) + "px";
  menu.style.top = (y + mh > vh ? vh - mh - 8 : y) + "px";
}

function hideCtxMenu() {
  document.getElementById("ctx-menu").style.display = "none";
}

function ctxFullPath() {
  if (!_ctxItem) return null;
  const base = sftpCurrentPath.replace(/\/+$/, "") || "";
  return base + "/" + _ctxItem.dataset.name;
}

/* ─── File Editor (CodeMirror) ───────────────────────────────────────── */
function getCodeMirrorMode(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const modes = {
    js: "javascript",
    ts: "javascript",
    jsx: "javascript",
    tsx: "javascript",
    json: { name: "javascript", json: true },
    css: "css",
    scss: "css",
    html: "htmlmixed",
    htm: "htmlmixed",
    php: "php",
    py: "python",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    sql: "sql",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    md: "markdown",
    c: "text/x-csrc",
    cpp: "text/x-c++src",
    h: "text/x-csrc",
    java: "text/x-java",
  };
  return modes[ext] || null;
}

function getLangLabel(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const labels = {
    js: "JS",
    ts: "TS",
    jsx: "JSX",
    tsx: "TSX",
    json: "JSON",
    css: "CSS",
    scss: "SCSS",
    html: "HTML",
    htm: "HTML",
    php: "PHP",
    py: "Python",
    sh: "Shell",
    bash: "Shell",
    zsh: "Shell",
    sql: "SQL",
    yaml: "YAML",
    yml: "YAML",
    xml: "XML",
    md: "Markdown",
    c: "C",
    cpp: "C++",
    h: "C",
    java: "Java",
  };
  return labels[ext] || ext.toUpperCase() || "Text";
}

async function openEditor() {
  if (!_ctxItem) return;
  const path = ctxFullPath();
  const name = _ctxItem.dataset.name;

  document.getElementById("editor-title").textContent = name;
  document.getElementById("editor-lang-badge").textContent = getLangLabel(name);
  document.getElementById("editor-cursor-pos").textContent = "Ln 1, Col 1";
  document.getElementById("editor-alert").innerHTML = "";
  document.getElementById("modal-editor").dataset.path = path;
  document.getElementById("modal-editor").classList.add("show");

  const host = document.getElementById("editor-cm-host");
  host.innerHTML =
    '<div style="padding:24px;text-align:center;color:var(--text2);"><div class="spinner"></div></div>';

  const res = await window.syns.sftpReadFile({
    sessionId: sftpSessionId,
    path,
  });
  host.innerHTML = "";

  if (!res.ok) {
    showAlert("editor-alert", "Failed to read file: " + res.error, "error");
    return;
  }

  // Destroy previous instance
  if (cmEditor) {
    cmEditor.toTextArea();
    cmEditor = null;
  }

  // Create a textarea seed for CodeMirror
  const ta = document.createElement("textarea");
  host.appendChild(ta);

  cmEditor = CodeMirror.fromTextArea(ta, {
    value: res.content,
    theme: "dracula",
    lineNumbers: true,
    lineWrapping: _editorWrap,
    matchBrackets: true,
    autoCloseBrackets: true,
    foldGutter: true,
    gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
    styleActiveLine: true,
    mode: getCodeMirrorMode(name) || "text/plain",
    indentUnit: 2,
    tabSize: 2,
    indentWithTabs: false,
    highlightSelectionMatches: { showToken: /\w/, annotateScrollbar: true },
    extraKeys: {
      "Ctrl-S": saveEditorFile,
      "Ctrl-H": () => openReplacePanel(),
      "Ctrl-/": (cm) => cm.execCommand("toggleComment"),
      F11: editorToggleFullscreen,
      "Shift-Tab": (cm) => cm.indentSelection("subtract"),
      Tab: (cm) => {
        if (cm.somethingSelected()) cm.indentSelection("add");
        else cm.replaceSelection("  ", "end");
      },
    },
  });

  // Sync wrap button active state
  document
    .getElementById("editor-wrap")
    .classList.toggle("active", _editorWrap);
  document
    .getElementById("editor-fullscreen")
    .classList.toggle("active", _editorFS);

  cmEditor.setValue(res.content);

  // Cursor position display
  cmEditor.on("cursorActivity", (cm) => {
    const cur = cm.getCursor();
    document.getElementById("editor-cursor-pos").textContent =
      `Ln ${cur.line + 1}, Col ${cur.ch + 1}`;
  });

  // Refresh after display
  requestAnimationFrame(() => {
    if (cmEditor) cmEditor.refresh();
  });
}

async function saveEditorFile() {
  if (!cmEditor) return;
  const path = document.getElementById("modal-editor").dataset.path;
  const content = cmEditor.getValue();
  const btn = document.getElementById("btn-editor-save");
  btn.disabled = true;
  btn.textContent = "Saving…";

  const res = await window.syns.sftpWriteFile({
    sessionId: sftpSessionId,
    path,
    content,
  });

  btn.disabled = false;
  btn.innerHTML = "&#x1F4BE; Save";
  if (res.ok) {
    showAlert("editor-alert", "Saved successfully.", "success");
    setTimeout(() => {
      document.getElementById("editor-alert").innerHTML = "";
    }, 2000);
  } else {
    showAlert("editor-alert", "Save failed: " + res.error, "error");
  }
}

function closeEditorModal() {
  _editorFS = false;
  document.querySelector(".modal-editor-inner")?.classList.remove("editor-fs");
  document.getElementById("modal-editor").classList.remove("show");
  document.getElementById("editor-replace-panel").style.display = "none";
  document.getElementById("er-status").textContent = "";
  if (cmEditor) {
    cmEditor.toTextArea();
    cmEditor = null;
  }
}

/* ─── Editor toolbar helpers ──────────────────────────────────────────────── */
function editorIndentAll() {
  if (!cmEditor) return;
  const count = cmEditor.lineCount();
  cmEditor.operation(() => {
    for (let i = 0; i < count; i++) cmEditor.indentLine(i, "smart");
  });
  cmEditor.focus();
}

function editorToggleWrap() {
  if (!cmEditor) return;
  _editorWrap = !_editorWrap;
  cmEditor.setOption("lineWrapping", _editorWrap);
  document
    .getElementById("editor-wrap")
    .classList.toggle("active", _editorWrap);
  cmEditor.focus();
}

function editorToggleFullscreen() {
  _editorFS = !_editorFS;
  document
    .querySelector(".modal-editor-inner")
    .classList.toggle("editor-fs", _editorFS);
  document
    .getElementById("editor-fullscreen")
    .classList.toggle("active", _editorFS);
  requestAnimationFrame(() => cmEditor?.refresh());
  cmEditor?.focus();
}

/* ─── Find & Replace Panel ────────────────────────────────────────────────── */
function openReplacePanel() {
  const panel = document.getElementById("editor-replace-panel");
  panel.style.display = "";
  requestAnimationFrame(() => {
    cmEditor?.refresh();
    document.getElementById("er-find").focus();
  });
}

function closeReplacePanel() {
  document.getElementById("editor-replace-panel").style.display = "none";
  document.getElementById("er-status").textContent = "";
  requestAnimationFrame(() => cmEditor?.refresh());
  cmEditor?.focus();
}

function erBuildQuery() {
  const val = document.getElementById("er-find").value;
  if (!val) return null;
  const caseSensitive = document.getElementById("er-case").checked;
  const isRegex = document.getElementById("er-regex").checked;
  if (isRegex) {
    try {
      return { q: new RegExp(val, caseSensitive ? "" : "i"), isRegex: true };
    } catch (e) {
      document.getElementById("er-status").textContent = "Invalid regex";
      return null;
    }
  }
  return { q: val, isRegex: false, opts: { caseFold: !caseSensitive } };
}

function erSearch(reverse) {
  if (!cmEditor) return;
  const built = erBuildQuery();
  if (!built) return;
  const { q, isRegex, opts = {} } = built;

  const startPos = reverse
    ? cmEditor.getCursor("from")
    : cmEditor.getCursor("to");
  const c = cmEditor.getSearchCursor(q, startPos, opts);
  const found = reverse ? c.findPrevious() : c.findNext();

  if (found) {
    cmEditor.setSelection(c.from(), c.to());
    cmEditor.scrollIntoView({ from: c.from(), to: c.to() }, 100);
    document.getElementById("er-status").textContent =
      `Ln ${c.from().line + 1}`;
    return;
  }
  // Wrap around
  const wrapPos = reverse
    ? {
        line: cmEditor.lastLine(),
        ch: cmEditor.getLine(cmEditor.lastLine()).length,
      }
    : { line: 0, ch: 0 };
  const c2 = cmEditor.getSearchCursor(q, wrapPos, opts);
  const found2 = reverse ? c2.findPrevious() : c2.findNext();
  if (found2) {
    cmEditor.setSelection(c2.from(), c2.to());
    cmEditor.scrollIntoView({ from: c2.from(), to: c2.to() }, 100);
    document.getElementById("er-status").textContent =
      `Ln ${c2.from().line + 1} ↩`;
  } else {
    document.getElementById("er-status").textContent = "No matches";
  }
}

function erReplaceOne() {
  if (!cmEditor) return;
  const built = erBuildQuery();
  if (!built) return;
  const { q, opts = {} } = built;
  const repVal = document.getElementById("er-replace-val").value;

  // If current selection already matches, replace it then move forward
  const selFrom = cmEditor.getCursor("from");
  const c = cmEditor.getSearchCursor(q, selFrom, opts);
  if (
    c.findNext() &&
    c.from().line === selFrom.line &&
    c.from().ch === selFrom.ch
  ) {
    c.replace(repVal);
    document.getElementById("er-status").textContent = "Replaced";
  }
  erSearch(false);
}

function erReplaceAll() {
  if (!cmEditor) return;
  const built = erBuildQuery();
  if (!built) return;
  const { q, opts = {} } = built;
  const repVal = document.getElementById("er-replace-val").value;

  let count = 0;
  cmEditor.operation(() => {
    const c = cmEditor.getSearchCursor(q, { line: 0, ch: 0 }, opts);
    while (c.findNext()) {
      c.replace(repVal);
      count++;
    }
  });
  document.getElementById("er-status").textContent = count
    ? `Replaced ${count}`
    : "No matches";
}

/* ─── Upload / Download / New Folder ────────────────────────────────── */
/* ─── Upload Modal ───────────────────────────────────────────────────── */
function openUploadModal() {
  _uploadFileList = [];
  _uploadingIndex = -1;
  document.getElementById("upload-dest-label").textContent =
    "\u2192 " + sftpCurrentPath;
  document.getElementById("upload-items").innerHTML = "";
  document.getElementById("upload-footer").style.display = "none";
  document.getElementById("upload-start-btn").disabled = false;
  document.getElementById("upload-start-btn").style.display = "";
  document.getElementById("upload-start-btn").innerHTML = "&#x2B06; Upload";
  document.getElementById("upload-browse-btn").disabled = false;
  document.getElementById("upload-close").style.display = "";
  document.getElementById("upload-cancel-btn").textContent = "Cancel";
  document.getElementById("modal-upload").classList.add("show");
}

function closeUploadModal() {
  if (_uploadingIndex >= 0) return; // block close while uploading
  document.getElementById("modal-upload").classList.remove("show");
  _uploadFileList = [];
  _uploadingIndex = -1;
}

function addFilesToUpload(files) {
  for (const f of files) {
    if (!_uploadFileList.find((x) => x.name === f.name && x.size === f.size))
      _uploadFileList.push(f);
  }
  renderUploadList();
}

function removeUploadFile(index) {
  _uploadFileList.splice(index, 1);
  renderUploadList();
}

function renderUploadList() {
  const itemsEl = document.getElementById("upload-items");
  const footer = document.getElementById("upload-footer");
  const summary = document.getElementById("upload-summary");
  if (!_uploadFileList.length) {
    itemsEl.innerHTML = "";
    footer.style.display = "none";
    return;
  }
  footer.style.display = "";
  const totalSize = _uploadFileList.reduce((a, f) => a + f.size, 0);
  summary.textContent = `${_uploadFileList.length} file${_uploadFileList.length !== 1 ? "s" : ""} \u00b7 ${formatBytes(totalSize)}`;
  itemsEl.innerHTML = _uploadFileList
    .map(
      (f, i) => `
    <div class="upload-item" id="upload-item-${i}">
      <span class="upload-item-icon">${fileIcon(f.name)}</span>
      <div class="upload-item-info">
        <div class="upload-item-name" title="${esc(f.name)}">${esc(f.name)}</div>
        <div class="upload-item-meta">${formatBytes(f.size)}</div>
        <div class="upload-item-progress-wrap">
          <div class="upload-item-progress-fill" id="upload-prog-${i}"></div>
        </div>
      </div>
      <span class="upload-item-status" id="upload-status-${i}">Pending</span>
      <button class="upload-item-remove" data-idx="${i}" title="Remove">&#x2715;</button>
    </div>
  `,
    )
    .join("");
  itemsEl.querySelectorAll(".upload-item-remove").forEach((btn) => {
    btn.addEventListener("click", () =>
      removeUploadFile(parseInt(btn.dataset.idx)),
    );
  });
}

async function startUpload() {
  if (!_uploadFileList.length) return;
  const dir = sftpCurrentPath.replace(/\/+$/, "") || "/";

  // Lock UI during upload
  document.getElementById("upload-start-btn").disabled = true;
  document.getElementById("upload-start-btn").innerHTML =
    '<span class="spinner" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:6px;"></span>Uploading\u2026';
  document.getElementById("upload-browse-btn").disabled = true;
  document.getElementById("upload-close").style.display = "none";
  document.getElementById("upload-cancel-btn").textContent =
    "Please wait\u2026";

  let successCount = 0;
  for (let i = 0; i < _uploadFileList.length; i++) {
    _uploadingIndex = i;
    const f = _uploadFileList[i];
    const remotePath = dir + "/" + f.name;
    const itemEl = document.getElementById(`upload-item-${i}`);
    const statusEl = document.getElementById(`upload-status-${i}`);
    const progEl = document.getElementById(`upload-prog-${i}`);

    if (itemEl) itemEl.classList.add("active-upload");
    if (statusEl) statusEl.textContent = "0%";
    if (progEl) progEl.style.width = "0%";

    const res = await window.syns.sftpUpload({
      sessionId: sftpSessionId,
      localPath: f.path,
      remotePath,
    });

    if (itemEl) itemEl.classList.remove("active-upload");
    if (res.ok) {
      successCount++;
      if (itemEl) itemEl.classList.add("done");
      if (statusEl) statusEl.textContent = "\u2714 Done";
    } else {
      if (itemEl) itemEl.classList.add("error");
      if (statusEl) statusEl.textContent = "\u2717 Error";
    }
  }

  _uploadingIndex = -1;
  document.getElementById("upload-close").style.display = "";
  document.getElementById("upload-cancel-btn").textContent = "Close";
  document.getElementById("upload-start-btn").style.display = "none";
  showSftpToast(
    `Uploaded ${successCount}/${_uploadFileList.length} file${_uploadFileList.length !== 1 ? "s" : ""} \u2714`,
  );
  sftpLoadDir(sftpCurrentPath);
}

async function downloadFile() {
  if (!_ctxItem || _ctxItem.dataset.type !== "file") return;
  const name = _ctxItem.dataset.name;
  const localPath = await window.syns.openSaveDialog(name);
  if (!localPath) return;

  showSftpOpBar(`Downloading ${name}…`, true);
  const res = await window.syns.sftpDownload({
    sessionId: sftpSessionId,
    remotePath: ctxFullPath(),
    localPath,
  });
  hideSftpOpBar();
  if (res.ok) showSftpToast(`Downloaded ${name} ✔`);
  else showSftpToast("Download failed: " + res.error);
}

function openNewFolderDialog() {
  const modal = document.getElementById("modal-rename");
  document.getElementById("rename-alert").innerHTML = "";
  document.getElementById("rename-input").value = "new-folder";
  modal.dataset.mode = "mkdir";
  document.querySelector("#modal-rename .modal-title").textContent =
    "New Folder";
  document.getElementById("btn-rename-apply").textContent = "Create";
  modal.classList.add("show");
  setTimeout(() => {
    const inp = document.getElementById("rename-input");
    inp.focus();
    inp.select();
  }, 50);
}

/* ─── Compress / Extract ─────────────────────────────────────────────── */
async function compressItem() {
  if (!_ctxItem) return;
  const name = _ctxItem.dataset.name;
  const dir = sftpCurrentPath.replace(/\/+$/, "") || "/";
  const zipName = name.replace(/[^a-zA-Z0-9._-]/g, "_") + ".zip";

  showSftpOpBar(`Compressing ${name}…`, false);
  const command = `cd "${dir}" && zip -r "${zipName}" "${name}" 2>&1`;
  const res = await window.syns.sftpExec({ sessionId: sftpSessionId, command });
  hideSftpOpBar();
  if (res.ok) {
    showSftpToast(`Created ${zipName} ✔`);
    sftpLoadDir(sftpCurrentPath);
  } else
    showSftpToast(
      "Compress failed: " + (res.error || res.output || "unknown error"),
    );
}

async function extractFile() {
  if (!_ctxItem || _ctxItem.dataset.type !== "file") return;
  const name = _ctxItem.dataset.name;
  const dir = sftpCurrentPath.replace(/\/+$/, "") || "/";
  const fp = ctxFullPath();

  let command;
  if (/\.zip$/i.test(name)) command = `unzip -o "${fp}" -d "${dir}" 2>&1`;
  else if (/\.(tar\.gz|tgz)$/i.test(name))
    command = `tar xzf "${fp}" -C "${dir}" 2>&1`;
  else if (/\.tar\.bz2$/i.test(name))
    command = `tar xjf "${fp}" -C "${dir}" 2>&1`;
  else if (/\.tar$/i.test(name)) command = `tar xf  "${fp}" -C "${dir}" 2>&1`;
  else if (/\.gz$/i.test(name))
    command = `cd "${dir}" && gunzip -k "${name}" 2>&1`;
  else {
    showSftpToast("Unsupported archive format");
    return;
  }

  showSftpOpBar(`Extracting ${name}…`, false);
  const res = await window.syns.sftpExec({ sessionId: sftpSessionId, command });
  hideSftpOpBar();
  if (res.ok) {
    showSftpToast(`Extracted ${name} ✔`);
    sftpLoadDir(sftpCurrentPath);
  } else
    showSftpToast(
      "Extract failed: " + (res.error || res.output || "unknown error"),
    );
}

/* ─── SFTP status helpers ────────────────────────────────────────────── */
function showSftpOpBar(text, showProgress) {
  const bar = document.getElementById("sftp-op-bar");
  const wrap = document.getElementById("sftp-op-progress-wrap");
  document.getElementById("sftp-op-text").textContent = text;
  wrap.style.display = showProgress ? "" : "none";
  bar.style.display = "flex";
}

function hideSftpOpBar() {
  document.getElementById("sftp-op-bar").style.display = "none";
  document.getElementById("sftp-op-progress-fill").style.width = "0%";
}

let _toastTimer = null;
function showSftpToast(msg, duration = 3000) {
  const el = document.getElementById("sftp-toast");
  el.textContent = msg;
  el.style.opacity = "1";
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.style.opacity = "0";
  }, duration);
}

/* ─── Chmod ──────────────────────────────────────────────────────────── */
function openChmodModal() {
  if (!_ctxItem) return;
  const perms = _ctxItem.dataset.perms || "";
  document.getElementById("chmod-filepath").textContent = ctxFullPath();
  document.getElementById("chmod-alert").innerHTML = "";

  // Parse rwxrwxrwx from perms string like '-rwxr-xr-x'
  const p = perms.length >= 10 ? perms.slice(1) : "---------";
  document.getElementById("chmod-ur").checked = p[0] === "r";
  document.getElementById("chmod-uw").checked = p[1] === "w";
  document.getElementById("chmod-ux").checked = p[2] === "x" || p[2] === "s";
  document.getElementById("chmod-gr").checked = p[3] === "r";
  document.getElementById("chmod-gw").checked = p[4] === "w";
  document.getElementById("chmod-gx").checked = p[5] === "x" || p[5] === "s";
  document.getElementById("chmod-or").checked = p[6] === "r";
  document.getElementById("chmod-ow").checked = p[7] === "w";
  document.getElementById("chmod-ox").checked = p[8] === "x" || p[8] === "t";
  syncChmodOctal();

  document.getElementById("modal-chmod").classList.add("show");
}

function syncChmodOctal() {
  const v = (id) => (document.getElementById("chmod-" + id).checked ? 1 : 0);
  const u = v("ur") * 4 + v("uw") * 2 + v("ux");
  const g = v("gr") * 4 + v("gw") * 2 + v("gx");
  const o = v("or") * 4 + v("ow") * 2 + v("ox");
  document.getElementById("chmod-octal").value = `${u}${g}${o}`;
}

function syncChmodCheckboxes() {
  const oct = document.getElementById("chmod-octal").value.trim();
  if (!/^[0-7]{3,4}$/.test(oct)) return;
  const digits = oct.length === 4 ? oct.slice(1) : oct; // ignore setuid/sticky for UI
  const bits = digits.split("").map((d) => parseInt(d));
  const set = (id, val) => {
    document.getElementById("chmod-" + id).checked = val;
  };
  set("ur", !!(bits[0] & 4));
  set("uw", !!(bits[0] & 2));
  set("ux", !!(bits[0] & 1));
  set("gr", !!(bits[1] & 4));
  set("gw", !!(bits[1] & 2));
  set("gx", !!(bits[1] & 1));
  set("or", !!(bits[2] & 4));
  set("ow", !!(bits[2] & 2));
  set("ox", !!(bits[2] & 1));
}

async function applyChmod() {
  const mode = document.getElementById("chmod-octal").value.trim();
  if (!/^[0-7]{3,4}$/.test(mode)) {
    showAlert("chmod-alert", "Invalid octal mode (e.g. 755 or 0755).", "error");
    return;
  }
  const btn = document.getElementById("btn-chmod-apply");
  btn.disabled = true;
  const res = await window.syns.sftpChmod({
    sessionId: sftpSessionId,
    path: ctxFullPath(),
    mode,
  });
  btn.disabled = false;
  if (res.ok) {
    closeChmodModal();
    sftpLoadDir(sftpCurrentPath); // refresh
  } else {
    showAlert("chmod-alert", res.error, "error");
  }
}

function closeChmodModal() {
  document.getElementById("modal-chmod").classList.remove("show");
}

/* ─── Rename ─────────────────────────────────────────────────────────── */
function openRenameModal() {
  if (!_ctxItem) return;
  document.getElementById("rename-alert").innerHTML = "";
  document.getElementById("rename-input").value = _ctxItem.dataset.name;
  document.getElementById("modal-rename").classList.add("show");
  setTimeout(() => {
    const inp = document.getElementById("rename-input");
    inp.focus();
    // Select name without extension
    const dot = inp.value.lastIndexOf(".");
    inp.setSelectionRange(0, dot > 0 ? dot : inp.value.length);
  }, 50);
}

async function applyRename() {
  const modal = document.getElementById("modal-rename");
  const newName = document.getElementById("rename-input").value.trim();
  if (!newName) return;
  const btn = document.getElementById("btn-rename-apply");
  btn.disabled = true;

  if (modal.dataset.mode === "mkdir") {
    const newPath = sftpCurrentPath.replace(/\/$/, "") + "/" + newName;
    const res = await window.syns.sftpMkdir({
      sessionId: sftpSessionId,
      path: newPath,
    });
    btn.disabled = false;
    if (res.ok) {
      closeRenameModal();
      sftpLoadDir(sftpCurrentPath);
    } else showAlert("rename-alert", res.error, "error");
    return;
  }

  const oldPath = ctxFullPath();
  const newPath = sftpCurrentPath.replace(/\/$/, "") + "/" + newName;
  const res = await window.syns.sftpRename({
    sessionId: sftpSessionId,
    oldPath,
    newPath,
  });
  btn.disabled = false;
  if (res.ok) {
    closeRenameModal();
    sftpLoadDir(sftpCurrentPath);
  } else showAlert("rename-alert", res.error, "error");
}

function closeRenameModal() {
  const modal = document.getElementById("modal-rename");
  modal.classList.remove("show");
  modal.dataset.mode = "";
  document.querySelector("#modal-rename .modal-title").textContent = "Rename";
  document.getElementById("btn-rename-apply").textContent = "Apply";
}

/* ─── Delete ─────────────────────────────────────────────────────────── */
async function confirmDelete() {
  if (!_ctxItem) return;
  const name = _ctxItem.dataset.name;
  const isDir = _ctxItem.dataset.type === "directory";
  if (
    !confirm(
      `Delete "${name}"?${isDir ? "\n\nNote: directory must be empty." : ""}`,
    )
  )
    return;
  const res = await window.syns.sftpDelete({
    sessionId: sftpSessionId,
    path: ctxFullPath(),
    isDir,
  });
  if (res.ok) {
    sftpLoadDir(sftpCurrentPath);
  } else {
    alert("Delete failed: " + res.error);
  }
}

/* ─── Path History & Recent Connections ─────────────────────────────── */
const MAX_HIST = 10;

function addToPathHistory(serverId, path) {
  if (!path || path === "/") return;
  if (!sftpPathHistory[serverId]) sftpPathHistory[serverId] = [];
  const hist = sftpPathHistory[serverId];
  const existing = hist.find((h) => h.path === path);
  if (existing) {
    existing.visitCount++;
    existing.lastVisit = Date.now();
  } else {
    hist.unshift({ path, visitCount: 1, pinned: false, lastVisit: Date.now() });
    // Keep all pinned + up to MAX_HIST non-pinned
    const nonPinned = hist.filter((h) => !h.pinned);
    if (nonPinned.length > MAX_HIST) {
      nonPinned.sort((a, b) => a.lastVisit - b.lastVisit);
      hist.splice(hist.indexOf(nonPinned[0]), 1);
    }
  }
  renderSidebarRecent();
  savePersistentData();
}

function addRecentConnection(serverId, type) {
  const idx = recentConnections.findIndex((r) => r.serverId === serverId);
  if (idx !== -1) recentConnections.splice(idx, 1);
  recentConnections.unshift({ serverId, type, time: Date.now() });
  if (recentConnections.length > 10) recentConnections.pop();
  renderSidebarRecent();
  savePersistentData();
}

function renderSidebarRecent() {
  const list = document.getElementById("recent-list");
  if (!list) return;
  if (!recentConnections.length) {
    list.innerHTML = '<div class="recent-empty">No recent connections</div>';
    return;
  }
  const seen = new Set();
  const unique = recentConnections.filter((r) => {
    if (seen.has(r.serverId)) return false;
    seen.add(r.serverId);
    return true;
  });
  list.innerHTML = unique
    .slice(0, 5)
    .map((conn) => {
      const server = serversCache.find((s) => s.id === conn.serverId);
      if (!server) return "";
      const hist = sftpPathHistory[conn.serverId] || [];
      const topPaths = [
        ...hist.filter((h) => h.pinned),
        ...hist
          .filter((h) => !h.pinned)
          .sort((a, b) => b.visitCount - a.visitCount),
      ].slice(0, 3);
      const pathRows = topPaths
        .map(
          (h) =>
            `<div class="recent-path-row" data-server="${conn.serverId}" data-path="${esc(h.path)}">${h.pinned ? "📌" : "🕐"} ${esc(h.path)}</div>`,
        )
        .join("");
      return `<div class="recent-server-item">
      <div class="recent-server" data-id="${conn.serverId}">
        <span class="dot dot-grey"></span>
        <span class="rs-name">${esc(server.name)}</span>
        <span class="rs-type">${conn.type.toUpperCase()}</span>
      </div>
      ${pathRows}
    </div>`;
    })
    .join("");

  list.querySelectorAll(".recent-server").forEach((el) => {
    el.addEventListener("click", () => connectSSH(parseInt(el.dataset.id)));
  });
  list.querySelectorAll(".recent-path-row").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const sid = parseInt(el.dataset.server);
      const path = el.dataset.path;
      sftpLastPath[sid] = path;
      if (_sftpServerId === sid && sftpSessionId) {
        navigateTo("sftp");
        sftpLoadDir(path);
      } else {
        connectSFTP(sid);
      }
    });
  });
}

function toggleHistoryPanel() {
  const panel = document.getElementById("sftp-history-panel");
  if (!panel) return;
  if (panel.style.display === "none" || !panel.style.display) {
    renderHistoryPanel();
    panel.style.display = "block";
  } else {
    panel.style.display = "none";
  }
}

function hideHistoryPanel() {
  const panel = document.getElementById("sftp-history-panel");
  if (panel) panel.style.display = "none";
}

function renderHistoryPanel() {
  const panel = document.getElementById("sftp-history-panel");
  if (!panel || !_sftpServerId) return;
  const hist = sftpPathHistory[_sftpServerId] || [];
  if (!hist.length) {
    panel.innerHTML =
      '<div style="padding:10px 16px;font-size:13px;color:var(--text2);">No history yet — navigate some directories first.</div>';
    return;
  }
  const sorted = [
    ...hist.filter((h) => h.pinned).sort((a, b) => b.visitCount - a.visitCount),
    ...hist
      .filter((h) => !h.pinned)
      .sort((a, b) => b.visitCount - a.visitCount),
  ];
  const serverName =
    serversCache.find((s) => s.id === _sftpServerId)?.name || "";
  panel.innerHTML = `
    <div class="hist-header">
      <span>&#x1F55B; History — ${esc(serverName)}</span>
      <span>${sorted.length} path${sorted.length !== 1 ? "s" : ""} &nbsp;·&nbsp; click to navigate &nbsp;·&nbsp; 📌 to pin</span>
    </div>
    ${sorted
      .map(
        (h) => `
      <div class="history-item${h.pinned ? " pinned" : ""}" data-path="${esc(h.path)}">
        <span class="hi-type">${h.pinned ? "📌" : "🕐"}</span>
        <span class="hi-path" title="${esc(h.path)}">${esc(h.path)}</span>
        <span class="hi-count">${h.visitCount}&times;</span>
        <button class="hi-pin" data-path="${esc(h.path)}" title="${h.pinned ? "Unpin" : "Pin"}">${h.pinned ? "📌" : "📍"}</button>
      </div>
    `,
      )
      .join("")}
  `;
  panel.querySelectorAll(".history-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".hi-pin")) return;
      hideHistoryPanel();
      sftpLoadDir(el.dataset.path);
    });
  });
  panel.querySelectorAll(".hi-pin").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const item = (sftpPathHistory[_sftpServerId] || []).find(
        (h) => h.path === btn.dataset.path,
      );
      if (item) item.pinned = !item.pinned;
      renderHistoryPanel();
      renderSidebarRecent();
    });
  });
}

/* ─── Helpers ────────────────────────────────────────────────────────── */
function isTextFile(name) {
  const ext = name.split(".").pop().toLowerCase();
  const textExts = new Set([
    "php",
    "html",
    "htm",
    "css",
    "js",
    "ts",
    "jsx",
    "tsx",
    "json",
    "xml",
    "yaml",
    "yml",
    "sh",
    "bash",
    "zsh",
    "conf",
    "ini",
    "env",
    "txt",
    "md",
    "log",
    "py",
    "rb",
    "rs",
    "go",
    "c",
    "cpp",
    "h",
    "java",
    "sql",
    "htaccess",
    "gitignore",
    "dockerfile",
    "nginx",
    "apache",
    "toml",
    "csv",
  ]);
  return textExts.has(ext) || !name.includes(".");
}

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showAlert(id, msg, type) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
}

function updateStrength(pwd) {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const colors = ["", "#ef4444", "#f59e0b", "#22c55e", "#4f8ef7"];
  const fill = document.getElementById("strength-fill");
  if (fill) {
    fill.style.width = score * 25 + "%";
    fill.style.background = colors[score];
  }
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const k = 1024,
    sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function fileIcon(name) {
  const ext = name.split(".").pop().toLowerCase();
  const map = {
    php: "&#x1F40D;",
    html: "&#x1F310;",
    htm: "&#x1F310;",
    css: "&#x1F3A8;",
    js: "&#x1F4C4;",
    ts: "&#x1F4C4;",
    jsx: "&#x1F4C4;",
    tsx: "&#x1F4C4;",
    py: "&#x1F40D;",
    sh: "&#x2699;&#xFE0F;",
    bash: "&#x2699;&#xFE0F;",
    conf: "&#x2699;&#xFE0F;",
    yaml: "&#x2699;&#xFE0F;",
    yml: "&#x2699;&#xFE0F;",
    json: "&#x1F4CB;",
    md: "&#x1F4DD;",
    txt: "&#x1F4DD;",
    log: "&#x1F4CB;",
    png: "&#x1F5BC;&#xFE0F;",
    jpg: "&#x1F5BC;&#xFE0F;",
    jpeg: "&#x1F5BC;&#xFE0F;",
    gif: "&#x1F5BC;&#xFE0F;",
    svg: "&#x1F5BC;&#xFE0F;",
    zip: "&#x1F4E6;",
    tar: "&#x1F4E6;",
    gz: "&#x1F4E6;",
    sql: "&#x1F5C4;&#xFE0F;",
    db: "&#x1F5C4;&#xFE0F;",
    env: "&#x1F511;",
  };
  return map[ext] || "&#x1F4C4;";
}

/* ─── Settings page ──────────────────────────────────────────────────── */
let _settings = null;

async function initSettingsPage() {
  _settings = await window.syns.settingsGet();
  if (!_settings)
    _settings = {
      theme: "dark",
      proxy: {
        enabled: false,
        type: "socks5",
        host: "",
        port: 1080,
        username: "",
        password: "",
      },
    };

  applySettingsToUI(_settings);

  // Theme buttons
  document.querySelectorAll(".theme-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".theme-opt")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      initThemeApply(btn.dataset.themeOpt);
    });
  });

  // Proxy enable toggle
  const proxyToggle = document.getElementById("stg-proxy-enabled");
  const proxyFields = document.getElementById("proxy-fields");
  proxyToggle?.addEventListener("change", () => {
    proxyFields.classList.toggle("proxy-fields-active", proxyToggle.checked);
  });

  // Test proxy
  document
    .getElementById("btn-test-proxy")
    ?.addEventListener("click", async () => {
      const result = document.getElementById("proxy-test-result");
      result.textContent = "⏳ Testing…";
      result.className = "proxy-test-result";
      const proxy = readProxyFromUI();
      const res = await window.syns.settingsTestProxy(proxy);
      if (res.ok) {
        result.textContent = "✅ Proxy reachable";
        result.className = "proxy-test-result proxy-test-ok";
      } else {
        result.textContent = `❌ ${res.error}`;
        result.className = "proxy-test-result proxy-test-fail";
      }
    });

  // Save
  document
    .getElementById("btn-save-settings")
    ?.addEventListener("click", async () => {
      const proxy = readProxyFromUI();
      const theme =
        document.querySelector(".theme-opt.active")?.dataset.themeOpt || "dark";
      _settings = { ..._settings, theme, proxy };
      await window.syns.settingsSet(_settings);
      showSftpToast("✅ Settings saved");
    });
}

function applySettingsToUI(s) {
  // Theme
  const theme = s.theme || "dark";
  document
    .querySelectorAll(".theme-opt")
    .forEach((b) => b.classList.remove("active"));
  document
    .querySelector(`.theme-opt[data-theme-opt="${theme}"]`)
    ?.classList.add("active");

  // Proxy
  const p = s.proxy || {};
  const toggle = document.getElementById("stg-proxy-enabled");
  if (toggle) toggle.checked = !!p.enabled;
  const fields = document.getElementById("proxy-fields");
  if (fields) fields.classList.toggle("proxy-fields-active", !!p.enabled);

  const setVal = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v ?? "";
  };
  setVal("stg-proxy-type", p.type || "socks5");
  setVal("stg-proxy-host", p.host || "");
  setVal("stg-proxy-port", p.port || 1080);
  setVal("stg-proxy-username", p.username || "");
  setVal("stg-proxy-password", p.password || "");
}

function readProxyFromUI() {
  const g = (id) => document.getElementById(id);
  return {
    enabled: g("stg-proxy-enabled")?.checked || false,
    type: g("stg-proxy-type")?.value || "socks5",
    host: g("stg-proxy-host")?.value?.trim() || "",
    port: parseInt(g("stg-proxy-port")?.value, 10) || 1080,
    username: g("stg-proxy-username")?.value?.trim() || "",
    password: g("stg-proxy-password")?.value || "",
  };
}

/* ─── Theme ──────────────────────────────────────────────────────────── */
function initThemeApply(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const icon = document.getElementById("theme-icon");
  if (icon) {
    icon.innerHTML =
      theme === "light"
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 6.3C8.85 6.3 6.3 8.85 6.3 12C6.3 15.15 8.85 17.7 12 17.7C15.15 17.7 17.7 15.15 17.7 12C17.7 8.85 15.15 6.3 12 6.3ZM12 3V4.8M12 19.2V21M3 12H4.8M19.2 12H21M5.1 5.1L6.4 6.4M17.6 17.6L18.9 18.9M18.9 5.1L17.6 6.4M6.4 17.6L5.1 18.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12.6 3.2C8.5 3.2 5.2 6.5 5.2 10.6C5.2 14.7 8.5 18 12.6 18C15.3 18 17.7 16.6 19 14.5C17.9 14.9 16.7 15.1 15.5 15.1C10.9 15.1 7.1 11.3 7.1 6.7C7.1 5.5 7.3 4.3 7.7 3.2C6.2 3.9 4.9 5.1 4.2 6.6C3.8 7.5 3.6 8.5 3.6 9.6C3.6 14.9 7.9 19.2 13.2 19.2C18.5 19.2 22.8 14.9 22.8 9.6C22.8 8.5 22.6 7.5 22.2 6.6C20.4 9 17.6 10.6 14.4 10.6C13.8 10.6 13.2 10.5 12.6 10.4V3.2Z" fill="currentColor"/></svg>`;
  }
  try {
    localStorage.setItem("syns-theme", theme);
  } catch (e) {}
}

function initTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  initThemeApply(current);

  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.addEventListener("click", () => {
      const now = document.documentElement.getAttribute("data-theme") || "dark";
      initThemeApply(now === "dark" ? "light" : "dark");
    });
  }
}

/* ─── About page ─────────────────────────────────────────────────────── */
let _aboutUpdateBound = false;
let _aboutUpdateState = {
  status: null,
  progress: null,
};
const REPO_RELEASES_URL = "https://github.com/aljailane/syns-man/releases";
const CHANGELOG_RAW_URL = "https://raw.githubusercontent.com/aljailane/syns-man/main/CHANGELOG.md";

/* ─── Changelog fetcher ──────────────────────────────────────────────── */

function _escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function _parseChangelog(md) {
  const lines = md.split("\n");
  const entries = [];
  let current = null;
  let sectionType = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // New version heading: ## [1.0.14] - 2026-05-03  OR  ## [1.0.14]
    const versionMatch = line.match(/^##\s+\[([^\]]+)\](?:\s*-\s*(.+))?/);
    if (versionMatch) {
      if (current) entries.push(current);
      current = { version: versionMatch[1].trim(), date: (versionMatch[2] || "").trim(), items: [] };
      sectionType = null;
      continue;
    }

    if (!current) continue;

    // Section headings: ### Added / Changed / Fixed / Removed
    const sectionMatch = line.match(/^###\s+(.+)/);
    if (sectionMatch) {
      sectionType = sectionMatch[1].toLowerCase();
      continue;
    }

    // List items
    const itemMatch = line.match(/^[-*]\s+(.+)/);
    if (itemMatch) {
      let text = itemMatch[1]
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/`(.+?)`/g, "<code>$1</code>");
      const type = (sectionType === "fixed" || sectionType === "fix") ? "fix"
                 : (sectionType === "removed") ? "removed"
                 : "feat";
      current.items.push({ type, text });
    }
  }
  if (current) entries.push(current);
  return entries;
}

function _renderChangelogEntries(entries) {
  if (!entries.length) return "";
  const appVer = (window.syns.appVersion || "").replace(/^v/, "");
  return entries.map((e, i) => {
    const isLatest = i === 0;
    const badgeClass = isLatest ? "cl-badge-latest" : "cl-badge-pre";
    const badgeLabel = isLatest ? "Latest" : "Stable";
    const dateStr = e.date ? `<span class="cl-date">${_escapeHtml(e.date)}</span>` : "";
    const items = e.items.map(it => {
      const cls = it.type === "fix" ? "cl-fix" : it.type === "removed" ? "cl-removed" : "cl-feat";
      const icon = it.type === "fix" ? "🔧" : it.type === "removed" ? "🗑" : "✨";
      return `<li class="${cls}">${icon} ${it.text}</li>`;
    }).join("\n");
    return `<div class="cl-entry">
  <div class="cl-header">
    <span class="cl-version">v${_escapeHtml(e.version)}</span>
    ${dateStr}
    <span class="cl-badge ${badgeClass}">${badgeLabel}</span>
  </div>
  ${items ? `<ul class="cl-list">${items}</ul>` : ""}
</div>`;
  }).join("\n");
}

async function loadChangelog() {
  const loading = document.getElementById("cl-loading");
  const error = document.getElementById("cl-error");
  const entries = document.getElementById("cl-entries");
  const fallback = document.getElementById("cl-fallback-link");

  if (fallback) {
    fallback.addEventListener("click", (e) => {
      e.preventDefault();
      if (window.syns.openExternal) window.syns.openExternal(REPO_RELEASES_URL);
    });
  }

  if (loading) loading.style.display = "flex";
  if (error) error.style.display = "none";

  try {
    const res = await fetch(CHANGELOG_RAW_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const parsed = _parseChangelog(text);
    if (loading) loading.style.display = "none";
    if (entries) entries.innerHTML = _renderChangelogEntries(parsed);
  } catch (err) {
    if (loading) loading.style.display = "none";
    if (error) error.style.display = "block";
  }
}

const UPDATE_STAGE_LABELS = {
  idle: "Idle",
  disabled: "Disabled",
  unsupported: "Unsupported",
  checking: "Checking",
  available: "Available",
  downloading: "Downloading",
  downloaded: "Ready to install",
  "up-to-date": "Up to date",
  installing: "Installing",
  error: "Error",
};

function aboutSetText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function formatUpdateSpeed(bytesPerSecond) {
  const n = Number(bytesPerSecond || 0);
  if (!n) return "0 B/s";
  return `${formatBytes(n)}/s`;
}

function renderAboutUpdateState() {
  const status = _aboutUpdateState.status || {};
  const progress = _aboutUpdateState.progress || null;
  const isLinux = window.syns.platform === "linux";

  const stage = status.stage || "idle";
  const stageLabel = UPDATE_STAGE_LABELS[stage] || stage;
  const defaultMessage = isLinux
    ? "Linux updates are provided via repository releases"
    : "Update service is ready";
  const message = status.message || defaultMessage;

  aboutSetText("about-update-stage", stageLabel);
  aboutSetText("about-update-message", message);
  aboutSetText(
    "about-update-current",
    status.currentVersion || window.syns.appVersion || "—",
  );
  aboutSetText("about-update-available", status.updateInfo?.version || "—");

  const fill = document.getElementById("about-update-progress-fill");
  const progText = document.getElementById("about-update-progress-text");
  if (fill) {
    const pct = progress
      ? Math.max(0, Math.min(100, Number(progress.percent || 0)))
      : 0;
    fill.style.width = `${pct}%`;
  }
  if (progText) {
    if (progress) {
      const pct = Math.round(Number(progress.percent || 0));
      progText.textContent = `${pct}% • ${formatUpdateSpeed(progress.bytesPerSecond)}`;
    } else {
      progText.textContent = "0%";
    }
  }

  const installBtn = document.getElementById("btn-install-update");
  if (installBtn && !isLinux) {
    installBtn.disabled = stage !== "downloaded";
    if (stage !== "installing") installBtn.classList.remove("is-loading");
  }

  // --- Update notification banner ---
  const banner = document.getElementById("about-update-banner");
  const bannerMsg = document.getElementById("about-update-banner-msg");
  const bannerInstall = document.getElementById("btn-banner-install");
  const bannerCheck = document.getElementById("btn-banner-check");
  const bannerRepo = document.getElementById("btn-banner-repo");

  const showBanner = ["available", "downloaded"].includes(stage);
  if (banner) {
    banner.style.display = showBanner ? "flex" : "none";
    banner.classList.toggle("is-ready", stage === "downloaded");
  }

  if (showBanner && bannerMsg) {
    const ver = status.updateInfo?.version ? ` (v${status.updateInfo.version})` : "";
    bannerMsg.textContent = `New update available${ver}! Visit GitHub Releases to download.`;
  }

  // Banner buttons: show "Go to Releases" for all platforms when update available
  if (bannerInstall) bannerInstall.style.display = "none";
  if (bannerCheck)   bannerCheck.style.display   = "none";
  if (bannerRepo)    bannerRepo.style.display     = showBanner ? "inline-flex" : "none";
}

function applySmartUpdateActions() {
  const checkBtn = document.getElementById("btn-check-update");
  const installBtn = document.getElementById("btn-install-update");
  const repoBtn = document.getElementById("btn-repo-update");

  if (checkBtn) checkBtn.style.display = "inline-flex";
  if (installBtn) installBtn.style.display = "none";
  if (repoBtn) repoBtn.style.display = "inline-flex";
}

function bindAboutUpdateRealtime() {
  if (_aboutUpdateBound) return;
  _aboutUpdateBound = true;

  if (window.syns.onUpdateStatus) {
    window.syns.onUpdateStatus((status) => {
      _aboutUpdateState.status = status || null;
      renderAboutUpdateState();
    });
  }

  if (window.syns.onUpdateProgress) {
    window.syns.onUpdateProgress((progress) => {
      _aboutUpdateState.progress = progress || null;
      renderAboutUpdateState();
    });
  }

  if (window.syns.updateGetState) {
    window.syns
      .updateGetState()
      .then((state) => {
        if (!state) return;
        _aboutUpdateState.status = state.status || null;
        _aboutUpdateState.progress = state.progress || null;
        renderAboutUpdateState();
      })
      .catch(() => {});
  }
}

async function requestUpdateCheck() {
  if (!window.syns.updateCheck) {
    showSftpToast("Update API is unavailable");
    return;
  }

  const btn = document.getElementById("btn-check-update");
  if (btn) {
    btn.disabled = true;
    btn.classList.add("is-loading");
  }

  try {
    const res = await window.syns.updateCheck();
    if (!res?.ok) {
      showSftpToast(`Update check failed: ${res?.error || "unknown error"}`);
    }
  } catch {
    showSftpToast("Update check request failed");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove("is-loading");
    }
  }
}

async function requestUpdateInstall() {
  if (!window.syns.updateInstall) {
    showSftpToast("Update install API is unavailable");
    return;
  }

  const btn = document.getElementById("btn-install-update");
  if (btn) {
    btn.disabled = true;
    btn.classList.add("is-loading");
  }

  try {
    const res = await window.syns.updateInstall();
    if (!res?.ok) {
      showSftpToast(`Install failed: ${res?.error || "unknown error"}`);
      if (btn) {
        btn.disabled = false;
        btn.classList.remove("is-loading");
      }
      return;
    }
    showSftpToast("Restarting app to install update...");
  } catch {
    showSftpToast("Install request failed");
    if (btn) {
      btn.disabled = false;
      btn.classList.remove("is-loading");
    }
  }
}

function requestRepositoryUpdate() {
  if (!window.syns.openExternal) {
    showSftpToast("External links are unavailable");
    return;
  }

  window.syns.openExternal(REPO_RELEASES_URL);
  showSftpToast("Opened repository releases page");
}

function initAboutPage() {
  const platMap = { win32: "Windows", darwin: "macOS", linux: "Linux" };
  const ver = window.syns.appVersion || "1.0.0";
  const elec = window.syns.electronVersion || "—";
  const chr = window.syns.chromeVersion || "—";
  const node = window.syns.nodeVersion || "—";
  const plat = platMap[window.syns.platform] || window.syns.platform || "—";

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  set("about-version", ver);
  set("about-app-ver", ver);
  set("about-electron-ver", elec);
  set("about-chrome-ver", chr);
  set("about-node-ver", node);
  set("about-platform-name", plat);
  set("about-platform", `· ${plat}`);

  applySmartUpdateActions();

  if (window.syns.getAppVersion) {
    window.syns
      .getAppVersion()
      .then((v) => {
        if (v) {
          set("about-version", v);
          set("about-app-ver", v);
        }
      })
      .catch(() => {});
  }

  bindAboutUpdateRealtime();
  renderAboutUpdateState();

  document
    .getElementById("btn-check-update")
    ?.addEventListener("click", requestUpdateCheck);
  document
    .getElementById("btn-install-update")
    ?.addEventListener("click", requestUpdateInstall);
  document
    .getElementById("btn-repo-update")
    ?.addEventListener("click", requestRepositoryUpdate);

  // Banner buttons
  document
    .getElementById("btn-banner-install")
    ?.addEventListener("click", requestUpdateInstall);
  document
    .getElementById("btn-banner-check")
    ?.addEventListener("click", requestUpdateCheck);
  document
    .getElementById("btn-banner-repo")
    ?.addEventListener("click", requestRepositoryUpdate);

  document.querySelectorAll(".about-link[data-ext]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const url = a.dataset.ext;
      if (url && window.syns.openExternal) window.syns.openExternal(url);
    });
  });

  document.querySelectorAll(".about-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document
        .querySelectorAll(".about-tab")
        .forEach((t) => t.classList.remove("active"));
      document
        .querySelectorAll(".about-tab-panel")
        .forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      const panel = document.getElementById(`about-tab-${tab.dataset.tab}`);
      if (panel) panel.classList.add("active");
      if (tab.dataset.tab === "changelog") loadChangelog();
    });
  });
}

/* ─── Global update listener ─────────────────────────────────────────── */
let _globalUpdateNotifShown = false;
let _globalUpdateListenerBound = false;

function initGlobalUpdateListener() {
  // Reset notification flag each login so users always see the update toast
  _globalUpdateNotifShown = false;

  function handleUpdateStatus(status) {
    const stage = status?.stage;
    if (_globalUpdateNotifShown) return;
    if (stage !== "available" && stage !== "downloaded") return;
    _globalUpdateNotifShown = true;
    const ver = status.updateInfo?.version ? ` v${status.updateInfo.version}` : "";
    const action = "View Releases in About page";
    const msg =
      stage === "downloaded"
        ? `🔄 Update${ver} ready — restart to install`
        : `⬆️ New update${ver} available — ${action}`;
    showSftpToast(msg, 7000);
  }

  // Only register the IPC listener once per app session (it persists across logins)
  if (!_globalUpdateListenerBound && window.syns.onUpdateStatus) {
    _globalUpdateListenerBound = true;
    window.syns.onUpdateStatus(handleUpdateStatus);
  }

  // Always check current state on login (startup check may have already completed)
  if (window.syns.updateGetState) {
    window.syns
      .updateGetState()
      .then((state) => {
        if (state?.status) handleUpdateStatus(state.status);
      })
      .catch(() => {});
  }
}

/* ─── Boot ───────────────────────────────────────────────────────────── */
boot();
