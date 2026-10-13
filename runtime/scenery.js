/*
 * dsh-maid-scenery — 页面侧运行时（注入 <body>，早于应用模块脚本执行）。
 *
 * 职责：
 *   ① 在视频皮肤「聊天背景」面板（#dsvs-knobs）里加一行「背景画面」切换
 *      （视频 / 静态画），选择持久化到 localStorage，失败退会话内存；
 *   ② 把当前模式写成 body[data-maid-scenery]，CSS 据此淡出视频层；
 *   ③ 再加一行「背景音乐」：播放/暂停 + 打开音乐目录（音频自备，宿主端点见 index.js ④）；
 *   ④ 不管别的插件的事：raw-html 的可信模式与徽章自 v7.3 起由它自己默认处理
 *      （默认信任、徽章默认不挂载），本插件既不改它的开关也不压它的样式。
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

    // 宿主半边（index.js ④）自带的两个端点。用绝对路径，与视频层
    // '/dsh-video-skin/config.json' 同构——桌面壳与 dsh web 都能落到同一个 origin。
    const MUSIC_INFO = '/dsh-maid-scenery/music.json';
    const MUSIC_OPEN = '/dsh-maid-scenery/open-music-folder';

    /** 背景音乐那条 <audio> 的 id（视频皮肤建的，见 vendor/video-skin/runtime/skin.js）。 */
    const AUDIO_ID = 'dsvs-backdrop-music';

    const read = () => {
      try { return localStorage.getItem(KEY); } catch { return window.__maidSceneryMode ?? null; }
    };
    const write = (v) => {
      try { localStorage.setItem(KEY, v); } catch { window.__maidSceneryMode = v; }
    };
    let mode = read() === 'art' ? 'art' : 'video';

    // ── 关于 raw-html 可信模式：这里**刻意什么都不写** ──
    // raw-html v7.3 起语义已反转：默认就是「开」，只有显式把 localStorage 里的
    // 'raw-html.trusted' 置为 '0' 才算关闭（换机安装开箱即信任）。
    // 所以本插件不必再替它写这个键。反过来，早先那行「不是 '1' 就写 '1'」有个真
    // bug：老大显式关掉可信模式后，本脚本每次加载都把它翻回 '1' —— 关不掉。删掉
    // 它，让用户的选择说了算。徽章同理：raw-html 自己默认不挂载（需要时用
    // 'raw-html.trustedBadge' 唤出），本插件也不再压 display:none 去代管它。

    const applyMode = () => {
      try {
        if (!document.body) return false;
        // 两个模式都显式挂牌（而不是「art 才挂牌、video 就摘牌」）：
        // CSS 里「视频模式让静态画背景退场」那条规则要靠 video 这个值才敢下手。
        // 脚本没跑起来时 body 上没有这个属性，主题便维持原样叠加 —— 降级安全。
        document.body.setAttribute('data-maid-scenery', mode);
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

    /**
     * 面板上的「背景音乐」行。
     *
     * 只做两件面板该做的事：**起停**与**指路**。
     *   - 「播放/暂停」直接操作视频皮肤建的那条 <audio>。自动播放要是被策略拦下，
     *     这一次点击就是那个"用户手势"，能把音乐救回来 —— 这是这条按钮真正的价值。
     *   - 「打开音乐位置」调宿主端点拉起系统文件管理器（音频自备，目录即 vendor 的 assets）。
     */
    const buildMusicRow = () => {
      const row = document.createElement('div');
      row.className = 'dsvs-knobs-row';
      row.setAttribute('data-scenery-music', '');

      const label = document.createElement('div');
      label.className = 'dsvs-knobs-label';
      const text = document.createElement('span');
      text.textContent = '背景音乐';
      label.appendChild(text);
      row.appendChild(label);

      const group = document.createElement('div');
      group.className = 'dsvs-knobs-presets';
      const mk = (caption, onClick) => {
        const b = document.createElement('div');
        b.className = 'dsvs-knobs-preset';
        b.setAttribute('role', 'button');
        b.setAttribute('tabindex', '0');
        b.textContent = caption;
        b.addEventListener('click', onClick);
        return b;
      };

      const audio = () => {
        try { return document.getElementById(AUDIO_ID); } catch { return null; }
      };

      const syncToggle = () => {
        const el = audio();
        // 元素还没建（背景层延后 1.2 秒才起）：保持原样，别乱报"没有音乐"。
        if (!el) return;
        toggle.textContent = el.paused ? '播放' : '暂停';
        toggle.setAttribute('data-active', el.paused ? '0' : '1');
      };

      const toggle = mk('播放', () => {
        const el = audio();
        if (!el) {
          toggle.textContent = '无可播音乐';
          return;
        }
        if (el.paused) {
          const played = el.play();
          if (played && typeof played.catch === 'function') played.catch(() => {});
        } else {
          try { el.pause(); } catch { /* 已经停了 */ }
        }
        // play/pause 是异步落地的，交给下面的事件监听去改文案。
        setTimeout(syncToggle, 0);
      });
      group.appendChild(toggle);

      group.appendChild(mk('打开音乐位置', () => {
        try {
          const sent = fetch(MUSIC_OPEN, { method: 'POST' });
          if (sent && typeof sent.catch === 'function') sent.catch(() => {});
        } catch { /* 打不开就安静，别把面板搞红 */ }
      }));

      row.appendChild(group);

      // 音频上的 play/pause 事件（捕获阶段，audio 的媒体事件不冒泡）→ 文案跟着实际状态走。
      try {
        const follow = (e) => {
          const t = e && e.target;
          if (t && t.id === AUDIO_ID) syncToggle();
        };
        document.addEventListener('play', follow, true);
        document.addEventListener('pause', follow, true);
      } catch { /* 没有 addEventListener 的远古环境：按钮点击时照样同步 */ }

      // 音频比面板晚 1.2 秒才出现，头一分钟每秒对一次表，之后不再打扰。
      try {
        syncToggle();
        let ticks = 0;
        const timer = setInterval(() => {
          syncToggle();
          if (++ticks >= 60) clearInterval(timer);
        }, 1000);
      } catch { /* ignore */ }

      // 目录里有几首：给"里面到底有没有音乐"一个直读信号（0 首也能点开门去丢歌）。
      try {
        const asked = fetch(MUSIC_INFO, { cache: 'no-store' });
        if (asked && typeof asked.then === 'function') {
          asked
            .then((response) => (response && response.ok ? response.json() : null))
            .then((data) => {
              if (!data || typeof data.count !== 'number') return;
              text.textContent = data.count > 0 ? `背景音乐 · ${data.count} 首` : '背景音乐 · 目录为空';
            })
            .catch(() => {});
        }
      } catch { /* 问不到就保持"背景音乐"四个字 */ }

      return row;
    };

    // ── 圆钮拖动吸附（面板跟着走） ──────────────────────────────────────
    // 视频皮肤的圆钮写死 right:16px / bottom:16px（skin.css 里 #dsvs-knobs-pill），
    // 宽屏下它离聊天区很远，想挪到顺手的位置（比如左下角跟挂件并排）就只能改源码。
    // 这里补上：按住拖动 → 松手吸最近的一侧 → 位置记进 localStorage，下次开页面还在原处。
    // 只改圆钮与面板的定位样式，**不碰 vendor 的点击开合逻辑**：拖动结束时吞掉那一次
    // click，免得"拖完顺手把面板打开了"。
    const KNOBS_KEY = 'dsh-maid-scenery-knobs';
    const KNOBS_GAP = 16;  // 吸附后与对话框边缘的间距（对齐 vendor 原本的 16px）
    const KNOBS_SLOP = 4;  // 位移小于这个值算点击，不算拖
    // 活动范围 = 对话框（DSH 布局里中间那一列，class 名带 centerCol；左边是侧边栏）。
    // 选择器按可靠性排序，全落空就退回整个视口——选择器哪天变了也不至于拖不动。
    const KNOBS_FRAME = ["[class*='centerCol']", "[data-slot='conversation.session']", 'main'];

    const readKnobs = () => {
      try {
        const raw = JSON.parse(localStorage.getItem(KNOBS_KEY) || 'null');
        // 只认完整的两字段：半截数据（比如换版本后改过结构）宁可退回默认位置。
        if (raw && (raw.side === 'left' || raw.side === 'right') && Number.isFinite(raw.y)) {
          return { side: raw.side, y: raw.y };
        }
      } catch { /* 读不到就当没存过 */ }
      return null;
    };
    const writeKnobs = (pos) => {
      try { localStorage.setItem(KNOBS_KEY, JSON.stringify(pos)); } catch { /* 会话内照样生效 */ }
    };

    const setupKnobs = () => {
      let pill = null;
      let panel = null;
      try {
        pill = document.getElementById('dsvs-knobs-pill');
        panel = document.getElementById('dsvs-knobs');
      } catch { return false; }
      if (!pill || pill.dataset.sceneryDrag === '1') return false;
      pill.dataset.sceneryDrag = '1';   // 幂等：面板重建时这个标记随新元素一起重来

      let pos = readKnobs() || { side: 'right', y: KNOBS_GAP };
      let dragging = false;
      let moved = false;
      let swallow = false;   // 这一次 click 属于拖动的尾巴，不是"打开面板"
      let startX = 0;
      let startY = 0;
      let startRect = null;
      let dragArea = null;   // 开拖那一刻量到的对话框范围（拖动中不重算）

      const viewW = () => window.innerWidth || 0;
      const viewH = () => window.innerHeight || 0;

      /** 找到对话框那一列的元素；找不到返回 null（与 frameRect 的视口兜底分开）。 */
      const frameEl = () => {
        try {
          for (let i = 0; i < KNOBS_FRAME.length; i += 1) {
            const el = document.querySelector(KNOBS_FRAME[i]);
            if (el) return el;
          }
        } catch { /* ignore */ }
        return null;
      };

      /**
       * 对话框那一列是不是真的量出来了。
       * 刷新瞬间它会短暂地零尺寸（甚至还没挂上），此刻若照旧走「视口兜底」落位，
       * 记忆里 side='left' 的圆钮就会被按到窗口最左边 —— 也就是左侧边栏里
       * （老大 m01141 报的正是这个）。所以这种时候宁可不落位，等它长好再来。
       */
      const frameReady = () => {
        const el = frameEl();
        if (!el) return false;
        try {
          const rect = el.getBoundingClientRect();
          return rect.width > 160 && rect.height > 120;
        } catch { return false; }
      };

      /** 量一次对话框区域；侧边栏展开/收起、窗口改尺寸都会让它变，所以每次都现量。 */
      const frameRect = () => {
        const fallback = { left: 0, top: 0, right: viewW(), bottom: viewH() };
        try {
          const el = frameEl();
          if (!el) return fallback;
          const rect = el.getBoundingClientRect();
          if (!rect || !rect.width || !rect.height) return fallback;
          return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
        } catch { return fallback; }
      };

      /** 面板贴着圆钮放：默认在上方，上方塞不下就翻到下方。 */
      const placePanel = () => {
        if (!panel) return;
        try {
          const rect = pill.getBoundingClientRect();
          if (!rect.width) return;
          const area = frameRect();
          const leftSide = rect.left + rect.width / 2 < (area.left + area.right) / 2;
          panel.style.left = leftSide ? Math.max(area.left + 8, Math.round(rect.left)) + 'px' : 'auto';
          panel.style.right = leftSide ? 'auto' : Math.max(8, Math.round(viewW() - Math.min(area.right - 8, rect.right))) + 'px';
          const height = panel.offsetHeight || 0;   // 收起时是 0，先按"上方放得下"处理
          if (height === 0 || rect.top - 10 - height >= area.top + 8) {
            panel.style.top = 'auto';
            panel.style.bottom = Math.round(viewH() - rect.top + 10) + 'px';
          } else {
            panel.style.bottom = 'auto';
            panel.style.top = Math.round(rect.bottom + 10) + 'px';
          }
        } catch { /* 定位失败就退回 CSS 里的默认角落 */ }
      };

      /** 把记忆里的位置落到样式上（并夹进对话框范围）。 */
      const apply = () => {
        try {
          // 对话框那一列还没长出来就先不动：CSS 里的出厂位（右下角）比"被按进侧边栏"强。
          if (!frameReady()) return;
          const area = frameRect();
          const height = pill.offsetHeight || 32;
          const width = pill.offsetWidth || 32;
          // y 是"圆钮底边到视口底边的距离"：贴对话框底边时最小，贴顶边时最大。
          const yMin = viewH() - area.bottom + KNOBS_GAP;
          const yMax = viewH() - area.top - height - KNOBS_GAP;
          const y = Math.max(yMin, Math.min(pos.y, Math.max(yMin, yMax)));
          pos = { side: pos.side, y: Math.round(y) };
          const left = pos.side === 'left' ? area.left + KNOBS_GAP : area.right - width - KNOBS_GAP;
          pill.style.top = 'auto';
          pill.style.bottom = pos.y + 'px';
          pill.style.left = Math.round(left) + 'px';
          pill.style.right = 'auto';
          placePanel();
        } catch { /* ignore */ }
      };

      // 刷新后布局是异步长出来的：对话列一旦量得出来（或换了尺寸）就补落一次位。
      // 只认尺寸变化，不需要 MutationObserver —— 少一条常驻观察，也少一份自己给自己
      // 加戏的机会（apply 写的是内联样式，不碰尺寸，不会被自己触发成循环）。
      try {
        if (typeof ResizeObserver === 'function') {
          const ro = new ResizeObserver(() => { apply(); });
          ro.observe(document.documentElement);
        }
      } catch { /* 没有 ResizeObserver 就等 window resize */ }

      pill.addEventListener('pointerdown', (event) => {
        try {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          dragging = true;
          moved = false;
          startX = event.clientX;
          startY = event.clientY;
          startRect = pill.getBoundingClientRect();
          dragArea = frameRect();   // 开拖那一刻的对话框范围：拖动中不重算，免得手感一跳一跳
          pill.style.transition = 'none';   // 拖动期间别跟 CSS 的 220ms 过渡打架
          if (typeof pill.setPointerCapture === 'function') {
            try { pill.setPointerCapture(event.pointerId); } catch { /* 拿不到捕获也能拖 */ }
          }
        } catch { /* ignore */ }
      });

      pill.addEventListener('pointermove', (event) => {
        if (!dragging) return;
        try {
          const dx = event.clientX - startX;
          const dy = event.clientY - startY;
          if (!moved) {
            if (Math.abs(dx) < KNOBS_SLOP && Math.abs(dy) < KNOBS_SLOP) return;
            moved = true;
            // 一开拖就把面板收起：边拖边飘一个 268px 的框既难看也挡路。
            if (panel) {
              panel.setAttribute('data-open', '0');
              pill.setAttribute('data-active', '0');
            }
          }
          if (event.cancelable) event.preventDefault();
          const area = dragArea || frameRect();
          const left = Math.max(area.left + 4, Math.min(startRect.left + dx, area.right - startRect.width - 4));
          const top = Math.max(area.top + 4, Math.min(startRect.top + dy, area.bottom - startRect.height - 4));
          pill.style.left = Math.round(left) + 'px';
          pill.style.top = Math.round(top) + 'px';
          pill.style.right = 'auto';
          pill.style.bottom = 'auto';
        } catch { /* ignore */ }
      });

      const finish = (event) => {
        if (!dragging) return;
        dragging = false;
        try { pill.style.transition = ''; } catch { /* ignore */ }
        try {
          if (event && typeof pill.releasePointerCapture === 'function') {
            pill.releasePointerCapture(event.pointerId);
          }
        } catch { /* 没捕获过就没什么可放 */ }
        if (!moved) return;   // 一路没动：这次点击归 vendor 的开合逻辑
        try {
          const rect = pill.getBoundingClientRect();
          const area = dragArea || frameRect();
          pos = {
            side: rect.left + rect.width / 2 < (area.left + area.right) / 2 ? 'left' : 'right',
            y: viewH() - rect.bottom,
          };
          writeKnobs(pos);
        } catch { /* 存不住也照样吸附 */ }
        // pointerup 之后紧跟的那次 click 是拖动的尾巴：吞掉它，别顺手开面板。
        swallow = true;
        try { setTimeout(() => { swallow = false; }, 0); } catch { swallow = false; }
        apply();
      };

      pill.addEventListener('pointerup', finish);
      pill.addEventListener('pointercancel', finish);
      pill.addEventListener('click', (event) => {
        if (!swallow) return;
        swallow = false;
        try { event.stopImmediatePropagation(); } catch { /* ignore */ }
        try { event.preventDefault(); } catch { /* ignore */ }
      }, true);

      // 面板每次展开都重新定位一次（收起时量不到它的高度）。
      try {
        const watch = new MutationObserver(() => {
          if (panel && panel.getAttribute('data-open') === '1') placePanel();
        });
        watch.observe(panel, { attributes: true, attributeFilter: ['data-open'] });
      } catch { /* 没有 MutationObserver 就靠 apply 那一次 */ }

      try {
        window.addEventListener('resize', apply);
      } catch { /* ignore */ }

      apply();
      return true;
    };

    // ── ⑤ 深色锁定 ──
    // 老大 m01089：「帮我改一下只用深色主题界面，不再随通用设置里的外观三个按钮变化。」
    // DSH 的整套深色变量挂在 body[data-ds-dark-theme] 上（asar 里能看到
    // `body[data-ds-dark-theme] .xxx{…}` 与 `[data-ds-dark-theme] .BynINW_*`），
    // 所以不必去改宿主的设置，只要让这个属性永远在场：先补上，盯着被摘走就补回。
    const DARK_ATTR = 'data-ds-dark-theme';
    const setupDarkLock = () => {
      const pin = () => {
        try {
          const body = document.body;
          if (body && !body.hasAttribute(DARK_ATTR)) body.setAttribute(DARK_ATTR, '');
          const html = document.documentElement;
          if (html && !html.hasAttribute(DARK_ATTR)) html.setAttribute(DARK_ATTR, '');
        } catch { /* 钉不住就算了，页面照常 */ }
      };
      pin();
      // pin() 只在属性缺席时写入 —— 写完它就在场，观察者不会自触发成死循环。
      try {
        const mo = new MutationObserver(pin);
        mo.observe(document.documentElement, { attributes: true, attributeFilter: [DARK_ATTR] });
        if (document.body) mo.observe(document.body, { attributes: true, attributeFilter: [DARK_ATTR] });
      } catch { /* 没有 MutationObserver：至少开头那一次还生效 */ }
      // 本脚本早于应用脚本执行，body 可能还没就绪，补一次。
      try {
        if (!document.body) document.addEventListener('DOMContentLoaded', pin, { once: true });
      } catch { /* ignore */ }
    };

    const findPanel = () => {
      // 视频皮肤的面板只带 id、没有 class（CSS 也全走 #dsvs-knobs），
      // 所以必须按 id 找；顺带兼容将来万一补上 class 的版本。
      try { return document.querySelector('#dsvs-knobs') || document.querySelector('.dsvs-knobs'); }
      catch { return null; }
    };

    const tryMount = () => {
      const panel = findPanel();
      // 圆钮与面板同批创建，挂行之前先把拖动吸附装上（与面板在不在无关）。
      try { setupKnobs(); } catch { /* 拖不动也不影响面板 */ }
      if (!panel) return false;

      // 「背景画面」插到面板最前（挨着原生滑块），「背景音乐」挂到最后。
      if (!panel.querySelector('[data-scenery-switch]')) {
        const row = buildRow();
        const first = panel.querySelector('.dsvs-knobs-row');
        if (first && first.parentNode === panel) panel.insertBefore(row, first);
        else panel.appendChild(row);
      }
      if (!panel.querySelector('[data-scenery-music]')) panel.appendChild(buildMusicRow());
      return true;
    };

    // ⑤ 先钉住深色（下面那条 tryMount() 成事就 return 了，别把锁定漏在门外）。
    try { setupDarkLock(); } catch { /* 锁不上也比崩了强 */ }

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
