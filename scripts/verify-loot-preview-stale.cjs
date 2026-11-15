const fs=require('fs'),assert=require('assert/strict'),{chromium}=require('playwright');
(async()=>{
const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const p=await browser.newPage();await p.setContent('<textarea id="lootDropImportText"></textarea><select id="lootDropActivity"></select><div id="lootDropImportPreview"></div><button id="lootDropImportConfirmBtn"></button><div id="lootDropZone"></div>');
 const src=fs.readFileSync('js/app.js','utf8');const start=src.indexOf('let lootDropImportRows =');const end=src.indexOf('modalDirtyChecks.lootDropImportModal',start);
 await p.addScriptTag({content:`var appData={activities:[]};var sent=[],messages=[];var CloudSync={getCurrentGuild:()=>({id:'test'})};function dropEsc(x){return String(x||'')}function openModal(){}function closeModal(){}function showToast(x){messages.push(x)}async function cloudCrud(a,b,p){sent.push(p.rows);throw Error('Fixture stop before database')}\n`+src.slice(start,end)});
 const rows=n=>JSON.stringify([{itemID:268259,itemName:n,playerName:'测试',timestamp:1794746504,itemLink:n==='old'?'[old]':'|Hitem:268259:0|h[new]|h'}]);
 await p.evaluate(()=>lootDropImportOpen());await p.locator('textarea').fill(rows('old'));await p.evaluate(()=>lootDropImportParse());
 await p.locator('textarea').fill(rows('new'));await p.evaluate(()=>lootDropImportConfirm());
 assert.equal(await p.evaluate(()=>sent.length),0,'Changing text must never submit cached old rows');
 await p.evaluate(()=>lootDropImportParse());await p.evaluate(()=>lootDropImportConfirm());assert.equal(await p.evaluate(()=>sent[0][0].itemName),'new');
 await p.locator('textarea').fill('{bad');await p.evaluate(()=>lootDropImportParse());await p.evaluate(()=>lootDropImportConfirm());assert.equal(await p.evaluate(()=>sent.length),1,'Invalid JSON clears old parsed rows');
 await p.locator('textarea').fill(rows('new'));await p.evaluate(()=>lootDropImportParse());await p.evaluate(()=>document.querySelector('textarea').value='[]');await p.evaluate(()=>lootDropImportConfirm());assert.equal(await p.evaluate(()=>sent.length),1,'Programmatic replacement guarded');
 console.log('PASS Chrome: replacement blocks old submit; reparsing submits new text; invalid JSON clears; programmatic changes guarded. DB is a deliberate stub.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
