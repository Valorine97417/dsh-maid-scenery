// maid-scenery 冒烟测试：注入行生成、顺序、内容完整、整合层装配、失败路径。
// 从仓库根运行：node scripts/smoke.mjs
// 隔离：不读真实用户配置（$DSH_HOME/dsh-video-skin.json），冒烟只验证装配与契约
process.env.DSH_HOME = new URL('.smoke-home/', import.meta.url).pathname.replace(/^\//, '');
import { readFileSync, readdirSync, statSync } from 'node:fs';

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

// flac 零残留（C418 商业版权音频，不可再分发）
const flacs = [];
const walk = (d) => { for (const e of readdirSync(root(d), { withFileTypes: true })) { const p = `${d}/${e.name}`; e.isDirectory() ? walk(p) : (/\.flac$/i.test(e.name) && flacs.push(p)); } };
walk('vendor');
check('vendor 内零 .flac（商业版权音频已排除）', flacs.length === 0, flacs.join(' '));

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

// 路由注册：视频层 6 条 + 主题素材 1 条 prefix
const paths = registrations.map((r) => r.path);
check('注册了视频层配置路由', paths.includes('/dsh-video-skin/config.json'));
check('注册了视频层背景视频路由', paths.includes('/dsh-video-skin/background.mp4'));
check('注册了视频层覆盖写路由', paths.includes('/dsh-video-skin/override'));
check('注册了主题素材 prefix 路由', registrations.some((r) => r.kind === 'prefix' && r.path === '/skin-assets/maid-atelier'));
check('路由注册总数 7', registrations.length === 7, `got ${registrations.length} ${paths.join(',')}`);
// 每层的 effect 各返回一个总清理函数（视频层 6 条路由共用一个，主题层 1 条）
check('两层各留一个 disposer（可卸载）', disposers.length === 2, `got ${disposers.length}`);
check('disposer 全是函数', disposers.every((d) => typeof d === 'function'));

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
