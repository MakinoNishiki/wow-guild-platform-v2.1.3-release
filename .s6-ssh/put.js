// SFTP 上传：node put.js <local> <remote>（凭据走环境变量 SSH_PASS）
const { Client } = require('ssh2');
const [,, local, remote] = process.argv;
if (!local || !remote) { console.error('usage: put.js <local> <remote>'); process.exit(2); }
const conn = new Client();
const timer = setTimeout(() => { console.error('[TIMEOUT]'); conn.end(); process.exit(124); }, 300000);
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) { clearTimeout(timer); console.error(err.message); process.exit(1); }
    sftp.fastPut(local, remote, (e) => {
      clearTimeout(timer);
      if (e) { console.error('[PUT]', e.message, '| code=', e.code, '| path=', e.path, '| local=', local, '| remote=', remote, '| cwd=', process.cwd(), '| localExists=', require('fs').existsSync(local)); process.exit(1); }
      console.log('PUT_OK', remote);
      conn.end();
    });
  });
}).on('error', e => { clearTimeout(timer); console.error('[CONN]', e.message); process.exit(1); })
  .connect({ host: process.env.SSH_HOST || '101.35.124.22', port: parseInt(process.env.SSH_PORT || '22', 10), username: process.env.SSH_USER || 'ubuntu', password: process.env.SSH_PASS, readyTimeout: 20000 });
