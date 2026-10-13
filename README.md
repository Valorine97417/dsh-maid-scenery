# dsh-maid-scenery

视频背景 × 深海女仆工坊的**整合版**插件——把 [maid-atelier](https://github.com/Small-tailqwq/dsh-deep-whale) 主题与 [dsh-video-skin](https://github.com/Something11235/dsh-video-skin) 的聊天背景捏合成一套可切换的场景。**v0.2.0 起两家配套已随包分发**：装这一个包就够，卸载它们也不影响本插件工作。

## 干什么

两家插件各自为政时：主题的静态工坊画铺在对话列里（`z-index:0`），视频皮肤的视频层却是全屏 `z-index:-1`——静态画**天生压在视频上面**，于是要么有画没视频，要么有视频没画。本插件做三件事：

1. **两个背景互斥显隐**：切「静态画」时视频层整体淡出；切「视频」时只把静态画的**背景**让位（两个女仆立绘是那层的子元素，原地不动）。刻意不写成反向条件（`:not([...="art"])`）——脚本没跑起来时 body 上没有属性，主题便维持原样叠加，降级安全，不会把用户挑的工坊画凭空抹掉；
2. **面板加开关**：在视频皮肤右下角「聊天背景」面板里注入一行**背景画面**（视频 / 静态画），一键切换，选择持久化（localStorage，失败退会话内存）。淡出用 opacity 不用 display:none，视频继续解码，切回不闪不重载；
3. **亮色可读性**：视频皮肤在亮色下用 `!important` 把所有表面刷成**纯白**（`rgba(255,255,255,…)`，实度还偏低），叠在亮壁纸上就是一片惨白——它压掉了主题自己的冷调瓷玻璃。本插件在亮色下接管那四层表面与侧栏，换回与卡片同源的冷调瓷白并压实一档：平均表面亮度 92% → 73%，对比度 15.4:1 → 10.9:1，仍然是亮色，只是不再晃眼。同时把提亮的白纱（`#dsvs-backdrop-veil`）从纯白 0.22 换成冷调 0.10。**暗色一个字不动**——那边本来就正常。

**不管别的插件的事**：raw-html 的可信模式与徽章自 v7.3 起由它自己处理（默认信任、徽章默认不挂载，需要时用 `localStorage.setItem('raw-html.trustedBadge','1')` 唤出）。本插件既不改它的开关，也不压它的样式——早先那两笔（替它写 `raw-html.trusted`、把徽章 `display:none`）都已撤掉，否则用户显式关掉可信模式会被翻回来、主动唤出的徽章会被按死。

**明暗背景不在这里切**：maid-atelier 与 dsh-video-skin 两家都只跟随宿主的 `body[data-ds-dark-theme]`，亮/暗由 DSH 自己的「设置 → 通用 → 外观」决定，两家各自备了双套配色。本插件只补两家都没顾上的可读性缺口——亮色的表面实度就是其中之一。

**为什么亮色写死实度、不读视频皮肤的 `--dsvs-l-*`**：那两个变量是按"底色纯白"的假设定的（surface 0.45 / layer1 0.55），叠在亮壁纸上正是过亮的一半成因；读它等于把问题带回来。亮色下由本插件接管是刻意的——视频皮肤的旋钮在暗色下照旧完全有效。

## 装什么、在哪

**只需要装本插件一个包**（v0.2.0 起）：

```bash
dsh plugin --profile desktop add "github:Valorine97417/dsh-maid-scenery"
```

装完重启 DSH。包内结构：

| 目录 | 是什么 | 上游 |
| --- | --- | --- |
| `index.js` / `client.js` / `runtime/` | 融合层本体（本仓库自有代码，MIT） | — |
| `skin.json` | 皮肤清单：让「皮肤管理」面板认得出本包内置的主题 | — |
| `vendor/video-skin/` | 视频层：开机动画、聊天背景视频、「聊天背景」面板与路由 | dsh-video-skin v0.1.1（MIT） |
| `vendor/maid-atelier/` | 主题层：静态工坊画、蕾丝、Q 版侧栏、31 个哈希素材 | maid-atelier v0.1.7（代码 MIT / 美术 CC BY-NC-SA 4.0） |

**两家上游以零修改形态内置**（仅去除源映射注释），由本包在运行时装配：宿主半边在 `index.js` 里依次调用两家的 `apply`，客户端半边在 `client.js` 里物化 maid-atelier 的浏览器模块。视频层的前端不走 `dsh.client`——照旧由宿主半边经 `webserver/index-inject` 注入。

**装过旧版配套的要先卸掉**：如果 profile 里还装着 `@smalltailqwq/dsh-client-ui-skin-maid-atelier` 或 `dsh-video-skin`，请先 `dsh plugin --profile desktop remove` 掉——两套同样的东西同时在场会重复注入、互相打架（`skin.json` 的 `id` 与 `wiring.id` 两版相同）。

**皮肤管理器怎么还认得出**：皮肤管理器（`@smalltailqwq/dsh-client-ui-skin-deep-whale-manager`）只从 profile 的依赖里找带 `skin.json` 的包，且要求清单里的 `package` 字段等于已装包名。整合后 maid-atelier 不再是独立依赖，所以本包**在包根自曝一份 `skin.json`**：`id` 仍写 `maid-atelier`（换源时「先卸旧主题」的规则不变），`package` 改成本包名，`wiring.id` 对齐本包自己的 patch entry `maid-scenery`，`preview` 与 `desktopIcon` 指到 `vendor/maid-atelier/` 下。于是面板里照旧显示「深海女仆工坊」与它的定制控件。

> 已知边界：皮肤管理器的「切换」开关管的是 `maid-scenery` 这一条 entry 的 `disabled`。由于主题本来就是本包的一部分（随 `client.js` 常驻物化），把它关掉只会停掉融合层的切换行，不会卸掉主题本身——真正的「换成别的皮肤」要等上游支持包内皮肤再补。当前本机只有这一套皮肤，不影响使用。

**为什么要整合**：pnpm 的 `blockExoticSubdeps` 供应链策略禁止 git 协议依赖藏在子依赖里（本包 v0.1.0 就撞过），上游主题只能降为 optional peer——那样「装一个包」就永远做不到，三家谁缺席都要用户自己排查。整合后依赖关系只剩一条，规则也不再需要条件化。

## 设计约束（都来自视频皮肤踩过的坑）

- 注入行只推 `kind:'style'` 与 `kind:'script'`，绝不推 `script-src`（后者失败会打掉 `__DSH_BOOT_READY__`，整个应用起不来）；
- `apply` 同步注册 `webserver/index-inject` 订阅，不依赖任何服务就绪（桌面壳的注入表启动时收集一次，晚订阅没有刷新路径）；
- 运行时脚本任何一步出错都安静待命——装饰品没有资格让页面变红；
- 装配顺序有意为之：先视频层再融合层（`webserver/index-inject` 按监听器注册顺序入表），保持整合前三家独立包时的层叠关系；
- 两家的 `apply` 各自包 `try`——一家挂了不拖死另一家，融合层的切换行照旧可用。

## 变更

### 0.2.0

- **整合两家配套随包分发**：`vendor/video-skin/` 与 `vendor/maid-atelier/` 零修改内置，装一个包全齐，卸载配套插件也不影响。宿主半边由 `index.js` 装配，客户端半边由 `client.js` 物化。上游主题的 optional peer 依赖随之删除。
- **包根自曝 `skin.json`**：整合后 maid-atelier 不再是独立依赖，皮肤管理器便发现不到它。现在本包自己声明皮肤清单（`package` 指向本包、`wiring.id` 对齐 `maid-scenery`），「皮肤管理」面板重新显示「深海女仆工坊」。
- **移除商业版权音频**：视频皮肤上游 `assets/` 只有 `boot.mp4` 与 `background.mp4`；本机曾额外放入 4 个 C418 的 `.flac`，未随包分发。
- **双许可结构**：本包代码 MIT；`vendor/maid-atelier/` 的美术素材仍为上游声明的 CC BY-NC-SA 4.0，署名链完整保留在 `NOTICE`，许可正文在 `LICENSE-ARTWORK`，上游原始声明在 `vendor/maid-atelier/LICENSE-upstream`。

### 0.1.4

- **修掉「切到视频没反应」**（老大报「有背景画面，但视频背景被覆盖了」）：静态工坊画挂在主题的 `character-stage` 上（`z-index:0`），视频层却是全屏 `z-index:-1`——静态画天生压在上面，光淡出视频层没用。现在切「视频」时把静态画的**背景**让位（立绘原地不动），两个模式互斥显隐。
- **撤掉代管 raw-html 的两笔**：raw-html v7.3 起可信模式默认开、徽章默认不挂载，都由它自己管。本插件不再压 `#vcp-trusted-toggle { display:none }`（否则用户用 `raw-html.trustedBadge` 主动唤出的徽章会被按死）。

### 0.1.3

- **亮色过亮修复**（老大报「亮色界面过亮，暗色正常很多」）：亮色下接管四层表面与侧栏，把视频皮肤的纯白换成工坊冷调瓷玻璃并压实一档（平均表面亮度 92% → 73%，对比度 15.4:1 → 10.9:1）；白纱 `#dsvs-backdrop-veil` 从纯白 0.22 换冷调 0.10。暗色不动。
- **修掉一个真 bug**：`scenery.js` 早先每次加载都写 `localStorage['raw-html.trusted'] = '1'`，导致用户显式设 `'0'` 关闭可信模式后又被翻回来——关不掉。现在这一行删掉了：raw-html v7.3 起默认就是开，不需要替它写；用户的选择归用户。

### 0.1.2

- 面板行挂不上修好了（面板只带 id 不带 class）+ 可信模式默认开并隐去徽章 + 主题 peer 换正源。

### 0.1.1

- 主题降为 optional peer + patch 只插自身行——绕开 pnpm `blockExoticSubdeps` 对子依赖 git 协议的封禁。（0.2.0 起此约束已随整合消失。）

### 0.1.0

- 视频背景 × 深海女仆工坊融合层——静态画沉底 + 聊天背景面板切换（视频 / 静态画）。

## 许可

**本包自有代码：MIT**（Copyright (c) 2026 Valorine97417），见 `LICENSE`。

**随包分发的两家上游产物**（三层边界互不覆盖，完整说明见 `LICENSE`）：

| 层 | 代码 | 素材 |
| --- | --- | --- |
| `vendor/video-skin/`（dsh-video-skin v0.1.1） | MIT · Copyright (c) 2026 Something11235 | 视频随 MIT 分发 |
| `vendor/maid-atelier/`（maid-atelier v0.1.7） | MIT · Copyright (c) 2026 Small-tailqwq | **CC BY-NC-SA 4.0** |

**maid-atelier 的美术素材不是 MIT**：角色形象、立绘、背景、图标、preview、装饰素材及其嵌入/转换副本（含内联进 CSS、data URL、`client.js` 的形态）版权保留在各自权利人手中，适用 **CC BY-NC-SA 4.0**——署名必须保留完整创作链、仅限非商业性使用、衍生作品必须以相同方式共享。署名链（一创 **上善** → 二创 **ZipZipPipe** → 三创 **Small-tailqwq**）完整保留在 [`NOTICE`](NOTICE)，许可正文在 [`LICENSE-ARTWORK`](LICENSE-ARTWORK)，上游原始混合声明在 `vendor/maid-atelier/LICENSE-upstream`。

本包只做运行时装配，不改变任何上游作品的许可，也不表示上游作者对本包作出背书。
