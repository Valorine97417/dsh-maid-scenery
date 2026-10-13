// maid-scenery 冒烟测试：注入行生成、顺序、内容完整、整合层装配、失败路径。
// 从仓库根运行：node scripts/smoke.mjs
// 隔离：不读真实用户配置（$DSH_HOME/dsh-video-skin.json），冒烟只验证装配与契约
process.env.DSH_HOME = new URL('.smoke-home/', import.meta.url).pathname.replace(/^\//, '');
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 隔离：不读真实用户配置（$DSH_HOME/dsh-video-skin.json）。ESM import 会被提升，
// 所以被测模块必须用动态 import —— 静态 import 会在本行之前就跑完。
process.env.DSH_HOME = new URL('.smoke-home/', import.meta.url).pathname.replace(/^\//, '');
const { apply, name, inject } = await import('../index.js');
const { apply: applyVideoSkin } = await import('../vendor/video-skin/index.host.js');
const { apply: applyMaidAtelier } = await import('../vendor/maid-atelier/index.host.js');

let pass = 0, fail = 0;
const check = (n, c, e = '') => { c ? (console.log(`PASS  ${n}`), pass++) : (console.log(`FAIL  ${n} ${e}`), fail++); };
const url = (p) => new URL(p, import.meta.url);
const root = (p) => new URL(`../${p}`, import.meta.url); // 相对仓库根
const size = (p) => { try { return statSync(root(p)).size; } catch { return -1; } };

check('导出 name', name === 'maid-scenery');
check('inject 空数组（同步注册契约）', Array.isArray(inject) && inject.length === 0);

// 模拟 cordis ctx：inject 直接以 child 执行，effect 立即跑并留 disposer
const events = [];
const registrations = [];
const disposers = [];
const makeChild = (parent) => {
  const child = {
    on: parent.on,
    effect: (fn) => { const d = fn(); if (typeof d === 'function') disposers.push(d); },
    logger: parent.logger,
  };
  // 两种取用风格都要支持：主题层用 webCtx.get('webServer')，视频层用 child.webServer
  child.webServer = { register: (def) => { registrations.push(def); return () => {}; } };
  child.get = (k) => (k === 'webServer' ? child.webServer : undefined);
  child.inject = (deps, fn) => fn(makeChild(child));
  return child;
};
const ctx = {
  on: (ev, fn) => { events.push(ev); if (ev === 'webserver/index-inject') (ctx._handlers ??= []).push(fn); },
  logger: { warn: (m) => console.log('  [warn]', m), info: (m) => console.log('  [info]', m) },
  inject: (deps, fn) => fn(makeChild(ctx)),
};
apply(ctx);
check('同步注册了 index-inject', events.includes('webserver/index-inject'));
check('装配了视频层与融合层两个监听器（顺序=先视频后融合）', (ctx._handlers ?? []).length === 2, `got ${(ctx._handlers ?? []).length}`);

// 注入表按注册顺序拼：视频层的 style+script 在前，融合层的 style+script 在后
const table = [];
for (const h of ctx._handlers ?? []) h(table);
check('注入四行（视频层 2 + 融合层 2）', table.length === 4, `got ${table.length}`);
check('第 1 行是视频层 style', table[0]?.kind === 'style' && /dsvs-/.test(table[0]?.text ?? ''));
check('第 2 行是视频层 script（placement=body）', table[1]?.kind === 'script' && table[1]?.placement === 'body');
check('第 3 行是融合层 style', table[2]?.kind === 'style');
check('第 4 行是融合层 script（placement=body）', table[3]?.kind === 'script' && table[3]?.placement === 'body');
check('style 永远在 script 前（层内顺序硬约束）', table[0]?.kind === 'style' && table[1]?.kind === 'script' && table[2]?.kind === 'style' && table[3]?.kind === 'script');
check('绝不推 script-src（会打掉 __DSH_BOOT_READY__）', table.every((r) => r?.kind !== 'script-src'));
check('视频层 script 带引导全局', /__DSH_VIDEO_SKIN__/.test(table[1]?.text ?? ''));
check('融合层 style 含 backdrop 透明化', /#dsvs-backdrop\s*\{[^}]*transparent/.test(table[2]?.text ?? ''));
check('融合层 style 含 art 模式淡出', /data-maid-scenery="art"/.test(table[2]?.text ?? ''));
check('融合层 style 含 video 模式让位静态画背景', /data-maid-scenery="video"\][^{]*character-stage/.test(table[2]?.text ?? ''));
check('融合层 script 含面板注入', /dsvs-knobs/.test(table[3]?.text ?? ''));
check('融合层 script 含持久化', /localStorage/.test(table[3]?.text ?? ''));
check('融合层 script 两个模式都显式挂牌（CSS 的 video 规则靠它）', /setAttribute\('data-maid-scenery',\s*mode\)/.test(table[3]?.text ?? ''));

// 非数组 table 不炸
let threw = false;
try { for (const h of ctx._handlers ?? []) { h('not-array'); h(null); } } catch { threw = true; }
check('坏 table 静默跳过', !threw);

// 运行时文件与注入内容一致
const css = readFileSync(url('../runtime/scenery.css'), 'utf8');
check('融合层 css 文件与注入一致', table[2]?.text === css);
check('css 不再代管可信徽章（raw-html v7.3 起自己管）', !/#vcp-trusted-toggle\s*\{[^}]*display:\s*none/.test(css));
check('融合层 script 不替 raw-html 写可信开关（用户的选择说了算）', !/setItem\(\s*['"]raw-html\.trusted/.test(table[3]?.text ?? ''));
check('融合层 script 按 id 找面板（不带 class）', /#dsvs-knobs/.test(table[3]?.text ?? ''));
check('融合层 script 用面板自带 preset 类', /dsvs-knobs-preset/.test(table[3]?.text ?? ''));

// ---- 整合层：vendor 产物在位 ----
const vsFiles = [
  'vendor/video-skin/index.host.js',
  'vendor/video-skin/LICENSE',
  'vendor/video-skin/lib/config.js',
  'vendor/video-skin/lib/injections.js',
  'vendor/video-skin/lib/route.js',
  'vendor/video-skin/runtime/skin.css',
  'vendor/video-skin/runtime/skin.js',
  'vendor/video-skin/assets/boot.mp4',
  'vendor/video-skin/assets/background.mp4',
];
const maFiles = [
  'vendor/maid-atelier/index.host.js',
  'vendor/maid-atelier/client.js',
  'vendor/maid-atelier/skin.json',
  'vendor/maid-atelier/NOTICE',
  'vendor/maid-atelier/LICENSE-upstream',
  'vendor/maid-atelier/LICENSE-ARTWORK',
  'vendor/maid-atelier/assets/runtime/manifest.json',
];
check('视频层文件齐', vsFiles.every((f) => size(f) > 0), vsFiles.filter((f) => size(f) <= 0).join(' '));
check('主题层文件齐', maFiles.every((f) => size(f) > 0), maFiles.filter((f) => size(f) <= 0).join(' '));

// ── 音频素材（背景音乐）：本地私有，闸门是"不进 git 索引"，不是"磁盘上不许有" ──
// 背景音乐由使用者自备（C418 等商业版权曲目），包内放一份、配置指向它完全正常；
// 不可再分发的是"推上仓库"这个动作，所以这里守 .gitignore 规则 + git 索引零音频。
const AUDIO_RE = /\.(flac|mp3|ogg|oga|opus|m4a|aac|wav)$/i;
const gitignoreText = readFileSync(root('.gitignore'), 'utf8');
check(
  '.gitignore 覆盖包内音频扩展名（本地音乐不入库）',
  ['flac', 'mp3', 'ogg', 'm4a', 'wav'].every((ext) => gitignoreText.includes(`vendor/video-skin/assets/*.${ext}`)),
);
let trackedAudio = null; // null = git 不可用，跳过（软降级）
try {
  const listed = execFileSync('git', ['ls-files', '--', 'vendor'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    encoding: 'utf8',
  });
  trackedAudio = listed.split(/\r?\n/).map((l) => l.trim()).filter((l) => AUDIO_RE.test(l));
} catch { trackedAudio = null; }
check(
  'git 索引内零音频（禁再分发）',
  trackedAudio === null || trackedAudio.length === 0,
  trackedAudio === null ? 'git 不可用 → 跳过' : trackedAudio.join(' '),
);

// 本地有音频时，配置指向它必须解析成功：music 出路 + 播放列表非空 + 零 warning。
// 这条正是"音乐被整合漏掉"的回归守卫——磁盘上放着歌却解析不出来，页面就是静音。
const audioOnDisk = (() => {
  try { return readdirSync(root('vendor/video-skin/assets')).filter((f) => AUDIO_RE.test(f)); } catch { return []; }
})();
if (audioOnDisk.length === 0) {
  console.log('SKIP  本地无音频 → 音乐解析用例跳过（放一首进 vendor/video-skin/assets/ 即生效）');
} else {
  const { loadConfig } = await import('../vendor/video-skin/lib/config.js');
  const { BOOT_ROUTE, BACKGROUND_ROUTE, MUSIC_ROUTE, TRACKS_ROUTE, CONFIG_ROUTE, OVERRIDE_ROUTE } =
    await import('../vendor/video-skin/index.host.js');
  const tmpHome = fileURLToPath(root('.smoke-home/music/'));
  mkdirSync(tmpHome, { recursive: true });
  writeFileSync(`${tmpHome}dsh-video-skin.json`, JSON.stringify({
    background: {
      music: `assets/${audioOnDisk[0]}`,
      musicVolume: 0.25,
      surface: 0.2, surfaceLight: 0.6, veil: 0.14, veilLight: 0.098,
    },
  }), 'utf8');
  const cfg = loadConfig({
    packageRoot: fileURLToPath(root('vendor/video-skin/')),
    homeDir: tmpHome,
    version: '0.2.0',
    routes: {
      boot: BOOT_ROUTE, background: BACKGROUND_ROUTE, music: MUSIC_ROUTE,
      tracks: TRACKS_ROUTE, config: CONFIG_ROUTE, override: OVERRIDE_ROUTE,
    },
  });
  const bg = cfg.client.background;
  check('本地音乐：解析零 warning', cfg.warnings.length === 0, cfg.warnings.join(' / '));
  check('本地音乐：music 路由已出路', bg.music === MUSIC_ROUTE, String(bg.music));
  check('本地音乐：播放列表含该曲', bg.musicPlaylist.length === audioOnDisk.length && bg.musicPlaylist[0].endsWith(encodeURIComponent(audioOnDisk[0])), bg.musicPlaylist.join(' '));
  check('本地音乐：音量取自用户覆盖文件', bg.musicVolume === 0.25, String(bg.musicVolume));
  check('本地音乐：素材目录落在包内 assets', cfg.paths.music?.includes('assets') === true, String(cfg.paths.music));
  rmSync(fileURLToPath(root('.smoke-home/music/')), { recursive: true, force: true });
}

// 主题素材：manifest 白名单与磁盘文件一一对应
const manifest = JSON.parse(readFileSync(root('vendor/maid-atelier/assets/runtime/manifest.json'), 'utf8'));
const files = Array.isArray(manifest) ? manifest : (manifest.files ?? []);
check('主题素材 manifest 非空', files.length > 0, `got ${files.length}`);
check('manifest 每项都符合 64 位哈希命名', files.every((f) => /^[a-f0-9]{64}\.(png|webp)$/.test(f)), files.filter((f) => !/^[a-f0-9]{64}\.(png|webp)$/.test(f)).join(' '));
check('manifest 每项磁盘都在', files.every((f) => size(`vendor/maid-atelier/assets/runtime/${f}`) > 0));
const onDisk = readdirSync(root('vendor/maid-atelier/assets/runtime')).filter((f) => /\.(png|webp)$/.test(f));
check('磁盘素材无 manifest 之外的孤儿', onDisk.every((f) => files.includes(f)), onDisk.filter((f) => !files.includes(f)).join(' '));

// 两家宿主半边可导入且导出 apply
check('视频层导出 apply', typeof applyVideoSkin === 'function');
check('主题层导出 apply', typeof applyMaidAtelier === 'function');

// 路由注册：视频层 6 条 + 主题素材 1 条 prefix + 音乐面板 2 条（本包自加）
const paths = registrations.map((r) => r.path);
check('注册了视频层配置路由', paths.includes('/dsh-video-skin/config.json'));
check('注册了视频层背景视频路由', paths.includes('/dsh-video-skin/background.mp4'));
check('注册了视频层覆盖写路由', paths.includes('/dsh-video-skin/override'));
check('注册了主题素材 prefix 路由', registrations.some((r) => r.kind === 'prefix' && r.path === '/skin-assets/maid-atelier'));
check('注册了音乐信息路由', paths.includes('/dsh-maid-scenery/music.json'));
check('注册了打开音乐目录路由', paths.includes('/dsh-maid-scenery/open-music-folder'));
check('路由注册总数 9', registrations.length === 9, `got ${registrations.length} ${paths.join(',')}`);
// 每层的 effect 各返回一个总清理函数（视频层 6 条路由共用一个，主题层 1 条，音乐面板 1 条）
check('三层各留一个 disposer（可卸载）', disposers.length === 3, `got ${disposers.length}`);
check('disposer 全是函数', disposers.every((d) => typeof d === 'function'));

// 素材路由要真能取到文件 —— 只断言 manifest 与磁盘对得上不够：
// v0.2.0 曾因 vendor 后相对层级少一层（../assets → ./assets）导致满屏 404，冒烟全绿却没抓到。
const assetRoute = registrations.find((r) => r.kind === 'prefix' && r.path === '/skin-assets/maid-atelier');
const fakeRes = () => {
  const out = { status: 0, headers: null, body: null };
  return {
    _out: out,
    writeHead(code, headers) { out.status = code; out.headers = headers ?? null; return this; },
    end(body) { out.body = body; return this; },
  };
};
const probe = async (urlPath, method = 'GET', headers = {}) => {
  const res = fakeRes();
  await assetRoute.handler({ method, url: urlPath, headers }, res);
  return { status: res._out.status, len: res._out.body?.length ?? 0, headers: res._out.headers ?? {} };
};
const hit = await probe(`/skin-assets/maid-atelier/${files[0]}`);
check('素材路由真能取到文件（200 且有字节）', hit.status === 200 && hit.len > 0, JSON.stringify(hit));
check('素材响应带 immutable 缓存头与 nosniff', /immutable/.test(hit.headers['Cache-Control'] ?? '') && hit.headers['X-Content-Type-Options'] === 'nosniff', JSON.stringify(hit.headers));
const miss = await probe(`/skin-assets/maid-atelier/${'0'.repeat(64)}.png`);
check('白名单外的素材名返回 404', miss.status === 404, JSON.stringify(miss));
const badMethod = await probe(`/skin-assets/maid-atelier/${files[0]}`, 'POST');
check('非 GET/HEAD 返回 405', badMethod.status === 405, JSON.stringify(badMethod));

// ---- 音乐面板端点（本包自加）----
// 只真跑只读那条：打开目录那条一旦真跑就会弹出资源管理器，冒烟不该有这个副作用，
// 所以对它只验方法守卫（GET → 405），顺带把"只认 POST"这条契约钉死。
const musicInfo = registrations.find((r) => r.path === '/dsh-maid-scenery/music.json');
const musicOpen = registrations.find((r) => r.path === '/dsh-maid-scenery/open-music-folder');
const callRoute = async (route, method = 'GET') => {
  const res = fakeRes();
  await route.handler({ method, url: route.path, headers: {} }, res);
  let body = null;
  try { body = JSON.parse(res._out.body); } catch { /* 非 JSON 就留 null */ }
  return { status: res._out.status, body };
};
if (musicInfo && musicOpen) {
  const info = await callRoute(musicInfo);
  check('音乐信息端点返回曲目数与列表', info.status === 200 && typeof info.body?.count === 'number' && Array.isArray(info.body?.tracks), JSON.stringify(info));
  check('音乐信息端点报的目录落在包内 vendor/assets', /vendor[\\/]video-skin[\\/]assets$/.test(info.body?.dir ?? ''), info.body?.dir);
  check('曲目数与 tracks 长度一致', info.body?.count === info.body?.tracks?.length, JSON.stringify(info.body));
  const openGet = await callRoute(musicOpen, 'GET');
  check('打开音乐目录只认 POST（GET 返回 405）', openGet.status === 405, JSON.stringify(openGet));
}

// ---- 客户端半边 ----
const client = readFileSync(url('../client.js'), 'utf8');
check('client 以 scenery 自身 id 注册', /__ModuleLoader__\.load\(\{\s*id:\s*['"]dsh-maid-scenery['"]/.test(client));
check('client 物化主题模块', /require\(['"]@smalltailqwq\/dsh-client-ui-skin-maid-atelier['"]\)/.test(client));
check('client 含主题段拼接标记', /maid-atelier 客户端/.test(client));
check('client 无残留 sourceMappingURL', !/^\/\/# sourceMappingURL=/m.test(client));
check('client 导出 inject/apply', /return \{ inject, apply \}/.test(client));

// ---- 许可三件套 ----
check('根 LICENSE 声明双许可边界', /CC BY-NC-SA 4\.0/.test(readFileSync(url('../LICENSE'), 'utf8')));
check('根 NOTICE 含三创署名链', /上善[\s\S]*ZipZipPipe[\s\S]*Small-tailqwq/.test(readFileSync(url('../NOTICE'), 'utf8')));
check('根 LICENSE-ARTWORK 是 CC 正文', /Attribution-NonCommercial-ShareAlike 4\.0/.test(readFileSync(url('../LICENSE-ARTWORK'), 'utf8')));
check('根 LICENSE-upstream 保留上游混合声明', /Bundling artwork into source code/.test(readFileSync(url('../LICENSE-upstream'), 'utf8')));

// ---- 皮肤清单（skin.json）：让皮肤管理器认得出本包 ----
// 上游 maid-atelier 是独立包，整合后 profile 里只剩 dsh-maid-scenery，
// 皮肤管理器的发现链要求 manifest.package === 已装包名，故包根必须自曝一份。
const pkg = JSON.parse(readFileSync(url('../package.json'), 'utf8'));
const skin = JSON.parse(readFileSync(url('../skin.json'), 'utf8'));
check('skin.json 存在且 id 保持 maid-atelier（换源要卸旧主题的兼容点）', skin.id === 'maid-atelier', skin.id);
check('skin.json.package 指向本包（皮肤管理器发现链硬要求）', skin.package === pkg.name, `${skin.package} vs ${pkg.name}`);
check('skin.json.wiring.id 与本包 patch entry id 一致', skin.wiring?.id === 'maid-scenery', skin.wiring?.id);
check('skin.json.bodyAttr 保持 data-dsh-maid-atelier（客户端按它挂牌）', skin.bodyAttr === 'data-dsh-maid-atelier', skin.bodyAttr);
check('skin.json.dshCompatibility 是 x.y.zrcN 形态', /^\d+\.\d+\.\d+rc\d+$/.test(skin.dshCompatibility ?? ''), skin.dshCompatibility);
check('skin.json.preview 两图都在包里', size(skin.preview?.light) > 0 && size(skin.preview?.dark) > 0);
check('skin.json.desktopIcon 在包里且是 .ico', size(skin.desktopIcon) > 0 && /\.ico$/i.test(skin.desktopIcon ?? ''));
check('skin.json 里没有绝对路径（皮肤管理器会拒）', ![skin.preview?.light, skin.preview?.dark, skin.desktopIcon].some((p) => /^[a-zA-Z]:|^\//.test(p ?? '')));

// ---- 包元信息 ----
check('版本 0.2.0', pkg.version === '0.2.0', pkg.version);
check('files 含 vendor 与 client.js', pkg.files.includes('vendor') && pkg.files.includes('client.js'));
check('files 含 skin.json', pkg.files.includes('skin.json'));
check('exports 暴露 ./client', pkg.exports['./client'] === './client.js');
check('exports 暴露 ./skin.json（皮肤管理器三级解析第一级）', pkg.exports['./skin.json'] === './skin.json');
check('dsh.client 声明 web 平台', pkg.dsh?.client?.platform === 'web');
check('已无 maid-atelier peer 依赖（整合后不再需要）', !Object.keys(pkg.peerDependencies ?? {}).some((k) => k.includes('maid-atelier')));

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
