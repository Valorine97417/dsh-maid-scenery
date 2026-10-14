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
| `lib/music.js` | 音乐库：正本目录、镜像同步、自动填曲（本仓库自有代码，MIT） | — |
| `skin.json` | 皮肤清单：让「皮肤管理」面板认得出本包内置的主题 | — |
| `vendor/video-skin/` | 视频层：开机动画、聊天背景视频、「聊天背景」面板与路由 | dsh-video-skin v0.1.1（MIT） |
| `vendor/maid-atelier/` | 主题层：静态工坊画、蕾丝、Q 版侧栏、31 个哈希素材 | maid-atelier v0.1.7（代码 MIT / 美术 CC BY-NC-SA 4.0） |

**两家上游以零修改形态内置**（仅去除源映射注释），由本包在运行时装配：宿主半边在 `index.js` 里依次调用两家的 `apply`，客户端半边在 `client.js` 里物化 maid-atelier 的浏览器模块。视频层的前端不走 `dsh.client`——照旧由宿主半边经 `webserver/index-inject` 注入。

**装过旧版配套的要先卸掉**：如果 profile 里还装着 `@smalltailqwq/dsh-client-ui-skin-maid-atelier` 或 `dsh-video-skin`，请先 `dsh plugin --profile desktop remove` 掉——两套同样的东西同时在场会重复注入、互相打架（`skin.json` 的 `id` 与 `wiring.id` 两版相同）。

## 怎么认出「重复的视频层」

上面那条「要先卸掉」不是客套话：两套视频层同时在场时，**症状是安静的**。两边都往 `webServer` 注册同一批 `/dsh-video-skin/*` 路由，先注册的赢下整批，后注册的那批次次撞名抛错——而本包把路由注册包在 `try/catch` 里（装饰品不该让页面变红），失败只落一行 warning，于是页面上看起来"就是少了点什么"：面板里少一行「音乐音量」滑块、播放键报「无可播音乐」、静态素材 404 而背景照旧。**2026-10-14 本机就踩过一次**：profile 里残留的独立 `dsh-video-skin@0.1.1` 赢了路由，把本包内置视频层的路由整批挤掉。

三步就能认出来（`127.0.0.1:19387` 换成实际宿主地址；**路由免鉴权**，鉴权只卡根页面）：

```bash
# ① 装了本包（0.2.x）却回 0.1.1，就是独立包在应答
curl -s http://127.0.0.1:19387/dsh-video-skin/config.json | grep -o '"version":"[^"]*"'
# ② 音乐版独有路由：404 = 本包内置视频层的路由没挂上
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:19387/dsh-video-skin/tracks/x
# ③ profile 里查残留（三处都要干净）
cd "$DSH_HOME/profiles/desktop" && grep -n 'dsh-video-skin' package.json cordis.patch.yml pnpm-lock.yaml
```

处置二选一：

- **彻底**：`dsh plugin --profile desktop remove dsh-video-skin`，重启 DSH（要联网）；
- **只按停**：在 `$DSH_HOME/profiles/desktop/cordis.patch.yml` 末尾加一条 `- id: dsh-video-skin` / `name: dsh-video-skin` / `disabled: true`，重启生效——补丁层在 bundle 层之后，包体留在盘上，删掉这三行即可退回。

同一套判据也适用于别的同类插件（比如 `@smalltailqwq/dsh-client-ui-skin-maid-atelier` 与本包内置主题共用 `/skin-assets/maid-atelier` 前缀）。顺带一提：探路由这个手法本身就好用——`/dsh-*/…` 这些插件端点不校验会话，根页面才要 token。

## 背景音乐（自备，不入库）

视频背景的画面与声音是分开的：`background.mp4` 本身静音，音乐由一条独立的 `<audio>` 循环播放。上游 `assets/` 只带 `boot.mp4` 与 `background.mp4`——**音频由使用者自备**。C418 这类商业版权曲目不进仓库（`.gitignore` 已按扩展名把包内音频挡在 git 索引之外）：本地放着听没问题，**跟着包推上去才是再分发**。

**歌放这里**（0.2.2 起）：

```
$DSH_HOME/dsh-maid-scenery/music/
```

面板右下角圆钮 → 「打开音乐位置」就落到这个目录（不在会先建出来）。丢进去、刷新页面就有声音。

**一首都不用配**：`$DSH_HOME/dsh-video-skin.json` 的 `background.music` 字段缺席时，本包自动填上目录里第一首；**字段一旦在场就一个字都不改**（写 `""` 就是明确要静音）。只有想指定「从哪首开始」时才需要自己写：

```json
{
  "background": {
    "music": "assets/Wet Hands - C418.flac",
    "musicVolume": 0.25
  }
}
```

**为什么正本放 `$DSH_HOME`**：`vendor/` 活在 `node_modules` 里，插件一升级、一重装整包就被换掉——歌丢在那儿，一次更新就没了。现在每次启动同步一遍：包内遗留的音频先「收养」进正本，再把正本每首镜像回包内 `vendor/video-skin/assets/`（同卷走硬链接，零额外空间；跨卷退回复制），正本里删掉的歌，包内旧镜像一并清掉——**一切以正本目录为准**，逻辑全在 `lib/music.js`。

