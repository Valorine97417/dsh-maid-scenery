/*
 * 圆钮拖动吸附的行为冒烟。
 *
 * smoke.mjs 只能对源码做特征断言（"里面有没有这段字"），证明不了拖起来对不对。
 * 这里把 runtime/scenery.js 真拉进一个迷你 DOM 跑一遍：造出视频皮肤的圆钮与面板，
 * 喂一串 pointerdown / pointermove / pointerup，然后断言
 *   ① 没拖过时圆钮待在 CSS 的原位（右下角 16px）；
 *   ② 拖动时圆钮跟手，且顺手把面板收起；
 *   ③ 松手吸到最近的一侧，垂直位置留住；
 *   ④ 位置写进 localStorage，下次开页面直接回原位；
 *   ⑤ 拖动尾巴那一次 click 被吞掉（不顺手弹面板），之后的点击照旧放行。
 *
 * 跑法：node scripts/drag-smoke.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const SRC = fileURLToPath(new URL('../runtime/scenery.js', import.meta.url));
const source = readFileSync(SRC, 'utf8');

let pass = 0;
let fail = 0;
const check = (name, ok) => {
  if (ok) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
};

/** 造一个迷你 DOM 世界，返回 { pill, panel, fire, store, … }。 */
function makeWorld(seed = {}) {
  const viewport = { w: 1200, h: 800 };
  const listeners = new WeakMap();
  const store = { ...seed };
  const calls = { stopImmediate: 0, preventDefault: 0 };

  const on = (el, type, fn) => {
    const map = listeners.get(el) ?? {};
    map[type] = fn;
    listeners.set(el, map);
  };
  const fire = (el, type, event = {}) => {
    const fn = listeners.get(el)?.[type];
    if (!fn) return false;
    fn({
      type,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      cancelable: true,
      preventDefault() { calls.preventDefault += 1; },
      stopImmediatePropagation() { calls.stopImmediate += 1; },
      ...event,
    });
    return true;
  };

  const px = (v) => (typeof v === 'string' && v.endsWith('px') ? Number.parseFloat(v) : Number.NaN);

  const el = (id, size = {}) => {
    const node = {
      id,
      style: {},
      dataset: {},
      attrs: {},
      children: [],
      offsetWidth: size.w ?? 32,
      offsetHeight: size.h ?? 32,
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
      addEventListener(type, fn) { on(this, type, fn); },
      removeEventListener() {},
      setPointerCapture() {},
      releasePointerCapture() {},
      hasPointerCapture() { return false; },
      appendChild(child) { this.children.push(child); return child; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      closest() { return null; },
      contains() { return false; },
      getBoundingClientRect() {
        let left = px(this.style.left);
        if (Number.isNaN(left)) {
          const right = px(this.style.right);
          left = Number.isNaN(right) ? viewport.w - this.offsetWidth - 16 : viewport.w - right - this.offsetWidth;
        }
        let top = px(this.style.top);
        if (Number.isNaN(top)) {
          const bottom = px(this.style.bottom);
          top = Number.isNaN(bottom) ? viewport.h - this.offsetHeight - 16 : viewport.h - bottom - this.offsetHeight;
        }
        return { left, top, right: left + this.offsetWidth, bottom: top + this.offsetHeight, width: this.offsetWidth, height: this.offsetHeight, x: left, y: top };
      },
    };
    return node;
  };

  const pill = el('dsvs-knobs-pill');
  const panel = el('dsvs-knobs', { w: 268, h: 0 });
  // 面板收起时量不到高度（vendor 用 display:none），开关跟着 data-open 走。
  Object.defineProperty(panel, 'offsetHeight', {
    get() { return panel.attrs['data-open'] === '1' ? 320 : 0; },
  });

  const body = el('body', { w: 1200, h: 800 });
  const sandbox = {
    console,
    setTimeout,
    setInterval,
    clearInterval,
    clearTimeout,
    fetch: () => new Promise(() => {}),
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    MutationObserver: class { constructor(cb) { this.cb = cb; } observe() {} disconnect() {} takeRecords() { return []; } },
    document: {
      body,
      documentElement: body,
      getElementById: (id) => (id === pill.id ? pill : id === panel.id ? panel : null),
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: (tag) => el(tag),
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  };
  sandbox.window = sandbox;
  Object.defineProperty(sandbox, 'innerWidth', { get: () => viewport.w });
  Object.defineProperty(sandbox, 'innerHeight', { get: () => viewport.h });

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'scenery.js' });

  return { pill, panel, fire, store, calls, viewport, sandbox };
}

