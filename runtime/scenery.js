/*
 * dsh-maid-scenery — 页面侧运行时（注入 <body>，早于应用模块脚本执行）。
 *
 * 职责：
 *   ① 在视频皮肤「聊天背景」面板（#dsvs-knobs）里加一行「背景画面」切换
 *      （视频 / 静态画），选择持久化到 localStorage，失败退会话内存；
 *   ② 把当前模式写成 body[data-maid-scenery]，CSS 据此淡出视频层；
 *   ③ 杂事：raw-html 可信模式默认打开（徽章由 scenery.css 隐去——它与视频
 *      皮肤面板的圆钮同位重叠）。
 *
 * 生存法则（抄视频皮肤的头注释契约）：
 *   - 本文件任何一行都不许在求值期抛异常：所有入口包 try/catch，出错就安静待命，
 *     页面保持两家插件各自的原生叠加。
 *   - 不假设两家插件在场：面板没出现就一直观察（MutationObserver），主题缺席时
 *     切换按钮照样在（切到静态画只是露出应用底色，不崩）。
 *   - 幂等：面板可能被重建，每次挂载前查已注入标记。
 */
(() => {
  'use strict';
  try {
    const KEY = 'dsh-maid-scenery-mode';
    const TRUST_KEY = 'raw-html.trusted';
    const read = () => {
      try { return localStorage.getItem(KEY); } catch { return window.__maidSceneryMode ?? null; }
    };
    const write = (v) => {
      try { localStorage.setItem(KEY, v); } catch { window.__maidSceneryMode = v; }
    };
    let mode = read() === 'art' ? 'art' : 'video';

    // ── 杂事：可信模式默认打开 ──
    // 渲染层每次都现读 localStorage（isTrusted()），所以这一笔立刻生效；
    // 徽章本身的隐藏交给 scenery.css 的 display:none !important。
    try {
      if (localStorage.getItem(TRUST_KEY) !== '1') localStorage.setItem(TRUST_KEY, '1');
    } catch { /* 私密模式/配额失败：维持宿主默认，不添乱 */ }

    const applyMode = () => {
      try {
        if (!document.body) return false;
        if (mode === 'art') document.body.setAttribute('data-maid-scenery', 'art');
        else document.body.removeAttribute('data-maid-scenery');
        return true;
      } catch { return false; }
    };
    applyMode();

    const pills = (row) => row.querySelectorAll('[data-scenery-mode]');

    const syncPills = (row) => {
      for (const p of pills(row)) {
        const want = p.getAttribute('data-scenery-mode') === mode;
        p.setAttribute('data-active', want ? '1' : '0');
        p.setAttribute('aria-pressed', want ? 'true' : 'false');
      }
    };

    const buildRow = () => {
      const row = document.createElement('div');
      row.className = 'dsvs-knobs-row';
      row.setAttribute('data-scenery-switch', '');

      const label = document.createElement('div');
      label.className = 'dsvs-knobs-label';
      const text = document.createElement('span');
      text.textContent = '背景画面';
      label.appendChild(text);
      row.appendChild(label);

      // 复用视频皮肤自己的 .dsvs-knobs-presets / .dsvs-knobs-preset：
      // 那套类名自带暗色与亮色两套规则，视觉与面板其余按钮无缝。
      const group = document.createElement('div');
      group.className = 'dsvs-knobs-presets';
      const mk = (m, caption) => {
        const b = document.createElement('div');
        b.className = 'dsvs-knobs-preset';
        b.setAttribute('role', 'button');
        b.setAttribute('tabindex', '0');
        b.setAttribute('data-scenery-mode', m);
        b.textContent = caption;
        b.addEventListener('click', () => {
          mode = m;
          write(m);
          applyMode();
          syncPills(row);
        });
        return b;
      };
      group.appendChild(mk('video', '视频'));
      group.appendChild(mk('art', '静态画'));
      row.appendChild(group);

      syncPills(row);
      return row;
    };

    const findPanel = () => {
      // 视频皮肤的面板只带 id、没有 class（CSS 也全走 #dsvs-knobs），
      // 所以必须按 id 找；顺带兼容将来万一补上 class 的版本。
      try { return document.querySelector('#dsvs-knobs') || document.querySelector('.dsvs-knobs'); }
      catch { return null; }
    };

    const tryMount = () => {
      const panel = findPanel();
      if (!panel) return false;
      if (panel.querySelector('[data-scenery-switch]')) return true; // 已注入
      const row = buildRow();
      const firstRow = panel.querySelector('.dsvs-knobs-row');
      if (firstRow && firstRow.parentNode === panel) panel.insertBefore(row, firstRow);
      else panel.appendChild(row);
      return true;
    };

    if (tryMount()) return; // 面板已存在（本脚本晚于它），一次到位

    // 面板还没出现：观察 DOM 直到挂上，挂上即收工断开。
    try {
      const mo = new MutationObserver(() => {
        applyMode(); // body 可能刚刚才就绪
        if (tryMount()) {
          try { mo.disconnect(); } catch { /* ignore */ }
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      // 上界：10 分钟还没等到面板（用户从没开过），就放弃观察，不留常驻负担。
      setTimeout(() => { try { mo.disconnect(); } catch { /* ignore */ } }, 600000);
    } catch { /* 没有 MutationObserver 的远古环境：放弃面板注入，模式切换仍可用 */ }
  } catch {
    /* 装饰品没有资格让页面变红 */
  }
})();
