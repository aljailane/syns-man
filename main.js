const { app, BrowserWindow, ipcMain, dialog, screen, shell } = require("electron");
const path = require("path");
const https = require("https");
const { registerHandlers } = require("./src/ipc-handlers");

let mainWindow;
const UPDATE_STARTUP_DELAY_MS = 3000;

let lastUpdateStatus = {
  stage: "idle",
  message: "Updater is idle",
  at: new Date().toISOString(),
};
let lastUpdateProgress = null;
let updateCheckInFlight = null;

function fetchLatestGitHubRelease() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path: "/repos/aljailane/syns-man/releases/latest",
      headers: { "User-Agent": "syns-man-updater/1.0" },
    };
    https
      .get(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

function compareVersions(a, b) {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

function getUpdateSupportState() {
  if (!app.isPackaged) {
    return {
      enabled: false,
      stage: "disabled",
      reason: "Auto-update is disabled in development mode",
    };
  }

  return { enabled: true };
}

function emitToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.send(channel, payload);
  } catch {}
}

function setUpdateStatus(stage, message, extra = {}) {
  lastUpdateStatus = {
    stage,
    message,
    ...extra,
    at: new Date().toISOString(),
  };
  emitToRenderer("update:status", lastUpdateStatus);
}

function setUpdateProgress(progress) {
  lastUpdateProgress = progress;
  emitToRenderer("update:progress", lastUpdateProgress);
}

function getUpdateState() {
  return {
    status: lastUpdateStatus,
    progress: lastUpdateProgress,
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
  };
}

async function checkVersionViaGitHub(source) {
  setUpdateStatus("checking", "Checking for updates...", {
    source,
    currentVersion: app.getVersion(),
  });
  try {
    const release = await fetchLatestGitHubRelease();
    const latestVersion = (release?.tag_name || "").replace(/^v/, "");
    const currentVersion = app.getVersion();
    if (!latestVersion) {
      setUpdateStatus("up-to-date", "Could not determine latest version.", {
        source,
        currentVersion,
      });
      return { ok: true, updateInfo: null, state: getUpdateState() };
    }
    if (compareVersions(latestVersion, currentVersion) > 0) {
      setUpdateStatus(
        "available",
        `New version v${latestVersion} is available!`,
        {
          source,
          currentVersion,
          updateInfo: { version: latestVersion, releaseUrl: release.html_url },
        },
      );
    } else {
      setUpdateStatus(
        "up-to-date",
        `You are on the latest version (${currentVersion})`,
        { source, currentVersion, updateInfo: { version: latestVersion } },
      );
    }
    return {
      ok: true,
      updateInfo: { version: latestVersion },
      state: getUpdateState(),
    };
  } catch (error) {
    const message = error?.message || String(error);
    setUpdateStatus("error", `Update check failed: ${message}`, {
      source,
      currentVersion: app.getVersion(),
    });
    return { ok: false, error: message, state: getUpdateState() };
  }
}

async function checkForUpdates(source = "manual") {
  if (!app.isPackaged) {
    setUpdateStatus("disabled", "Auto-update is disabled in development mode", {
      source,
      currentVersion: app.getVersion(),
    });
    return { ok: true, error: null, state: getUpdateState() };
  }

  if (updateCheckInFlight) return updateCheckInFlight;

  // All platforms: version check via GitHub API only (notification, no auto-download)
  updateCheckInFlight = checkVersionViaGitHub(source);
  try {
    return await updateCheckInFlight;
  } finally {
    updateCheckInFlight = null;
  }
}

function setupAutoUpdater() {
  setUpdateStatus(
    app.isPackaged ? "idle" : "disabled",
    app.isPackaged
      ? "Update service ready"
      : "Auto-update is disabled in development mode",
    { currentVersion: app.getVersion() },
  );

  // Startup check runs for ALL platforms when packaged
  if (app.isPackaged) {
    setTimeout(() => {
      checkForUpdates("startup").catch(() => {});
    }, UPDATE_STARTUP_DELAY_MS);
  }
}

function createWindow() {
  const { workAreaSize } = screen.getPrimaryDisplay();

  const width = Math.min(
    workAreaSize.width,
    Math.max(
      Math.floor(workAreaSize.width * 0.88),
      Math.min(900, workAreaSize.width),
    ),
  );
  const height = Math.min(
    workAreaSize.height,
    Math.max(
      Math.floor(workAreaSize.height * 0.9),
      Math.min(620, workAreaSize.height),
    ),
  );

  const minWidth = Math.min(860, workAreaSize.width);
  const minHeight = Math.min(560, workAreaSize.height);

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth,
    minHeight,
    center: true,
    backgroundColor: "#0d1117",
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.webContents.on("did-finish-load", () => {
    emitToRenderer("update:status", lastUpdateStatus);
    if (lastUpdateProgress)
      emitToRenderer("update:progress", lastUpdateProgress);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function setupCoreIpc() {
  ipcMain.handle("app:getVersion", () => app.getVersion());

  ipcMain.on("window:minimize", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.minimize();
  });

  ipcMain.on("window:maximize", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });

  ipcMain.on("window:close", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.close();
  });

  ipcMain.handle("dialog:openKeyFile", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select private key file",
      properties: ["openFile"],
      filters: [
        { name: "Key files", extensions: ["pem", "ppk", "key", "pub"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
    if (result.canceled || !result.filePaths?.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("dialog:openUploadFiles", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select file(s) to upload",
      properties: ["openFile", "multiSelections"],
    });
    if (result.canceled) return [];
    return result.filePaths || [];
  });

  ipcMain.handle("dialog:saveTo", async (_, { filename }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Save file",
      defaultPath: filename || "downloaded-file",
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });

  ipcMain.handle("update:getState", () => getUpdateState());

  ipcMain.handle("update:check", async () => {
    return checkForUpdates("manual");
  });

  ipcMain.handle("update:install", async () => {
    // Open GitHub releases page for manual download
    shell.openExternal("https://github.com/aljailane/syns-man/releases/latest");
    return { ok: true };
  });
}

app.whenReady().then(() => {
  setupCoreIpc();
  registerHandlers();
  createWindow();
  setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  updateCheckInFlight = null;
});
