const Store = require('electron-store');

let store;

function getDb() {
  if (!store) {
    store = new Store({
      name: 'syns-data',
      defaults: {
        admin: null,
        servers: [],
        nextServerId: 1,
        settings: {
          theme: 'dark',
          proxy: {
            enabled: false,
            type: 'socks5',   // 'socks5' | 'socks4' | 'http'
            host: '',
            port: 1080,
            username: '',
            password: '',
          },
        },
      },
    });
  }
  return store;
}

// ── Admin helpers ──────────────────────────────────────────────────────
function getAdmin()             { return getDb().get('admin'); }
function setAdmin(admin)        { getDb().set('admin', admin); }

// ── Server helpers ─────────────────────────────────────────────────────
function getServers()           { return getDb().get('servers') || []; }
function setServers(list)       { getDb().set('servers', list); }
function nextId() {
  const id = getDb().get('nextServerId');
  getDb().set('nextServerId', id + 1);
  return id;
}

// ── Settings helpers ───────────────────────────────────────────────────
function getSettings()          { return getDb().get('settings'); }
function setSettings(s)         { getDb().set('settings', s); }

module.exports = { getAdmin, setAdmin, getServers, setServers, nextId, getSettings, setSettings };