console.log('— 圆钮拖动吸附 —');

// ① 没拖过的第一次：待在 CSS 的原位（右下角），脚本不该乱动它。
const a = makeWorld();
check('未拖动时圆钮停在右下角原位', a.pill.style.right === '16px' && a.pill.style.bottom === '16px' && a.pill.style.left === 'auto');
check('圆钮挂上了可拖标记（css 的 touch-action 靠它）', a.pill.dataset.sceneryDrag === '1');

// ② 拖到左上：跟手 + 面板收起。
a.fire(a.pill, 'pointerdown', { clientX: 1168, clientY: 768 });
a.fire(a.pill, 'pointermove', { clientX: 1167, clientY: 767 });
check('位移没到阈值不算拖（圆钮原地不动）', a.pill.style.left === 'auto' && a.pill.style.right === '16px' && a.pill.style.top === 'auto');
a.fire(a.pill, 'pointermove', { clientX: 300, clientY: 400 });
check('拖动时圆钮跟手（left/top 走内联）', a.pill.style.left === '284px' && a.pill.style.top === '384px');
check('拖动时清掉 right/bottom（否则两套定位打架）', a.pill.style.right === 'auto' && a.pill.style.bottom === 'auto');

// 面板开着的时候开拖：先收起，别让 268px 的框跟着飘。
const b = makeWorld();
b.panel.setAttribute('data-open', '1');
b.pill.setAttribute('data-active', '1');
b.fire(b.pill, 'pointerdown', { clientX: 1168, clientY: 768 });
b.fire(b.pill, 'pointermove', { clientX: 900, clientY: 500 });
check('开拖先收起面板', b.panel.getAttribute('data-open') === '0' && b.pill.getAttribute('data-active') === '0');

// ③ 松手吸附：拖到屏幕左半边 → 吸左；垂直位置留住。
a.fire(a.pill, 'pointerup', { clientX: 300, clientY: 400 });
check('松手吸到最近的一侧（左）', a.pill.style.left === '16px' && a.pill.style.right === 'auto');
check('松手后垂直位置留住（384px 顶 → 距底 384px）', a.pill.style.bottom === '384px' && a.pill.style.top === 'auto');

// ④ 位置进了 localStorage，下次开页面直接回原位。
check('位置写进 localStorage', a.store['dsh-maid-scenery-knobs'] === JSON.stringify({ side: 'left', y: 384 }));
const c = makeWorld(a.store);
check('换个页面重开：圆钮回到记忆里的位置', c.pill.style.left === '16px' && c.pill.style.bottom === '384px');

// ⑤ 拖动尾巴那次 click 被吞，之后照旧放行。
a.fire(a.pill, 'click', {});
check('拖动尾巴的 click 被吞（不顺手弹面板）', a.calls.stopImmediate === 1);
await new Promise((resolve) => setTimeout(resolve, 0));
a.fire(a.pill, 'click', {});
check('之后的正常点击不再被拦（vendor 的开合照旧）', a.calls.stopImmediate === 1);

// 拖到右半边 → 吸右；贴边时垂直位置夹在视口内。
const d = makeWorld();
d.fire(d.pill, 'pointerdown', { clientX: 1168, clientY: 768 });
d.fire(d.pill, 'pointermove', { clientX: 1100, clientY: 2000 });
d.fire(d.pill, 'pointerup', { clientX: 1100, clientY: 2000 });
check('拖出下边界时夹回视口内', d.pill.style.bottom === '8px');
check('右半边吸右', d.pill.style.right === '16px' && d.pill.style.left === 'auto');

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
