# SYNS Man

A desktop SSH / SFTP manager built with Electron. Connect to remote servers, manage files over SFTP, and run commands over SSH — all from a clean, minimal interface.

---

## Features

- SSH terminal sessions
- SFTP file browser (upload, download, rename, delete)
- Save and manage multiple server connections
- Secure local credential storage
- Auto-update support (Windows) / update notifications (Linux & macOS)

---

## Download

Pre-built binaries are available on the [Releases](https://github.com/aljailane/syns-man/releases) page.

| Platform | File |
|----------|------|
| Windows  | `SYNS-Man-Setup-x.x.x.exe` (installer) or `SYNS-Man-x.x.x.exe` (portable) |
| Linux    | `SYNS-Man-x.x.x.AppImage`, `.deb`, or `.rpm` |

### Linux (AppImage)

```bash
chmod +x SYNS-Man-*.AppImage
./SYNS-Man-*.AppImage
```

### Linux (deb)

```bash
sudo dpkg -i syns_*.deb
```

### Linux (rpm)

```bash
sudo rpm -i syns-*.rpm
```

---

## Development

### Requirements

- [Node.js](https://nodejs.org/) v18 or later
- npm

### Setup

```bash
git clone https://github.com/aljailane/syns-man.git
cd syns-man
npm install
```

### Run

```bash
npm start
```

### Build (local — Linux only)

```bash
# AppImage + deb + rpm
npx electron-builder --linux AppImage deb rpm --x64 --publish never
```

> Windows builds require [Wine](https://www.winehq.org/) on Linux, or run on a Windows machine.

### Release a new version

```bash
# Bump version (patch / minor / major)
npm run release:patch

# Tag and push — GitHub Actions builds and publishes automatically
git add -A
git commit -m "v$(node -p "require('./package.json').version")"
git tag v$(node -p "require('./package.json').version")
git push origin main --tags
```

---

## Tech Stack

- [Electron](https://www.electronjs.org/) v41
- [electron-builder](https://www.electron.build/) — packaging & distribution
- [electron-updater](https://www.electron.build/auto-update) — auto-update (Windows)
- [ssh2](https://github.com/mscdex/ssh2) — SSH & SFTP protocol
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — local database

---

## License

MIT © [aljailane](https://github.com/aljailane)

