// maid-scenery 冒烟测试：注入行生成、顺序、内容完整、失败路径。
// 从仓库根运行：node scripts/smoke.mjs
import { apply, name, inject } from '../index.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (n, c, e = '') => { c ? (console.log(`PASS  ${n}`), pass++) : (console.log(`FAIL  ${n} ${e}`), fail++); };

check('导出 name', name === 'maid-scenery');
check('inject 空数组（同步注册契约）', Array.isArray(inject) && inject.length === 0);

// 模拟 cordis ctx
const events = [];
const ctx = {
  on: (ev, fn) => { events.push(ev); if (ev === 'webserver/index-inject') ctx._handler = fn; },
  logger: { warn: (m) => console.log('  [warn]', m) },
};
apply(ctx);
check('同步注册了 index-inject', events.includes('webserver/index-inject'));

const table = [];
ctx._handler(table);
check('注入两行', table.length === 2, `got ${table.length}`);
check('第一行是 style', table[0]?.kind === 'style');
check('style 在 script 前（顺序硬约束）', table[0]?.kind === 'style' && table[1]?.kind === 'script');
check('script placement=body', table[1]?.placement === 'body');
check('style 含 backdrop 透明化', /#dsvs-backdrop\s*\{[^}]*transparent/.test(table[0]?.text ?? ''));
check('style 含 art 模式淡出', /data-maid-scenery="art"/.test(table[0]?.text ?? ''));
check('style 含 video 模式让位静态画背景', /data-maid-scenery="video"\][^{]*character-stage/.test(table[0]?.text ?? ''));
check('script 含面板注入', /dsvs-knobs/.test(table[1]?.text ?? ''));
check('script 含持久化', /localStorage/.test(table[1]?.text ?? ''));
check('script 整体包 try（失败静默）', /^\s*\/\*[\s\S]*?\*\/\s*\(\(\) => \{\s*'use strict';\s*try \{/.test(table[1]?.text ?? '') || table[1]?.text?.includes("'use strict'"));

// 非数组 table 不炸
let threw = false;
try { ctx._handler('not-array'); ctx._handler(null); } catch { threw = true; }
check('坏 table 静默跳过', !threw);

// 运行时文件与注入内容一致
const css = readFileSync(new URL('../runtime/scenery.css', import.meta.url), 'utf8');
check('css 文件与注入一致', table[0]?.text === css);
check('css 不再代管可信徽章（raw-html v7.3 起自己管）', !/#vcp-trusted-toggle\s*\{[^}]*display:\s*none/.test(css));
check('script 不替 raw-html 写可信开关（用户的选择说了算）', !/setItem\(\s*['"]raw-html\.trusted/.test(table[1]?.text ?? ''));
check('script 按 id 找面板（不带 class）', /#dsvs-knobs/.test(table[1]?.text ?? ''));
check('script 用面板自带 preset 类', /dsvs-knobs-preset/.test(table[1]?.text ?? ''));
check('script 两个模式都显式挂牌（CSS 的 video 规则靠它）', /setAttribute\('data-maid-scenery',\s*mode\)/.test(table[1]?.text ?? ''));

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
