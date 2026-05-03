const { app, BrowserWindow, ipcMain, dialog, screen } = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");
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

function getUpdateSupportState() {
  if (!app.isPackaged) {
    return {
      enabled: false,
      stage: "disabled",
      reason: "Auto-update is disabled in development mode",
    };
  }

  if (process.platform !== "win32") {
    return {
      enabled: false,
      stage: "unsupported",
      reason: "Auto-update is currently supported on Windows builds only",
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

async function checkForUpdates(source = "manual") {
  const support = getUpdateSupportState();
  if (!support.enabled) {
    setUpdateStatus(support.stage, support.reason, {
      source,
      currentVersion: app.getVersion(),
    });
    return {
      ok: true,
      error: null,
      state: getUpdateState(),
    };
  }

  if (updateCheckInFlight) return updateCheckInFlight;

  updateCheckInFlight = (async () => {
    try {
      setUpdateStatus("checking", "Checking for updates...", {
        source,
        currentVersion: app.getVersion(),
      });
      const result = await autoUpdater.checkForUpdates();
      return {
        ok: true,
        updateInfo: result?.updateInfo || null,
        state: getUpdateState(),
      };
    } catch (error) {
      const message = error?.message || String(error);

      if (message.includes("404") || message.includes("Not Found")) {
        setUpdateStatus("up-to-date", "No updates available (No release found).", {
          source,
          currentVersion: app.getVersion(),
        });
        return { ok: true, updateInfo: null, state: getUpdateState() };
      }

      setUpdateStatus("error", `Update check failed: ${message}`, {
        source,
        currentVersion: app.getVersion(),
      });
      return { ok: false, error: message, state: getUpdateState() };
    }
  })();

  try {
    return await updateCheckInFlight;
  } finally {
    updateCheckInFlight = null;
  }
}

function setupAutoUpdater() {
  const support = getUpdateSupportState();
  if (!support.enabled) {
    setUpdateStatus(support.stage, support.reason, {
      currentVersion: app.getVersion(),
    });
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    setUpdateStatus("checking", "Checking for updates...", {
      currentVersion: app.getVersion(),
    });
  });

  autoUpdater.on("update-available", (info) => {
    setUpdateStatus(
      "available",
      `Update ${info?.version || ""} found. Downloading...`,
      {
        currentVersion: app.getVersion(),
        updateInfo: info || null,
      },
    );
  });

  autoUpdater.on("update-not-available", (info) => {
    setUpdateProgress(null);
    setUpdateStatus(
      "up-to-date",
      `You are on the latest version (${app.getVersion()})`,
      {
        currentVersion: app.getVersion(),
        updateInfo: info || null,
      },
    );
  });

  autoUpdater.on("download-progress", (progress) => {
    const normalized = {
      percent: Number(progress?.percent || 0),
      bytesPerSecond: Number(progress?.bytesPerSecond || 0),
      transferred: Number(progress?.transferred || 0),
      total: Number(progress?.total || 0),
      at: new Date().toISOString(),
    };
    setUpdateProgress(normalized);
    setUpdateStatus(
      "downloading",
      `Downloading update... ${Math.round(normalized.percent)}%`,
      {
        currentVersion: app.getVersion(),
      },
    );
  });

  autoUpdater.on("update-downloaded", (info) => {
    setUpdateStatus(
      "downloaded",
      "Update downloaded. Restart app to install now.",
      {
        currentVersion: app.getVersion(),
        updateInfo: info || null,
        canInstall: true,
      },
    );
  });

  autoUpdater.on("error", (error) => {
    const message = error?.message || String(error);
    setUpdateStatus("error", `Updater error: ${message}`, {
      currentVersion: app.getVersion(),
    });
  });

  setTimeout(() => {
    checkForUpdates("startup").catch(() => {});
  }, UPDATE_STARTUP_DELAY_MS);
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
    const support = getUpdateSupportState();
    if (!support.enabled) {
      return {
        ok: false,
        error: support.reason,
      };
    }

    if (lastUpdateStatus.stage !== "downloaded") {
      return {
        ok: false,
        error: "No downloaded update is ready to install yet.",
        state: getUpdateState(),
      };
    }

    setUpdateStatus("installing", "Restarting to install update...", {
      currentVersion: app.getVersion(),
    });

    setImmediate(() => {
      try {
        autoUpdater.quitAndInstall(false, true);
      } catch {}
    });

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
