#!/usr/bin/env node
/**
 * export_icons.js — 家宅装饰 icon fileID → PNG 批量导出（任务书 #50 WP1，REQ-137）
 *
 * 通道：wow.export 在线模式（Marlamin/wow.export，MIT），无客户端从暴雪公共 CDN
 * 流式取文件（TACT：versions → cdns → config → encoding/root → archive 索引 → 分片下载），
 * BLP 原生解码 → PNG。本脚本以无头方式直接复用 wow.export 官方源码模块
 * （casc-source-remote / blte-reader / blp / png-writer），不经过其 GUI。
 *
 * 依赖：
 *   1. wow.export 官方源码解压至 scripts/decor/out/wow.export-main/
 *      （获取：curl -L -o wowexport-src.tar.gz https://codeload.github.com/Marlamin/wow.export/tar.gz/refs/heads/main
 *             tar -xzf wowexport-src.tar.gz）
 *   2. webp-wasm 桩模块（out/wow.export-main/node_modules/webp-wasm/，仅 toWebP 用，本流程不触发）
 *   3. Node >= 24（wow.export 源码含 `using` 声明语法）
 *
 * 用法：
 *   node scripts/decor/export_icons.js [--limit N] [--ids 8198895,8117511] [--outdir assets/decor-icons]
 *
 * 输入：scripts/decor/out/decor_catalog.json（任务书 #49 留档件，取 icon_file_id 非空项）
 * 产物：
 *   assets/decor-icons/{icon_file_id}.png     图标本体（默认 outdir，可 --outdir 改）
 *   scripts/decor/out/icons_manifest.json     成功清单（fileID → 尺寸/字节/导出时间/build），重跑跳过
 *   scripts/decor/out/icons_failures.json     失败清单（fileID + 原因），不静默吞
 *   scripts/decor/out/wowexport-data/         wow.export CASC 缓存（encoding/root/索引，供增量复跑）
 */
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
const DATA_PATH = path.join(ROOT, 'scripts/decor/out/wowexport-data');

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
	progressLoadingScreen: async () => {},
	showLoadingScreen: () => {},
	hideLoadingScreen: () => {},
	setToast: () => {},
	create_busy_lock: () => ({})
};

const listfileStub = {
	getByID: (id) => 'unknown/' + id,
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

const CASCRemote = require(path.join(WOWEXPORT_SRC, 'casc/casc-source-remote.js'));
const BLPImage = require(path.join(WOWEXPORT_SRC, 'casc/blp.js'));
const generics = require(path.join(WOWEXPORT_SRC, 'generics.js'));
const tactKeys = require(path.join(WOWEXPORT_SRC, 'casc/tact-keys.js'));

// ---------------------------------------------------------------------------
// manifest / 失败清单
// ---------------------------------------------------------------------------
const loadJSON = (file, dflt) => {
	try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return dflt; }
};
const manifest = loadJSON(MANIFEST_PATH, { build: null, files: {} });
const failures = loadJSON(FAILURES_PATH, []);
const failureMap = new Map(failures.map(f => [f.fileID, f]));

const saveOutputs = () => {
	fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 1));
	fs.writeFileSync(FAILURES_PATH, JSON.stringify([...failureMap.values()], null, 1));
};

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
(async () => {
	const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
	let targets = [...new Set(catalog.filter(e => e.icon_file_id != null).map(e => e.icon_file_id))];
	if (IDS.length > 0) targets = targets.filter(id => IDS.includes(id));

	fs.mkdirSync(OUT_DIR, { recursive: true });

	// 增量：manifest 有记录且 PNG 在盘上即跳过
	const todo = targets.filter(id => {
		const done = manifest.files[id] && fs.existsSync(path.join(OUT_DIR, id + '.png'));
		if (done) failureMap.delete(id);
		return !done;
	});
	const batch = LIMIT > 0 ? todo.slice(0, LIMIT) : todo;

	console.log(`[export_icons] 目标 ${targets.length} 件，已完成 ${targets.length - todo.length} 件，本次导出 ${batch.length} 件`);

	if (batch.length === 0) {
		saveOutputs();
		console.log('[export_icons] 无需导出，退出');
		return;
	}

	// 初始化 wow.export 远程 CASC（在线模式，region=us 与 cn 同一全球 build）
	const casc = new CASCRemote('us');
	await casc.init();
	const buildIndex = casc.builds.findIndex(b => b && b.Product === 'wow');
	if (buildIndex < 0) throw new Error('未找到 wow (Retail) build');
	console.log('[export_icons] build =', JSON.stringify(casc.builds[buildIndex]));

	await casc.preload(buildIndex); // CDN 配置 + archive 索引
	await casc.loadEncoding();      // encoding 表（一次性，入缓存）
	await casc.loadRoot();          // root 表（一次性，入缓存）
	await tactKeys.load();          // BLTE 加密件公开密钥（wowdev/TACTKeys），个别图标加密

	manifest.build = casc.build.VersionsName + ' (' + casc.build.BuildConfig + ')';

	let ok = 0, fail = 0;
	await generics.queue(batch, async (fileID) => {
		try {
			const data = await casc.getFile(fileID, false, true); // BLTEReader（suppressLog）
			const blp = new BLPImage(data);
			const png = blp.toPNG(0b1111, 0); // 原生尺寸（mipmap 0），过大后期统一压，不拉申
			const out = path.join(OUT_DIR, fileID + '.png');
			await png.writeToFile(out);
			manifest.files[fileID] = {
				width: blp.width, height: blp.height,
				bytes: fs.statSync(out).size,
				exported_at: new Date().toISOString()
			};
			failureMap.delete(fileID);
			ok++;
		} catch (e) {
			failureMap.set(fileID, {
				fileID, reason: String(e && e.message || e),
				at: new Date().toISOString()
			});
			fail++;
		}
		if ((ok + fail) % 100 === 0) {
			console.log(`[export_icons] 进度 ${ok + fail}/${batch.length}（成功 ${ok} 失败 ${fail}）`);
			saveOutputs();
		}
	}, CONCURRENCY);

	saveOutputs();
	console.log(`[export_icons] 完成：成功 ${ok}，失败 ${fail}（详见 icons_manifest.json / icons_failures.json）`);
	if (fail > 0) process.exitCode = 2;
})().catch(e => {
	console.error('[export_icons] 初始化失败：', e);
	saveOutputs();
	process.exit(1);
});
