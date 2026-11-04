// Read test-only server configuration from a protected stdin pipe, never a file.
// Copies only public entry points + server code to a temporary root without .env.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const tls = require('node:tls');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
(async () => {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const config = JSON.parse(input); input = '';
  assert.equal(config.ENVIRONMENT, 'isolated-test');
  assert.equal(config.SUPABASE_URL, 'http://127.0.0.1:18000');
  const claims = JSON.parse(Buffer.from(config.SUPABASE_SERVICE_ROLE_KEY.split('.')[1], 'base64url'));
  assert.equal(claims.iss, 'wowbutler-test');
  assert.equal(claims.role, 'service_role');
  // The existing production proxy deliberately uses HTTPS. Supply real TLS on
  // loopback without weakening its transport or disabling WCL certificate checks.
  const certScript = `
    $rsa = [System.Security.Cryptography.RSA]::Create(2048)
    $req = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=localhost', $rsa, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
    $san = [System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
    $san.AddIpAddress([System.Net.IPAddress]::Parse('127.0.0.1'))
    $san.AddDnsName('localhost')
    $req.CertificateExtensions.Add($san.Build())
    $cert = $req.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5), [DateTimeOffset]::UtcNow.AddHours(6))
    @{cert=$cert.ExportCertificatePem();key=$rsa.ExportPkcs8PrivateKeyPem()} | ConvertTo-Json -Compress
  `;
  const certificate = JSON.parse(execFileSync('pwsh', ['-NoProfile', '-Command', certScript], { encoding: 'utf8' }));
  tls.setDefaultCACertificates([...tls.getCACertificates('default'), certificate.cert]);
  const bridge = https.createServer(certificate, (req, res) => {
    const upstream = http.request({ hostname:'127.0.0.1', port:18000, path:req.url,
      method:req.method, headers:req.headers }, response => {
      res.writeHead(response.statusCode, response.headers); response.pipe(res);
    });
    upstream.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(upstream);
  });
  await new Promise(resolve => bridge.listen(18001, '127.0.0.1', resolve));
  for (const key of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    const value = key === 'SUPABASE_URL' ? 'https://127.0.0.1:18001' : config[key];
    process.env[key] = value; process.env['COZE_' + key] = value;
  }
  process.env.WCL_CLIENT_ID = config.WCL_CLIENT_ID || '';
  process.env.WCL_CLIENT_SECRET = config.WCL_CLIENT_SECRET || '';
  process.env.DEPLOY_RUN_PORT = '18779';
  process.env.DEPLOY_RUN_HOST = '127.0.0.1';
  process.env.CORS_ALLOWED_ORIGINS = 'http://127.0.0.1:18779';
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-req180-'));
  for (const name of ['server.js', 'index.html', 'data.html', 'decor.html']) fs.copyFileSync(path.join(root, name), path.join(temp, name));
  for (const name of ['js', 'css', 'assets']) fs.symlinkSync(path.join(root, name), path.join(temp, name), 'junction');
  const server = require(path.join(temp, 'server.js')).startServer();
  try {
    await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
    await require('./verify-req180-real.cjs')(config);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => bridge.close(resolve));
    // Remove only explicit temporary entries; never recursively traverse junctions.
    for (const name of ['js', 'css', 'assets']) fs.rmdirSync(path.join(temp, name));
    for (const name of ['server.js', 'index.html', 'data.html', 'decor.html']) fs.unlinkSync(path.join(temp, name));
    fs.rmdirSync(temp);
  }
  process.exit(0); // Stop the isolated server's maintenance timer too.
})().catch(error => {
  console.error('Isolated verification failed:', String(error.message).replace(/eyJ[A-Za-z0-9_.-]+/g, '[REDACTED]'));
  process.exit(1);
});
