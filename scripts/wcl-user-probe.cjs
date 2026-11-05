// REQ-184: temporary loopback-only OAuth probe. No business writes or token persistence.
const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');
const path = require('node:path');
function config() {
  const text = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(WCL_CLIENT_ID|WCL_CLIENT_SECRET)\s*=\s*(.*)$/);
    if (m) result[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  if (!result.WCL_CLIENT_ID || !result.WCL_CLIENT_SECRET) throw Error('Missing WCL configuration');
  return result;
}
const PORT = 18781;
const origin = `http://127.0.0.1:${PORT}`;
const redirect = origin + '/callback';
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function createServer(credentials, request = fetch) {
  let pending = null;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    // Same-origin forms retain Origin; cross-origin navigation still omits Referer.
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'none'; form-action 'self' https://www.warcraftlogs.com; frame-ancestors 'none'");
    const reply = (code, body) => { res.writeHead(code, {'Content-Type':'text/html; charset=utf-8'}); res.end(body); };
    if (req.headers.host !== `127.0.0.1:${PORT}`) return reply(403, 'Invalid host');
    const url = new URL(req.url, origin);
    if (req.method === 'GET' && url.pathname === '/') return reply(200,
      '<h1>WCL 账号只读验证</h1><p>仅查询账号身份与接口字段，不修改公会、角色认领或考勤，不保存授权令牌。请先在 WCL 应用中追加回调地址：</p><pre>' + redirect + '</pre><form method="post" action="/start"><button>前往 WCL 授权</button></form>');
    if (req.method === 'POST' && url.pathname === '/start') {
      if (req.headers.origin !== origin) return reply(403, 'Invalid origin');
      const state = crypto.randomBytes(32).toString('hex');
      const cookie = crypto.randomBytes(32).toString('hex');
      pending = {state, cookie, expires: Date.now() + 600000};
      res.setHeader('Set-Cookie', `wb_probe=${cookie}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`);
      const target = new URL('https://www.warcraftlogs.com/oauth/authorize');
      target.search = new URLSearchParams({client_id:credentials.WCL_CLIENT_ID,redirect_uri:redirect,response_type:'code',scope:'view-user-profile',state});
      res.writeHead(303, {Location:target.href}); return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/callback') {
      const cookie = (req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith('wb_probe='));
      if (!pending || pending.expires < Date.now() || url.searchParams.get('state') !== pending.state || cookie !== `wb_probe=${pending.cookie}`) return reply(403, '授权会话无效或已过期，请返回首页重新开始。');
      pending = null;
      res.setHeader('Set-Cookie', 'wb_probe=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
      if (url.searchParams.has('error')) return reply(400, '授权未完成；未读取任何账号资料。');
      const code = url.searchParams.get('code');
      if (!code) return reply(400, '授权码缺失，请重新开始。');
      try {
        const tokenResponse = await request('https://www.warcraftlogs.com/oauth/token', {
          method:'POST', headers:{Authorization:'Basic '+Buffer.from(credentials.WCL_CLIENT_ID+':'+credentials.WCL_CLIENT_SECRET).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},
          body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:redirect}),signal:AbortSignal.timeout(15000)
        });
        if (!tokenResponse.ok) throw Error('token');
        const token = await tokenResponse.json();
        if (!token.access_token) throw Error('token');
        const response = await request('https://www.warcraftlogs.com/api/v2/user', {
          method:'POST',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},
          body:JSON.stringify({query:'{ userData { currentUser { id name characters { id canonicalID name claimed classID server { name slug region { slug } } } } } }'}),signal:AbortSignal.timeout(15000)
        });
        if (!response.ok) throw Error('query');
        const result = await response.json();
        if (result.errors) {
          const schema = await request('https://www.warcraftlogs.com/api/v2/user', {
            method:'POST', headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},
            body:JSON.stringify({query:'{ userSchema: __type(name:"User") { fields { name args { name type { kind name ofType { kind name } } } type { kind name ofType { kind name ofType { kind name } } } } } serverSchema: __type(name:"Server") { fields { name type { kind name ofType { kind name } } } } }'}),signal:AbortSignal.timeout(15000)
          });
          if (schema.ok) result.schema = await schema.json();
        }
        return reply(200, '<h1>只读查询结果</h1><p>未保存令牌，未执行角色认领。此结果仅用于接口核查。</p><pre>'+escape(JSON.stringify(result,null,2))+'</pre>');
      } catch { return reply(502, 'WCL 授权或查询失败，未写入业务数据。请从首页重新发起。'); }
    }
    reply(404, 'Not found');
  });
  return server;
}
if (require.main === module) {
  const server = createServer(config());
  server.listen(PORT, '127.0.0.1', () => console.log('Read-only probe: '+origin));
  setTimeout(() => server.close(), 30 * 60000).unref();
}
module.exports = {createServer, PORT};
