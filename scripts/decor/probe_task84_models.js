// #84 本地 CASC 四模型试点（只读游戏 Data；输出 scripts/decor/out）。
// 依赖固定版 wow.export 源码，详见 TASK-084-真机扫描与模型试点报告。
// --game-dir 指向 World of Warcraft 根目录；不读 env 文件、不连接线上数据库、禁用远端 CASC 回退。
'use strict';

const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const getArg = (name, dflt) => {
	const i = argv.indexOf('--' + name);
	return i >= 0 ? argv[i + 1] : dflt;
};
const LIMIT = parseInt(getArg('limit', '0'), 10) || 0;
const IDS = getArg('ids', '').split(',').map(s => parseInt(s, 10)).filter(n => !isNaN(n));
const OUT_DIR = path.resolve(getArg('outdir', 'assets/decor-icons'));
const CONCURRENCY = parseInt(getArg('concurrency', '8'), 10);

const ROOT = path.resolve(__dirname, '../..');
const CATALOG = path.join(ROOT, 'scripts/decor/out/decor_catalog.json');
const MANIFEST_PATH = path.join(ROOT, 'scripts/decor/out/icons_manifest.json');
const FAILURES_PATH = path.join(ROOT, 'scripts/decor/out/icons_failures.json');
const WOWEXPORT_SRC = path.join(ROOT, 'scripts/decor/out/wow.export-main/src/js');
const DATA_PATH = path.join(ROOT, 'scripts/decor/out/task084-casc-cache');

if (!fs.existsSync(path.join(WOWEXPORT_SRC, 'casc/casc-source-remote.js'))) {
	console.error('wow.export 源码缺失：' + WOWEXPORT_SRC + '（见本文件头部「依赖」节）');
	process.exit(1);
}

// ---------------------------------------------------------------------------
// nw.js / core / listfile / mmap 桩：wow.export 模块为 GUI 运行时编写，
// 无头复用前需垫平其对 nw 全局与 UI 状态的依赖（仅桩 UI 侧，数据链路全为官方实现）。
// ---------------------------------------------------------------------------
fs.mkdirSync(DATA_PATH, { recursive: true });

global.nw = {
	__dirname: WOWEXPORT_SRC,
	App: { dataPath: DATA_PATH, manifest: { version: '0.2.14-headless' } }
};
global.BUILD_RELEASE = true; // log.write 不再镜像 console，落 runtime.log

const coreStub = {
	events: new EventEmitter(),
	view: {
		$watch: (name, cb, opts) => {
			// cascLocale：0x40 = zhCN（目录采集自国服 12.1.0 客户端，取 zhCN 本地化条目）
			if (opts && opts.immediate) cb(0x40);
		},
		cacheSize: 0,
		config: {
			cacheExpiry: 0,
			// 同 wow.export src/default_config.jsonc：BLTE 加密文件的公开密钥源（wowdev/TACTKeys）
			tactKeysURL: 'https://raw.githubusercontent.com/wowdev/TACTKeys/master/WoW.txt',
			tactKeysFallbackURL: 'https://www.kruithne.net/wow.export/data/tact/wow'
		},
		casc: null
	},
	progressLoadingScreen: async (s) => console.log('[stage]',s),
	showLoadingScreen: () => {},
	hideLoadingScreen: () => {},
	setToast: () => {},
	create_busy_lock: () => ({})
};

const listfileStub = {
	getByID: () => undefined, getByIDOrUnknown:(id,ext)=>'unknown/'+id+ext, formatUnknownFile:(id,ext='')=>'unknown/'+id+ext,
	getByFilename: () => undefined
};

const mmapStub = {
	create_virtual_file: () => { throw new Error('mmap not available in headless harness'); },
	release_virtual_files: () => {}
};

const stubModule = (absPath, exports) => {
	require.cache[absPath] = {
		id: absPath, filename: absPath, loaded: true, exports,
		paths: [], children: [], parent: null
	};
};

stubModule(path.join(WOWEXPORT_SRC, 'core.js'), coreStub);
stubModule(path.join(WOWEXPORT_SRC, 'casc/listfile.js'), listfileStub);
stubModule(path.join(WOWEXPORT_SRC, 'mmap.js'), mmapStub);


