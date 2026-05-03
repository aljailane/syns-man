const { ipcMain } = require('electron');
const bcrypt = require('bcryptjs');
const net = require('net');
const { SocksClient } = require('socks');
const { getAdmin, setAdmin, getServers, setServers, nextId, getSettings, setSettings } = require('../db/database');
const ssh = require('./ssh');

const sftpSessions = new Map();

function registerHandlers() {
  // ── Admin ──────────────────────────────────────────
  ipcMain.handle('admin:exists', () => {
    return !!getAdmin();
  });

  ipcMain.handle('admin:setup', async (_, { username, password }) => {
    if (getAdmin()) return { ok: false, error: 'Admin already exists' };
    const hash = await bcrypt.hash(password, 12);
    setAdmin({ username, password: hash, createdAt: new Date().toISOString() });
    return { ok: true };
  });

  ipcMain.handle('admin:login', async (_, { username, password }) => {
    const admin = getAdmin();
    if (!admin || admin.username !== username) return { ok: false, error: 'Invalid credentials' };
    const match = await bcrypt.compare(password, admin.password);
    return match ? { ok: true } : { ok: false, error: 'Invalid credentials' };
  });

  ipcMain.handle('admin:reset', () => {
    setAdmin(null);
    setServers([]);
    return { ok: true };
  });

  ipcMain.handle('admin:reset', () => {
    setAdmin(null);
    setServers([]);
    return { ok: true };
  });

  // ── Servers ────────────────────────────────────────
  ipcMain.handle('servers:list', () => {
    return getServers().sort((a, b) => a.name.localeCompare(b.name));
  });

  ipcMain.handle('servers:get', (_, id) => {
    return getServers().find(s => s.id === id) || null;
  });

  ipcMain.handle('servers:add', (_, server) => {
    const servers = getServers();
    const newServer = { ...server, id: nextId(), createdAt: new Date().toISOString() };
    servers.push(newServer);
    setServers(servers);
    return { ok: true, id: newServer.id };
  });

  ipcMain.handle('servers:update', (_, server) => {
    const servers = getServers();
    const idx = servers.findIndex(s => s.id === server.id);
    if (idx === -1) return { ok: false, error: 'Server not found' };
    servers[idx] = { ...servers[idx], ...server };
    setServers(servers);
    return { ok: true };
  });

  ipcMain.handle('servers:delete', (_, id) => {
    setServers(getServers().filter(s => s.id !== id));
    return { ok: true };
  });

  // ── SSH Terminal ───────────────────────────────────
  ipcMain.handle('ssh:connect', async (event, { sessionId, serverId }) => {
    const server = getServers().find(s => s.id === serverId);
    if (!server) return { ok: false, error: 'Server not found' };

    try {
      await ssh.createSSHConnection(
        sessionId,
        server,
        (data) => { try { event.sender.send('ssh:data', { sessionId, data }); } catch {} },
        ()     => { try { event.sender.send('ssh:closed', { sessionId }); }    catch {} }
      );
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.on('ssh:send',       (_, data) => ssh.sendToSession(data.sessionId, data.data));
  ipcMain.on('ssh:resize',     (_, data) => ssh.resizeSession(data.sessionId, data.cols, data.rows));
  ipcMain.on('ssh:disconnect', (_, data) => ssh.closeSession(data.sessionId));

  // ── SFTP ───────────────────────────────────────────
  ipcMain.handle('sftp:connect', async (_, { sessionId, serverId }) => {
    const server = getServers().find(s => s.id === serverId);
    if (!server) return { ok: false, error: 'Server not found' };

    try {
      const { conn, sftp } = await ssh.createSFTPSession(server);
      sftpSessions.set(sessionId, { conn, sftp });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('sftp:list', async (_, { sessionId, path }) => {
    const session = sftpSessions.get(sessionId);
    if (!session) return { ok: false, error: 'No SFTP session' };
    try {
      const items = await ssh.listDirectory(session.sftp, path);
      return { ok: true, items };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('sftp:disconnect', (_, { sessionId }) => {
    const session = sftpSessions.get(sessionId);
    if (session) { session.conn.end(); sftpSessions.delete(sessionId); }
    return { ok: true };
  });

  ipcMain.handle('sftp:mkdir', async (_, { sessionId, path }) => {
    const session = sftpSessions.get(sessionId);
    if (!session) return { ok: false, error: 'No SFTP session' };
    try {
      await ssh.mkdirRemote(session.sftp, path);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('sftp:upload', async (event, { sessionId, localPath, remotePath }) => {
    const session = sftpSessions.get(sessionId);
    if (!session) return { ok: false, error: 'No SFTP session' };
    return new Promise((resolve) => {
      session.sftp.fastPut(localPath, remotePath, {
        step: (transferred, _chunk, total) => {
          try { event.sender.send('sftp:progress', { transferred, total, op: 'upload' }); } catch {}
        },
      }, (err) => resolve(err ? { ok: false, error: err.message } : { ok: true }));
    });
  });

  ipcMain.handle('sftp:download', async (event, { sessionId, remotePath, localPath }) => {
    const session = sftpSessions.get(sessionId);
    if (!session) return { ok: false, error: 'No SFTP session' };
    return new Promise((resolve) => {
      session.sftp.fastGet(remotePath, localPath, {
        step: (transferred, _chunk, total) => {
          try { event.sender.send('sftp:progress', { transferred, total, op: 'download' }); } catch {}
        },
      }, (err) => resolve(err ? { ok: false, error: err.message } : { ok: true }));
    });
  });

  ipcMain.handle('sftp:exec', async (_, { sessionId, command }) => {
    const session = sftpSessions.get(sessionId);
    if (!session) return { ok: false, error: 'No SFTP session' };
    return new Promise((resolve) => {
      session.conn.exec(command, (err, stream) => {
        if (err) return resolve({ ok: false, error: err.message });
        let out = '', errOut = '';
        const timer = setTimeout(() => {
          stream.destroy();
          resolve({ ok: false, error: 'Command timed out (30s)' });
        }, 30000);
        stream.on('close', (code) => {
          clearTimeout(timer);
          resolve(code === 0 ? { ok: true, output: out } : { ok: false, error: errOut || `Exit code ${code}` });
        });
        stream.on('data', (d) => { out += d.toString(); });
        stream.stderr.on('data', (d) => { errOut += d.toString(); });
      });
    });
  });

  ipcMain.handle('sftp:readFile', async (_, { sessionId, path }) => {
    const session = sftpSessions.get(sessionId);
    if (!session) return { ok: false, error: 'No SFTP session' };
    try {
      const content = await ssh.readFile(session.sftp, path);
      return { ok: true, content };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('sftp:writeFile', async (_, { sessionId, path, content }) => {
    const session = sftpSessions.get(sessionId);
    if (!session) return { ok: false, error: 'No SFTP session' };
    try {
      await ssh.writeFile(session.sftp, path, content);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('sftp:chmod', async (_, { sessionId, path, mode }) => {
    const session = sftpSessions.get(sessionId);
    if (!session) return { ok: false, error: 'No SFTP session' };
    try {
      await ssh.chmodFile(session.sftp, path, parseInt(mode, 8));
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('sftp:rename', async (_, { sessionId, oldPath, newPath }) => {
    const session = sftpSessions.get(sessionId);
    if (!session) return { ok: false, error: 'No SFTP session' };
    try {
      await ssh.renameFile(session.sftp, oldPath, newPath);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('sftp:delete', async (_, { sessionId, path, isDir }) => {
    const session = sftpSessions.get(sessionId);
    if (!session) return { ok: false, error: 'No SFTP session' };
    try {
      if (isDir) await ssh.deleteDir(session.sftp, path);
      else       await ssh.deleteFile(session.sftp, path);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  // ── Settings ───────────────────────────────────────
  ipcMain.handle('settings:get', () => {
    return getSettings();
  });

  ipcMain.handle('settings:set', (_, newSettings) => {
    setSettings(newSettings);
    return { ok: true };
  });

  ipcMain.handle('settings:testProxy', async (_, proxy) => {
    const type = proxy.type || 'socks5';
    const port = proxy.port || 1080;
    try {
      if (type === 'http') {
        await new Promise((resolve, reject) => {
          const sock = net.createConnection(port, proxy.host, () => {
            let auth = '';
            if (proxy.username) {
              auth = `Proxy-Authorization: Basic ${Buffer.from(`${proxy.username}:${proxy.password || ''}`).toString('base64')}\r\n`;
            }
            sock.write(`CONNECT 1.1.1.1:80 HTTP/1.1\r\nHost: 1.1.1.1:80\r\n${auth}\r\n`);
            let buf = '';
            const onData = (d) => {
              buf += d.toString();
              if (buf.includes('\r\n\r\n')) {
                sock.removeListener('data', onData);
                sock.destroy();
                if (/^HTTP\/1\.[01] 200/.test(buf)) resolve();
                else reject(new Error(buf.split('\r\n')[0]));
              }
            };
            sock.on('data', onData);
          });
          sock.setTimeout(8000, () => { sock.destroy(); reject(new Error('Timeout')); });
          sock.on('error', reject);
        });
      } else {
        const result = await SocksClient.createConnection({
          proxy: {
            host: proxy.host, port,
            type: type === 'socks4' ? 4 : 5,
            ...(proxy.username ? { userId: proxy.username, password: proxy.password || '' } : {}),
          },
          command: 'connect',
          destination: { host: '1.1.1.1', port: 80 },
        });
        result.socket.destroy();
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

module.exports = { registerHandlers };
