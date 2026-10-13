/*
 * dsh-maid-scenery — 页面侧运行时（注入 <body>，早于应用模块脚本执行）。
 *
 * 职责：
 *   ① 在视频皮肤「聊天背景」面板（.dsvs-knobs）里加一行「背景画面」切换
 *      （视频 / 静态画），选择持久化到 localStorage，失败退会话内存；
 *   ② 把当前模式写成 body[data-maid-scenery]，CSS 据此淡出视频层。
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
    const read = () => {
      try { return localStorage.getItem(KEY); } catch { return window.__maidSceneryMode ?? null; }
    };
    const write = (v) => {
      try { localStorage.setItem(KEY, v); } catch { window.__maidSceneryMode = v; }
    };
    let mode = read() === 'art' ? 'art' : 'video';

    const applyMode = () => {
      try {
        if (mode === 'art') document.body.setAttribute('data-maid-scenery', 'art');
        else document.body.removeAttribute('data-maid-scenery');
      } catch { /* body 未就绪时静默，observer 会补 */ }
    };
    applyMode();

    const syncPills = (row) => {
      const pills = row.querySelectorAll('.dsvs-knobs-pill');
      for (const p of pills) {
        const want = p.getAttribute('data-scenery-mode') === mode;
        p.setAttribute('aria-pressed', want ? 'true' : 'false');
      }
    };

    const buildRow = () => {
      const row = document.createElement('div');
      row.className = 'dsvs-knobs-row';
      row.setAttribute('data-scenery-switch', '');
      const label = document.createElement('span');
      label.className = 'dsvs-knobs-label';
      label.textContent = '背景画面';
      row.appendChild(label);
      const mk = (m, text) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'dsvs-knobs-pill';
        b.setAttribute('data-scenery-mode', m);
        b.setAttribute('aria-pressed', m === mode ? 'true' : 'false');
        b.textContent = text;
        b.addEventListener('click', () => {
          mode = m;
          write(m);
          applyMode();
          syncPills(row);
        });
        return b;
      };
      row.appendChild(mk('video', '视频'));
      row.appendChild(mk('art', '静态画'));
      return row;
    };

    const tryMount = () => {
      const panel = document.querySelector('.dsvs-knobs');
      if (!panel) return false;
      if (panel.querySelector('[data-scenery-switch]')) return true; // 已注入
      const firstRow = panel.querySelector('.dsvs-knobs-row');
      const row = buildRow();
      if (firstRow && firstRow.parentNode === panel) panel.insertBefore(row, firstRow);
      else panel.appendChild(row);
      return true;
    };

    if (tryMount()) return; // 面板已存在（本脚本晚于它），一次到位

    // 面板还没出现：观察 DOM 直到挂上，挂上即收工断开。
    try {
      const mo = new MutationObserver(() => {
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