const Cache = class { async init(){} async getFile(){return null} async storeFile(){} };
stubModule(path.join(WOWEXPORT_SRC,'casc/build-cache.js'),Cache);
const Local = require(path.join(WOWEXPORT_SRC,'casc/casc-source-local.js'));
const timer=setTimeout(()=>{console.error('TIMEOUT: local probe exceeded 90 seconds');process.exit(3)},90000);
(async()=>{
 const casc=new Local(getArg('game-dir', 'C:/Azeroth/World of Warcraft')); await casc.init();
 casc.build=casc.builds.find(b=>b.Product==='wow');console.log('[build]',JSON.stringify(casc.build));
 casc.cache=new Cache();
 casc.initializeRemoteCASC=async()=>{throw new Error('remote fallback disabled for local-only diagnostic')};
 await casc.loadConfigs(); await casc.loadIndexes(); await casc.loadEncoding();await casc.loadRoot();coreStub.view.casc=casc;
 Object.assign(coreStub.view.config,{modelsExportTextures:true,modelsExportAlpha:true,modelsExportAnimations:false,overwriteFiles:true,pathFormat:'posix',enableSharedTextures:false,exportDirectory:path.join(ROOT,'scripts/decor/out/task084-models')});fs.mkdirSync(coreStub.view.config.exportDirectory,{recursive:true}); const exporterPath=path.join(WOWEXPORT_SRC,'3D/exporters/M2Exporter.js');const Module=require('module');const exporterModule=new Module(exporterPath,module);exporterModule.filename=exporterPath;exporterModule.paths=Module._nodeModulePaths(path.dirname(exporterPath));const exporterSource=fs.readFileSync(exporterPath,'utf8').replace('if (this.dataTextures.has(this.m2.textureTypes[this.m2.textureCombos[texUnit.textureComboIndex]])) {','if (texUnit && this.dataTextures.has(this.m2.textureTypes[this.m2.textureCombos[texUnit.textureComboIndex]])) {');exporterModule._compile(exporterSource,exporterPath);const Exporter=exporterModule.exports;const results=[];
 const targets=argv.includes('--all')?Object.values(JSON.parse(fs.readFileSync(path.join(ROOT,'data/task083/scan-evidence-20261102.json'),'utf8')).iconTargets).map(r=>[r.recordID,r.asset]):[[28569,3189119],[28556,3053186],[27684,3051536],[27220,4551444]];for(const [rid,asset] of targets){
  try{const b=await casc.getFile(asset,false,false,false);const dest=path.join(ROOT,'scripts/decor/out',`task084-${rid}.bin`);await b.writeToFile(dest);results.push({record_id:rid,asset,bytes:fs.statSync(dest).size,header:fs.readFileSync(dest).subarray(0,4).toString('ascii'),status:'read'}); const exporter=new Exporter(await casc.getFile(asset,false,false,false),[],asset); await exporter.m2.load();const skin=await exporter.m2.getSkin(0);const meshMaterials=skin.subMeshes.map((m,i)=>{const u=skin.textureUnits.find(t=>t.skinSectionIndex===i);return u?{unit:u,material:exporter.m2.materials[u.materialIndex],textures:Array.from({length:u.textureCount},(_,j)=>exporter.m2.textures[exporter.m2.textureCombos[u.textureComboIndex+j]]?.fileDataID)}:null});fs.writeFileSync(path.join(coreStub.view.config.exportDirectory,rid+'.materials.json'),JSON.stringify(meshMaterials)); const destGLB=path.join(coreStub.view.config.exportDirectory,rid+'.glb'); await exporter.exportAsGLTF(destGLB,{isCancelled:()=>false},'glb');results[results.length-1].glb_bytes=fs.statSync(destGLB).size;}
  catch(e){const row=results.find(r=>r.record_id===rid);if(row){row.status='export_failed';row.reason=e.message}else results.push({record_id:rid,asset,status:'read_failed',reason:e.message})}
 }
 const result={build:casc.build,results};fs.writeFileSync(path.join(ROOT,'scripts/decor/out/task084-probe-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(results.some(r=>r.status!=='read'||!r.glb_bytes))process.exitCode=2;
})().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(()=>clearTimeout(timer));
