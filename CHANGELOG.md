# SYNS Man Changelog

All notable changes to this project are documented in this file.

## [1.0.14] - 2026-05-03

### Added
- **Multi-color themes**: Ocean, Forest, Violet, and Rose themes added alongside existing Dark and Light.
- **Remember username**: Login page now pre-fills the last used username with a transparent field style; includes a "change" link to reset it.

### Changed
- **Update system**: Removed auto-download (electron-updater). All platforms now use GitHub API for version checking only — a notification appears with a "Go to Releases" link when an update is available.
- Update banner and action buttons now consistently point to GitHub Releases on all platforms.

### Fixed
- Eliminated checksum mismatch errors caused by the old Windows auto-downloader.
- GitHub Actions workflow now creates Releases directly from each build job (no separate `create-release` step) preventing race conditions between `latest.yml` and installer artifacts.

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