- 文件不在盘上只让这一项降级（日志一条 warning），别的功能照旧。
- **正本目录下的音频会自动组成播放列表**（`music` 指的那首排头，其余按文件名跟随），一首放完自动下一首、到尾回卷——丢几首进去就是一张循环歌单。
- 音量既能写 `musicVolume`，也能用右下角面板的滑块调（默认 `0.25`，垫底氛围，不压聊天）。
- 桌面版（Electron）允许未静音自动播放，刷新即有声音；浏览器形态（`dsh web`）可能拦下自动播放，那时静音降级，不扣住用户。
- **面板里有这一行**：聊天背景面板（右下角圆钮）底部多了「背景音乐」——左边直接报正本目录里有几首（「目录为空」就是还没放歌），右侧两个按钮：
  - 「播放 / 暂停」起停那条 `<audio>`。自动播放被策略拦下时，这一次点击就是那个"用户手势"，音乐能靠它回来；
  - 「打开音乐位置」拉起系统文件管理器（资源管理器 / Finder / xdg-open）直接落到正本目录，目录不存在会先建出来。
  两个端点由本包宿主半边提供：`/dsh-maid-scenery/music.json`（报正本目录与曲目清单）、`/dsh-maid-scenery/open-music-folder`（只认 POST，免得页面一加载就被预取弹窗）。

## 面板圆钮可以拖

聊天背景那个圆钮（◨）上游是焊死在右下角的（`#dsvs-knobs-pill` 的 `right:16px / bottom:16px`）。宽屏下它离聊天区很远，所以本包在融合层给它加了**拖动 + 就近吸边**：按住拖到顺手的位置（比如左下角跟挂件并排），松手吸到最近的一侧，垂直位置留住。活动范围只限**对话框那一列**（侧边栏右边、标题条下面）——拖不进侧边栏，也压不到标题条。

- 位置记在 `localStorage['dsh-maid-scenery-knobs']`（`{side:'left'|'right', y}`）：换页面、重开 DSH 都还在原处；读不到存储就退回右下角的出厂位置。
- 面板跟着圆钮走：默认贴在圆钮**上方**，上方塞不下（圆钮被拖到屏幕上半段）自动翻到下方。
- 拖动时先把面板收起（不然一个 268px 的框跟着飘），松手那一次 `click` 被吞掉——不会「拖完顺手把面板打开」。一次没动的点击照旧是开关面板（`Alt+B` 同理）。
- 触摸屏可用：给可拖圆钮开了 `touch-action: none`，否则手指一动会变成滚聊天记录。
- **活动范围是对话框，不是整个窗口**：横向以中间列（`[class*='centerCol']`）的左右缘为界、纵向以它的上下缘为界，拖动时内缩 4px、吸边时内缩 16px；侧边栏展开/收起、窗口改尺寸都会重新量一遍，圆钮跟着对话框挪。哪天选择器认不出来（页面 class 改名），才退回整个视口，不至于拖不动。
- 只改圆钮与面板的定位样式，**不碰 vendor**：点击开合、透明度滑块、音乐音量那一整套仍归视频皮肤自己。

想知道拖得对不对，别靠眼看：`node scripts/drag-smoke.mjs` 会把 `runtime/scenery.js` 真拉进一个迷你 DOM 里跑，喂一串 `pointerdown / move / up`，断言跟手、吸边、夹回对话框、位置记忆与点击吞噬（19 条）。

**皮肤管理器怎么还认得出**：皮肤管理器（`@smalltailqwq/dsh-client-ui-skin-deep-whale-manager`）只从 profile 的依赖里找带 `skin.json` 的包，且要求清单里的 `package` 字段等于已装包名。整合后 maid-atelier 不再是独立依赖，所以本包**在包根自曝一份 `skin.json`**：`id` 仍写 `maid-atelier`（换源时「先卸旧主题」的规则不变），`package` 改成本包名，`wiring.id` 对齐本包自己的 patch entry `maid-scenery`，`preview` 与 `desktopIcon` 指到 `vendor/maid-atelier/` 下。于是面板里照旧显示「深海女仆工坊」与它的定制控件。

> 已知边界：皮肤管理器的「切换」开关管的是 `maid-scenery` 这一条 entry 的 `disabled`。由于主题本来就是本包的一部分（随 `client.js` 常驻物化），把它关掉只会停掉融合层的切换行，不会卸掉主题本身——真正的「换成别的皮肤」要等上游支持包内皮肤再补。当前本机只有这一套皮肤，不影响使用。

