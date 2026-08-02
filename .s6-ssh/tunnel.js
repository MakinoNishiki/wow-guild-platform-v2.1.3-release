// SSH 隧道：本地 18080 → 服务器 127.0.0.1:8090（前端验收临时通道）
const { Client } = require('ssh2');
const net = require('net');
const conn = new Client();
conn.on('ready', () => {
  net.createServer((sock) => {
    conn.forwardOut('127.0.0.1', 18080, '127.0.0.1', 8090, (err, stream) => {
      if (err) { sock.end(); return; }
      sock.pipe(stream).pipe(sock);
    });
  }).listen(18080, '127.0.0.1', () => console.log('TUNNEL_READY 127.0.0.1:18080 -> server 127.0.0.1:8090'));
}).on('error', e => { console.error('[CONN]', e.message); process.exit(1); })
  .connect({ host: '101.35.124.22', username: 'ubuntu', password: process.env.SSH_PASS, readyTimeout: 20000 });
