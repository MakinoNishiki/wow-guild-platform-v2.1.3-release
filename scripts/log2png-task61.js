// 任务书 #61-WP1 送审留证：复跑日志渲染为 PNG（headless Chromium 截 <pre> 文本，内容即日志原文）
// 用法: node scripts/log2png-task61.js <log文件> <输出png>
const fs = require('fs');
const { chromium } = require('playwright');
(async () => {
  const [log, out] = process.argv.slice(2);
  const text = fs.readFileSync(log, 'utf8').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\x1b\[[0-9;]*m/g, '');
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#14161a;color:#c9d1d9;font:13px/1.55 Consolas,monospace;">
<pre style="margin:0;padding:16px;white-space:pre-wrap;">${text}</pre></body></html>`;
  const browser = await chromium.launch();
  const pg = await (await browser.newContext({ viewport: { width: 1100, height: 800 } })).newPage();
  await pg.setContent(html);
  await pg.locator('pre').screenshot({ path: out });
  await browser.close();
  console.log('PNG 落盘：' + out);
})().catch(e => { console.error(e.message); process.exit(1); });
