// S6 临时 SSH 执行器：凭据只从环境变量读，不落盘。
// 用法: SSH_PASS=... node run.js "远程命令"   或   SSH_PASS=... node run.js -  < script.sh
const { Client } = require('ssh2');

const host = process.env.SSH_HOST || '101.35.124.22';
const port = parseInt(process.env.SSH_PORT || '22', 10);
const user = process.env.SSH_USER || 'ubuntu';
const pass = process.env.SSH_PASS;

if (!pass) { console.error('SSH_PASS required'); process.exit(2); }

const arg = process.argv[2];
const getCmd = arg === '-'
  ? new Promise(res => { let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>res(d)); })
  : Promise.resolve(arg);

getCmd.then(cmd => {
  const conn = new Client();
  const timer = setTimeout(() => { console.error('[TIMEOUT]'); conn.end(); process.exit(124); }, 120000);
  conn.on('ready', () => {
    conn.exec(cmd, { pty: false }, (err, stream) => {
      if (err) { clearTimeout(timer); console.error(err.message); conn.end(); process.exit(1); }
      stream.on('data', d => process.stdout.write(d));
      stream.stderr.on('data', d => process.stderr.write(d));
      stream.on('close', code => { clearTimeout(timer); conn.end(); process.exit(code ?? 0); });
    });
  }).on('error', err => { clearTimeout(timer); console.error('[CONN]', err.message); process.exit(1); })
    .connect({ host, port, username: user, password: pass, readyTimeout: 20000 });
});
