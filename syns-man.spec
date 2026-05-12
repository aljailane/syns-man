Name:           syns-man
Version:        1.0.23
Release:        1%{?dist}
Summary:        SSH / SFTP Manager

License:        MIT
URL:            https://github.com/aljailane/syns-man
Source0:        https://github.com/aljailane/syns-man/releases/download/v%{version}/SYNS-Man-%{version}.AppImage

BuildArch:      x86_64
BuildRequires:  desktop-file-utils
BuildRequires:  libappstream-glib

Requires:       libX11
Requires:       libXcomposite
Requires:       libXdamage
Requires:       libXext
Requires:       libXfixes
Requires:       libXrandr
Requires:       libxcb
Requires:       mesa-libGL
Requires:       nss
Requires:       nspr
Requires:       atk
Requires:       at-spi2-atk
Requires:       cups-libs
Requires:       libdrm
Requires:       gtk3
Requires:       pango
Requires:       alsa-lib

%description
SYNS Man is a modern, cross-platform SSH and SFTP manager built with Electron.

Features:
  - SSH terminal with full xterm.js support
  - SFTP file manager: upload, download, delete, rename, chmod
  - In-app file editor with syntax highlighting (CodeMirror)
  - Password and SSH key authentication (id_rsa, id_ed25519, id_ecdsa, *.pem)
  - Encrypted credential storage
  - Multi-color themes: Dark, Light, Ocean, Forest, Violet, Rose
  - In-app changelog fetched live from GitHub
  - Update notifications via GitHub Releases API

%prep
# No source extraction needed for AppImage packaging

%build
# Nothing to compile

%install
install -Dm755 %{SOURCE0} %{buildroot}%{_libdir}/%{name}/%{name}.AppImage

# Wrapper launcher script
mkdir -p %{buildroot}%{_bindir}
cat > %{buildroot}%{_bindir}/%{name} <<'EOF'
#!/bin/sh
exec %{_libdir}/%{name}/%{name}.AppImage --no-sandbox "$@"
EOF
chmod 755 %{buildroot}%{_bindir}/%{name}

# Desktop entry
install -Dm644 /dev/stdin %{buildroot}%{_datadir}/applications/com.syns.app.desktop <<'EOF'
[Desktop Entry]
Name=SYNS Man
Comment=SSH / SFTP Manager
Exec=syns-man %U
Icon=com.syns.app
Terminal=false
Type=Application
Categories=Network;RemoteAccess;FileTransfer;Utility;
Keywords=SSH;SFTP;terminal;server;remote;
StartupWMClass=syns-man
EOF

# AppStream metainfo
install -Dm644 %{_builddir}/com.syns.app.metainfo.xml \
    %{buildroot}%{_datadir}/metainfo/com.syns.app.metainfo.xml || true

%check
desktop-file-validate %{buildroot}%{_datadir}/applications/com.syns.app.desktop

%files
%license LICENSE
%{_libdir}/%{name}/
%{_bindir}/%{name}
%{_datadir}/applications/com.syns.app.desktop
%{_datadir}/metainfo/com.syns.app.metainfo.xml

%changelog
* Mon May 12 2026 SYNS Man <contact@syns-man> - 1.0.23-1
- Login page redesigned with greeting card and avatar when username is remembered
- Password-only input when username is already saved
- Removed Arabic UI strings; all labels now in English
- Removed misleading switch-user button

* Fri May 09 2026 SYNS Man <contact@syns-man> - 1.0.22-1
- SSH key Browse button opens ~/.ssh by default and shows all files
- Selecting .pub or .ppk file now shows a warning toast
- Update notification banner re-appears correctly after login

* Fri May 09 2026 SYNS Man <contact@syns-man> - 1.0.20-1
- Removed macOS support; build targets are Linux and Windows only

* Sat May 03 2026 SYNS Man <contact@syns-man> - 1.0.14-1
- Multi-color themes: Ocean, Forest, Violet, Rose
- Remember username across sessions
- Update system overhauled — GitHub API only, no background downloads

* Tue Apr 29 2026 SYNS Man <contact@syns-man> - 1.0.0-1
- Initial public stable release
