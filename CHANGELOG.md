# SYNS Man — Changelog

All notable changes to this project are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.0.22] - 2026-05-09

### Added
- SSH key Browse button: folder icon, accent-colored border (`btn-browse-key` class).
- Hint text below key path input: «Accepts: id_rsa, id_ed25519, id_ecdsa, *.pem — not .pub or .ppk».
- New CSS classes: `.btn-browse-key`, `.key-path-readonly`, `.form-hint`.

### Fixed
- SSH key file picker now opens `~/.ssh` by default and shows **all files** (including extensionless keys like `id_ed25519`).
- Previous `extensions: ["pem", "key", ""]` caused the dialog to hide files; replaced with `extensions: ["*"]`.
- Selecting a `.pub` or `.ppk` file now shows a warning toast instead of silently accepting.
- Update notification: separated `_globalUpdateListenerBound` from `_globalUpdateNotifShown` flags so the banner correctly re-appears after login.

---

## [1.0.21] - 2026-05-09

### Fixed
- Removed deprecated `signingHashAlgorithms` and `certificateSubjectName` from `win` build config — caused electron-builder 26.x schema validation error.

---

## [1.0.20] - 2026-05-09

### Changed
- Removed macOS support entirely: `release-mac` job deleted from GitHub Actions workflow and `mac` section removed from `package.json`.
- Build targets are now Linux (AppImage, deb, rpm) and Windows (nsis, portable) only.

### Fixed
- Version-from-tag step now runs correctly in both Linux and Windows CI jobs.

---

## [1.0.19] - 2026-05-09

### Fixed
- macOS build: added `CSC_IDENTITY_AUTO_DISCOVERY: false` to prevent code-signing failure when no certificate is configured.
- CI: added "Set version from tag" step — artifact names now reflect the release tag instead of the version hardcoded in `package.json`.
- Update detection: fixed logic that prevented the update notification banner from appearing on subsequent logins.

---

## [1.0.18] - 2026-05-09

### Changed
- GitHub Actions: upgraded `actions/checkout` to v6 and `actions/setup-node` to v6 with Node.js 24 to eliminate Node.js 20 deprecation warnings.

### Fixed
- Windows build environment: set `CSC_IDENTITY_AUTO_DISCOVERY: false` in CI to allow unsigned Windows builds without errors.

---

## [1.0.17] - 2026-05-04

### Fixed
- NSIS installer now correctly replaces previous installation instead of registering as a new app (added explicit `guid` to NSIS config).
- Added `uninstallDisplayName` so the app appears consistently in Windows "Add/Remove Programs".

### Added
- Code signing support for Windows builds via GitHub Secrets (`WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`).
- Code signing support for macOS builds via GitHub Secrets (`MAC_CERT_P12`, `MAC_CERT_PASSWORD`, `APPLE_ID`, `APPLE_ID_PASSWORD`, `APPLE_TEAM_ID`).
- Builds proceed normally without signing if secrets are not set.

### Changed
- `CHANGELOG.md` rewritten to cover all releases from v0.5.0 to present.

---

## [1.0.16] - 2026-05-04

### Fixed
- Changelog tab could not load: `Content-Security-Policy` blocked outbound `fetch()` to `raw.githubusercontent.com`. Added `connect-src` for GitHub domains.

### Added
- macOS build targets added to GitHub Actions (`release-mac` job): produces `.dmg` and `.zip` for both **x64** and **arm64** (Apple Silicon).
- macOS build config added to `package.json` under `"mac"`.

---

## [1.0.15] - 2026-05-04

### Added
- In-app changelog now fetched live from GitHub (`CHANGELOG.md`) — always up to date without rebuilding.
- Changelog tab shows a spinner while loading and a fallback "View on GitHub" link on network error.
- Result is cached in memory; GitHub is only contacted once per app session.

### Changed
- Removed all hardcoded changelog HTML from `index.html` — content is fully dynamic.

---

## [1.0.14] - 2026-05-03

### Added
- **Multi-color themes**: Ocean (cyan), Forest (green), Violet (purple), and Rose (red/pink) — alongside existing Dark and Light.
- Theme buttons in Settings show a colored dot for each theme.
- **Remember username**: After a successful login, the username is saved to `localStorage`. On next visit the field is pre-filled (transparent style) with a **"change"** link to reset it.

### Changed
- Update system completely overhauled: removed `electron-updater` and all auto-download logic. All platforms now use the GitHub API (`/releases/latest`) for version checking only.
- When an update is available, a notification banner appears with a "Go to GitHub Releases" button — no background downloads.
- Update banner and action buttons now behave identically on Windows, Linux, and macOS.

