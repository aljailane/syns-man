const { contextBridge, ipcRenderer, shell } = require("electron");
const { version: packageVersion } = require("./package.json");

contextBridge.exposeInMainWorld("syns", {
  // Platform & app info
  platform: process.platform,
  appVersion: packageVersion,
  electronVersion: process.versions.electron,
  chromeVersion: process.versions.chrome,
  nodeVersion: process.versions.node,
  openExternal: (url) => shell.openExternal(url),
  getAppVersion: () => ipcRenderer.invoke("app:getVersion"),

  // Update system
  updateGetState: () => ipcRenderer.invoke("update:getState"),
  updateCheck: () => ipcRenderer.invoke("update:check"),
  updateInstall: () => ipcRenderer.invoke("update:install"),
  onUpdateStatus: (cb) => ipcRenderer.on("update:status", (_, d) => cb(d)),
  onUpdateProgress: (cb) => ipcRenderer.on("update:progress", (_, d) => cb(d)),

  // Settings
  settingsGet: () => ipcRenderer.invoke("settings:get"),
  settingsSet: (s) => ipcRenderer.invoke("settings:set", s),
  settingsTestProxy: (p) => ipcRenderer.invoke("settings:testProxy", p),

  // Window controls
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),

  // Admin
  adminExists: () => ipcRenderer.invoke("admin:exists"),
  adminSetup: (data) => ipcRenderer.invoke("admin:setup", data),
  adminLogin: (data) => ipcRenderer.invoke("admin:login", data),

  // Servers
  serversList: () => ipcRenderer.invoke("servers:list"),
  serversGet: (id) => ipcRenderer.invoke("servers:get", id),
  serversAdd: (s) => ipcRenderer.invoke("servers:add", s),
  serversUpdate: (s) => ipcRenderer.invoke("servers:update", s),
  serversDelete: (id) => ipcRenderer.invoke("servers:delete", id),

  // SSH
  sshConnect: (data) => ipcRenderer.invoke("ssh:connect", data),
  sshSend: (data) => ipcRenderer.send("ssh:send", data),
  sshResize: (data) => ipcRenderer.send("ssh:resize", data),
  sshDisconnect: (data) => ipcRenderer.send("ssh:disconnect", data),
  onSshData: (cb) => ipcRenderer.on("ssh:data", (_, d) => cb(d)),
  onSshClosed: (cb) => ipcRenderer.on("ssh:closed", (_, d) => cb(d)),

  sftpConnect: (data) => ipcRenderer.invoke("sftp:connect", data),
  sftpList: (data) => ipcRenderer.invoke("sftp:list", data),
  sftpDisconnect: (data) => ipcRenderer.invoke("sftp:disconnect", data),
  sftpMkdir: (data) => ipcRenderer.invoke("sftp:mkdir", data),
  sftpUpload: (data) => ipcRenderer.invoke("sftp:upload", data),
  sftpDownload: (data) => ipcRenderer.invoke("sftp:download", data),
  sftpExec: (data) => ipcRenderer.invoke("sftp:exec", data),
  sftpReadFile: (data) => ipcRenderer.invoke("sftp:readFile", data),
  sftpWriteFile: (data) => ipcRenderer.invoke("sftp:writeFile", data),
  sftpChmod: (data) => ipcRenderer.invoke("sftp:chmod", data),
  sftpRename: (data) => ipcRenderer.invoke("sftp:rename", data),
  sftpDelete: (data) => ipcRenderer.invoke("sftp:delete", data),
  onSftpProgress: (cb) => ipcRenderer.on("sftp:progress", (_, d) => cb(d)),

  // File dialogs
  openKeyFile: () => ipcRenderer.invoke("dialog:openKeyFile"),
  openUploadDialog: () => ipcRenderer.invoke("dialog:openUploadFiles"),
  openSaveDialog: (filename) =>
    ipcRenderer.invoke("dialog:saveTo", { filename }),
});
