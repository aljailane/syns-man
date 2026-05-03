# SYNS Man Changelog

All notable changes to this project are documented in this file.

## [1.0.2] - 2026-05-01

### Added
- Realtime update flow using `electron-updater` (check, download progress, install).
- About page update center with live status, current/available version, and progress bar.
- Version/release workflow scripts:
  - `version:sync`
  - `release:patch`
  - `release:minor`
  - `release:major`
  - `release:publish`
  - `build:all`
  - `update:dry`
- New `scripts/sync-version.js` to synchronize version metadata.

### Fixed
- Startup crash in `main.js` (`SyntaxError: Unexpected end of input`).
- Initial window size now adapts to screen/work area to avoid oversized window edges.

### Changed
- Project version bumped to `1.0.2`.
- In-app changelog updated with `v1.0.2` entry.

## [1.0.0] - 2026-04-29

### Added
- Initial public stable release.
- SSH terminal manager.
- SFTP file browser and operations.
- Theme toggle and About tabs.