**不装皮肤管理器也能保住你的设置**：定制项（立绘、字体、导航、输入框、横幅高度）的**登记**在本包 `client.js`，而**执行**一向由皮肤管理器负责——它读自己的偏好表再回调 `apply`。只装本包时没人调用，观感会掉回样式表默认。0.2.1 起本包自带兜底：启动时自己读同一份 `localStorage['dsh.skin-manager.preferences.v2']` 并投影一次，之后管理器上线照旧接管（两边同源，不会互相覆盖）。**出厂基线也集中一处**：`client.js` 的 `SKIN_DEFAULTS` 同时喂给 `settings.defaultValue` 与兜底投影，新装用户看到的默认样子在这里改一次就够。

**为什么要整合**：pnpm 的 `blockExoticSubdeps` 供应链策略禁止 git 协议依赖藏在子依赖里（本包 v0.1.0 就撞过），上游主题只能降为 optional peer——那样「装一个包」就永远做不到，三家谁缺席都要用户自己排查。整合后依赖关系只剩一条，规则也不再需要条件化。

## 设计约束（都来自视频皮肤踩过的坑）

- 注入行只推 `kind:'style'` 与 `kind:'script'`，绝不推 `script-src`（后者失败会打掉 `__DSH_BOOT_READY__`，整个应用起不来）；
- `apply` 同步注册 `webserver/index-inject` 订阅，不依赖任何服务就绪（桌面壳的注入表启动时收集一次，晚订阅没有刷新路径）；
- 运行时脚本任何一步出错都安静待命——装饰品没有资格让页面变红；
- 装配顺序有意为之：先视频层再融合层（`webserver/index-inject` 按监听器注册顺序入表），保持整合前三家独立包时的层叠关系；
- 两家的 `apply` 各自包 `try`——一家挂了不拖死另一家，融合层的切换行照旧可用。

## 变更

### 0.2.2

- **音乐正本搬进 `$DSH_HOME/dsh-maid-scenery/music/`**：包内 `vendor/video-skin/assets/` 降级成镜像（同卷走硬链接，跨卷退回复制），插件升级、重装不再把歌弄丢。每次启动同步一遍——收养包内遗留音频 → 按正本镜像 → 清掉正本已删的旧镜像；全部逻辑在 `lib/music.js`。
- **「丢进目录就能播」**：`dsh-video-skin.json` 的 `background.music` 字段缺席时自动填上目录第一首；字段在场（含空串＝静音）一个字都不改。
- **面板「打开音乐位置」与 `music.json` 报的都是正本目录**（以前指包内 `assets/`，那正是重装会丢的那一处）。
- **README 补「怎么认出重复的视频层」一节**：两个同类插件同时在场时症状是安静的（少一行滑块、独有路由 404、config 回旧版本号），这一节给可照做的三步核对与两种处置（彻底 remove / patch 里只按停），顺带记下"插件端点免鉴权、根页面才要 token"这个探路手法。
- 冒烟从 103 条增到 114 条：新增音乐库九条（收养 / 镜像 / 清理 / 自动填曲三条边界 / DSH_HOME 解析），并修掉一条在 CRLF 下永远失败的基线断言（`workspaceRowHeight` 是本段最后一项、后面跟的是换行，旧断言只认逗号）。

### 0.2.1

- **出厂基线集中一处**：新增 `SKIN_DEFAULTS`（`client.js`），设置页每一项的 `defaultValue` 都从它取值，不再是散落的字面量。以后想改「新装用户看到的默认样子」，改这一处即可。
- **不装皮肤管理器也能保住设置**：启动时自己读 `localStorage['dsh.skin-manager.preferences.v2']` 的 `maid-atelier` 段并投影一次（含「不那么二次元模式」的时间段判断）。管理器在线时会重新 `apply`，读的是同一份值——同源，不打架。
- 「显示双女仆立绘」默认关、「对话区字体」默认 Georgia 衬线（#22），与主人的取舍对齐。

### 0.2.0

- **整合两家配套随包分发**：`vendor/video-skin/` 与 `vendor/maid-atelier/` 零修改内置，装一个包全齐，卸载配套插件也不影响。宿主半边由 `index.js` 装配，客户端半边由 `client.js` 物化。上游主题的 optional peer 依赖随之删除。
- **包根自曝 `skin.json`**：整合后 maid-atelier 不再是独立依赖，皮肤管理器便发现不到它。现在本包自己声明皮肤清单（`package` 指向本包、`wiring.id` 对齐 `maid-scenery`），「皮肤管理」面板重新显示「深海女仆工坊」。
- **商业版权音频不入库**：视频皮肤上游 `assets/` 只有 `boot.mp4` 与 `background.mp4`；本机曾额外放入 4 个 C418 的 `.flac`，整合时按扩展名挡在 **git 索引**之外（本地自用照旧，不进仓库即不构成再分发）。怎么配自己的背景音乐见上节「背景音乐（自备，不入库）」。
- **面板圆钮可拖**：聊天背景的圆钮加了拖动 + 就近吸边 + 位置记忆（见上节「面板圆钮可以拖」），上游写死的右下角不再是唯一答案；活动范围限定在对话框那一列里，拖不进侧边栏。
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
