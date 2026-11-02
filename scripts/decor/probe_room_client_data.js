// REQ-176：只读本机DB2与房间atlas；输出scripts/decor/out/room-data。
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

const ROOT = path.resolve(__dirname, '../..');
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
// Public wowdev/TACTKeys only; no account or server credentials.
const publicKeys = new Map(fs.readFileSync(path.join(ROOT,'scripts/decor/out/room-data/public-tact-keys.txt'),'utf8').split(/\r?\n/).map(line=>line.trim().split(/\s+/)).filter(x=>x.length===2&&x[0].length===16&&x[1].length===32).map(([k,v])=>[k.toLowerCase(),v.toLowerCase()]));
stubModule(path.join(WOWEXPORT_SRC,'casc/tact-keys.js'),{getKey:key=>publicKeys.get(key.toLowerCase()),load:async()=>{}});
const Local = require(path.join(WOWEXPORT_SRC,'casc/casc-source-local.js'));
const timer=setTimeout(()=>{console.error('TIMEOUT: local probe exceeded 90 seconds');process.exit(3)},90000);
(async()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/decor/out/room-data/manifest.json')));
 const tableIDs=new Map(manifest.map(r=>[r.tableName,r.db2FileDataID]));
 const BufferWrapper=require(path.join(WOWEXPORT_SRC,'buffer.js'));
 const source=new Local(getArg('game-dir','C:/Azeroth/World of Warcraft'));await source.init();source.build=source.builds.find(b=>b.Product==='wow');if(source.build.Version!=='12.1.5.70688')throw new Error('Unexpected client build; re-review required');
 source.cache={async init(){},async getFile(name){const p=path.join(ROOT,'scripts/decor/out/room-data',name);return fs.existsSync(p)?new BufferWrapper(fs.readFileSync(p)):null},async storeFile(){}};
 source.initializeRemoteCASC=async()=>{throw new Error('remote fallback disabled')};
 await source.loadConfigs();await source.loadIndexes();await source.loadEncoding();await source.loadRoot();coreStub.view.casc=source;
 source.getVirtualFileByName=async name=>{const table=path.basename(name,'.db2');const id=tableIDs.get(table);if(!id)throw new Error('manifest no ID '+table);return source.getFile(id,true,false,false)};
 const WDCReader=require(path.join(WOWEXPORT_SRC,'db/WDCReader.js'));const tables={};const summary={build:source.build,partialDecryption:true,tables:{}};
 for(const table of ['HouseRoom','UiTextureAtlasElement','UiTextureAtlasMember','UiTextureAtlas','HouseLevelData','HouseLevelRewardInfo']){
  const r=new WDCReader('DBFilesClient/'+table+'.db2');await r.parse();r.preload();const rows=Array.from(r.getAllRows().values());
  fs.writeFileSync(path.join(ROOT,'scripts/decor/out/room-data',table+'.json'),JSON.stringify(rows,null,2));summary.tables[table]=rows.length;tables[table]=rows;
 }
 const frozen=JSON.parse(fs.readFileSync(path.join(ROOT,'data/task083/catalog-current-2335.json'))).filter(r=>r.entry_type===2);
 const roomByID=new Map(tables.HouseRoom.map(r=>[r.ID,r]));const elements=new Map(tables.UiTextureAtlasElement.map(r=>[r.ID,r]));
 const textures=new Map(tables.UiTextureAtlas.map(r=>[r.ID,r]));const members=new Map();
 for(const r of tables.UiTextureAtlasMember){if(!members.has(r.UiTextureAtlasElementID))members.set(r.UiTextureAtlasElementID,[]);members.get(r.UiTextureAtlasElementID).push(r)}
 const roomEvidence=frozen.map(r=>{
  const room=roomByID.get(r.record_id);
  if(!room||room.Name_lang!==r.name||room.WeightCost!==r.placement_cost)throw new Error('Room identity/cost mismatch: '+r.record_id);
  const atlas_element=elements.get(room.UiTextureAtlasElementID)||null;
  const atlas_members=(members.get(room.UiTextureAtlasElementID)||[]).map(member=>({member,texture:textures.get(member.UiTextureAtlasID)||null}));
  if(atlas_members.some(t=>!atlas_element||!t.texture||t.member.CommittedName.toLowerCase()!==atlas_element.Name.toLowerCase()))throw new Error('Atlas mapping mismatch');
  return {record_id:r.record_id,name:r.name,client_room:room,atlas_element,atlas_members};
 });
 if(roomEvidence.length!==40||roomEvidence.filter(r=>r.atlas_members.length).length!==36)throw new Error('Room/atlas count changed');
 fs.writeFileSync(path.join(ROOT,'data/task083/room-client-atlas-evidence.json'),JSON.stringify({build:'12.1.5.70688',partialDecryption:true,matched_rooms:40,rows:roomEvidence},null,2)+'\n');
 const BLP=require(path.join(WOWEXPORT_SRC,'casc/blp.js'));
 for(const id of [6648988,7525545,8425294]){
  const image=new BLP(await source.getFile(id,false,false,false));const png=image.toPNG(0b1111,0);
  await png.writeToFile(path.join(ROOT,'scripts/decor/out/room-data',id+'.png'));
 }
 fs.writeFileSync(path.join(ROOT,'scripts/decor/out/room-data/result.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
})().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(()=>clearTimeout(timer));