### Fixed
- Eliminated checksum mismatch errors caused by the Windows auto-downloader.
- GitHub Actions workflow restructured: each platform job creates/updates the GitHub Release independently (`overwrite: true`), eliminating race conditions between `latest.yml` and installer artifacts.

---

## [1.0.13] - 2026-05-03

### Fixed
- GitHub Actions workflow: added `overwrite: true` to release upload step — eliminates race conditions when multiple jobs upload artifacts to the same release.
- Update check: gracefully handles 404 responses from the GitHub releases API instead of throwing an unhandled error.
- Improved checksum error handling during update verification.

---

## [1.0.12] - 2026-05-03

### Fixed
- Windows artifact now uses an explicit `artifactName` with dashes (`SYNS-Man-Setup-${version}.${ext}`) to prevent spaces in filenames breaking download links.

---

## [1.0.11] - 2026-05-03

### Added
- `README.md` with full project description, screenshots, and installation instructions.

### Fixed
- License field corrected from `ISC` to `MIT` in both `package.json` and the About page.

---

## [1.0.10] - 2026-05-03

### Fixed
- CI pipeline artifacts now upload correctly to GitHub Releases.
- Separated build step from publish step — `electron-builder` no longer conflicts with release creation.

---

## [1.0.9] - 2026-05-03

### Fixed
- CI race condition resolved — GitHub Release is now created before build jobs start.
- Node.js 20 deprecation warning removed from GitHub Actions.

### Added
- Dedicated `create-release` job in CI with auto-generated release notes.

---

## [1.0.8] - 2026-05-03

### Added
- Cross-platform update check via GitHub API (Linux / macOS).
- Startup auto-check on all platforms when running as a packaged app.
- Global toast notification when an update is available or downloaded.
- "Check for Updates" button visible on all platforms.

### Fixed
- GitHub Actions: upgraded Node.js runner from 20 to 24.

---

## [1.0.7] - 2026-05-03

### Changed
- Removed "What's New" tab from About page — now shows Overview and Changelog only.
- Cleaned up unused `wn-*` CSS styles.

---

## [1.0.6] - 2026-05-03

### Added
- Update notification banner in About page (shown when update is available or downloaded).
- Smart About UI — in-app updater on Windows, repository link on Linux.

### Fixed
- Simplified update system: removed background polling, added mutex guard.
- Login form syntax error causing blank screen on submit.
- Removed duplicate `admin:reset` IPC handler causing startup crash.
- Reset password link moved inside auth card with English label.

### Changed
- Improved GitHub Actions workflow with separate Linux/Windows build jobs.

---

## [1.0.5] - 2026-05-01

### Added
- Password reset feature for the admin account.
- Reset link displayed on the login page.

---

## [1.0.4] - 2026-04-30

### Fixed
- GitHub Actions permissions for release publishing.

### Added
- AppImage target for Linux.

---

## [1.0.3] - 2026-04-30

### Changed
- Internal version bump; minor CI configuration adjustments prior to v1.0.4.

---

## [1.0.2] - 2026-04-30

### Added
- Realtime update flow using `electron-updater` (check → download progress → install).
- About page update center with live status, current/available version, and progress bar.
- Version workflow scripts: `version:sync`, `release:patch`, `release:minor`, `release:major`, `release:publish`, `build:all`, `update:dry`.
- `scripts/sync-version.js` to keep version metadata in sync.

### Fixed
- Startup crash in `main.js` (`SyntaxError: Unexpected end of input`).
- Initial window size now adapts to screen work-area to avoid oversized edges.

---

## [1.0.0] - 2026-04-29

### Added
- Initial public stable release.
- Theme toggle (Dark & Light) with persistent preference.
- About page with Overview and Changelog tabs and runtime info.
- Settings and About links in the sidebar.
- Port field moved next to the Authentication selector.

### Fixed
- Private Key path placeholder adapts to OS (Linux / macOS / Windows).
- Black screen caused by preload sandbox incompatibility.

---

## [0.9.0] - 2026-04-15

### Added
- SFTP file manager: upload, download, delete, rename, chmod.
- In-app file editor with CodeMirror and syntax highlighting.
- SFTP path history panel.

### Fixed
- SSH terminal resize support via `xterm-addon-fit`.
- Session persistence across app restarts.

---

## [0.5.0] - 2026-03-28

### Added
- SSH terminal via xterm.js.
- Server manager: add, edit, delete, quick connect.
- Password and SSH Key authentication.
- Encrypted credential storage with `bcryptjs`.
- Custom frameless window with traffic-light controls.
