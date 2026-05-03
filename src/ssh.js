const { Client } = require('ssh2');
const fs = require('fs');
const net = require('net');
const { SocksClient } = require('socks');
const { getSettings } = require('../db/database');

const activeSessions = new Map();

/* Build a socket through the configured proxy, or return null for direct */
async function buildProxySocket(targetHost, targetPort) {
  const settings = getSettings() || {};
  const proxy = settings.proxy || {};
  if (!proxy.enabled || !proxy.host) return null;

  const proxyType = proxy.type || 'socks5';

  if (proxyType === 'http') {
    // HTTP CONNECT tunnel
    return new Promise((resolve, reject) => {
      const sock = net.createConnection(proxy.port || 8080, proxy.host, () => {
        let auth = '';
        if (proxy.username) {
          auth = `Proxy-Authorization: Basic ${Buffer.from(`${proxy.username}:${proxy.password || ''}`).toString('base64')}\r\n`;
        }
        sock.write(`CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n${auth}\r\n`);
        let buf = '';
        const onData = (d) => {
          buf += d.toString();
          if (buf.includes('\r\n\r\n')) {
            sock.removeListener('data', onData);
            if (/^HTTP\/1\.[01] 200/.test(buf)) resolve(sock);
            else reject(new Error(`Proxy rejected CONNECT: ${buf.split('\r\n')[0]}`));
          }
        };
        sock.on('data', onData);
      });
      sock.on('error', reject);
    });
  }

  // SOCKS4 / SOCKS5
  const socksVersion = proxyType === 'socks4' ? 4 : 5;
  const socksOpts = {
    proxy: {
      host: proxy.host,
      port: proxy.port || 1080,
      type: socksVersion,
      ...(proxy.username ? { userId: proxy.username, password: proxy.password || '' } : {}),
    },
    command: 'connect',
    destination: { host: targetHost, port: targetPort },
  };
  const result = await SocksClient.createConnection(socksOpts);
  return result.socket;
}

function buildConnConfig(config) {
  const connConfig = {
    host: config.host,
    port: config.port || 22,
    username: config.username,
    readyTimeout: 20000,
    keepaliveInterval: 10000,
    keepaliveCountMax: 3,
    compress: true,
    algorithms: {
      kex: [
        'curve25519-sha256', 'curve25519-sha256@libssh.org',
        'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384',
        'diffie-hellman-group14-sha256',
      ],
      cipher: [
        'aes128-gcm@openssh.com', 'aes256-gcm@openssh.com',
        'aes128-ctr', 'aes192-ctr', 'aes256-ctr',
      ],
      hmac: ['hmac-sha2-256-etm@openssh.com', 'hmac-sha2-256'],
      compress: ['zlib@openssh.com', 'zlib', 'none'],
    },
  };
  if (config.auth_type === 'key' && config.key_path) {
    try {
      connConfig.privateKey = fs.readFileSync(config.key_path);
    } catch (e) {
      throw new Error(`Cannot read key file "${config.key_path}": ${e.message}`);
    }
    if (config.passphrase) connConfig.passphrase = config.passphrase;
  } else {
    connConfig.password = config.password;
  }
  return connConfig;
}

function createSSHConnection(id, config, onData, onClose) {
  return new Promise(async (resolve, reject) => {
    const conn = new Client();

    conn.on('ready', () => {
      conn.shell({ term: 'xterm-256color' }, (err, stream) => {
        if (err) return reject(err);

        activeSessions.set(id, { conn, stream });

        stream.on('data', (data) => onData(data.toString('utf8')));
        stream.stderr.on('data', (data) => onData(data.toString('utf8')));
        stream.on('close', () => {
          activeSessions.delete(id);
          onClose();
        });

        resolve();
      });
    });

    conn.on('error', (err) => reject(err));

    let connConfig;
    try { connConfig = buildConnConfig(config); } catch (e) { return reject(e); }

    try {
      const sock = await buildProxySocket(config.host, config.port || 22);
      if (sock) connConfig.sock = sock;
    } catch (e) {
      return reject(new Error(`Proxy error: ${e.message}`));
    }

    conn.connect(connConfig);
  });
}

function sendToSession(id, data) {
  const session = activeSessions.get(id);
  if (session) session.stream.write(data);
}

function resizeSession(id, cols, rows) {
  const session = activeSessions.get(id);
  if (session) session.stream.setWindow(rows, cols);
}

function closeSession(id) {
  const session = activeSessions.get(id);
  if (session) {
    session.conn.end();
    activeSessions.delete(id);
  }
}

function createSFTPSession(config) {
  return new Promise(async (resolve, reject) => {
    const conn = new Client();

    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) return reject(err);
        resolve({ conn, sftp });
      });
    });

    conn.on('error', reject);

    let connConfig;
    try { connConfig = buildConnConfig(config); } catch (e) { return reject(e); }

    try {
      const sock = await buildProxySocket(config.host, config.port || 22);
      if (sock) connConfig.sock = sock;
    } catch (e) {
      return reject(new Error(`Proxy error: ${e.message}`));
    }

    conn.connect(connConfig);
  });
}

function listDirectory(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.readdir(remotePath, (err, list) => {
      if (err) return reject(err);
      const items = list.map((item) => ({
        name: item.filename,
        type: item.longname.startsWith('d') ? 'directory' : 'file',
        size: item.attrs.size,
        modified: item.attrs.mtime * 1000,
        permissions: item.longname.substring(0, 10),
      }));
      items.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      resolve(items);
    });
  });
}

function readFile(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = sftp.createReadStream(remotePath, { encoding: 'utf8' });
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(chunks.join('')));
    stream.on('error', reject);
  });
}

function writeFile(sftp, remotePath, content) {
  return new Promise((resolve, reject) => {
    const stream = sftp.createWriteStream(remotePath);
    stream.on('close', resolve);
    stream.on('error', reject);
    stream.end(content, 'utf8');
  });
}

function chmodFile(sftp, remotePath, mode) {
  return new Promise((resolve, reject) => {
    sftp.chmod(remotePath, mode, (err) => err ? reject(err) : resolve());
  });
}

function renameFile(sftp, oldPath, newPath) {
  return new Promise((resolve, reject) => {
    sftp.rename(oldPath, newPath, (err) => err ? reject(err) : resolve());
  });
}

function deleteFile(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.unlink(remotePath, (err) => err ? reject(err) : resolve());
  });
}

function deleteDir(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.rmdir(remotePath, (err) => err ? reject(err) : resolve());
  });
}

function mkdirRemote(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.mkdir(remotePath, (err) => err ? reject(err) : resolve());
  });
}

module.exports = {
  createSSHConnection,
  sendToSession,
  resizeSession,
  closeSession,
  createSFTPSession,
  listDirectory,
  mkdirRemote,
  readFile,
  writeFile,
  chmodFile,
  renameFile,
  deleteFile,
  deleteDir,
};
