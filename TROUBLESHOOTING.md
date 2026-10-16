# dsh-maid-scenery · 问题与解决记录

> 用途：换新设备（或重装 DSH）时按这份记录避坑。每条按「症状 → 原因 → 解法 → 验证方式」写，症状尽量照抄实际看到的现象／报错。
> 素材来源：仓内 README／源码注释／git 提交记录、记忆库（项目 `dsh-maid-scenery`）、本机实测（2026-10-16）。
> 只写有据可查的条目；证据不足的标「（待核）」。
> 最后更新 2026-10-16 ｜ 对应版本 v0.2.3

---

## 一、安装与部署

### 1.1 pnpm 拒绝 git 协议子依赖（`blockExoticSubdeps`）

- **症状**：安装时 pnpm 因供应链策略拒绝把 git 协议依赖放进子依赖（v0.1.0 撞过一次；报错原文未留档，**（待核）**）。
- **原因**：pnpm 默认策略 `blockExoticSubdeps` 禁止子依赖使用 git 协议——主题与视频层若作为「依赖的依赖」，装不上。
- **解法**：v0.1.1 的临时绕法是主题降为 optional peer、patch 只插自身行；**v0.2.0 起两家配套随包分发**（`vendor/video-skin/`、`vendor/maid-atelier/` 零修改内置），依赖关系只剩一条，这条约束已消失。新设备直接装 0.2.x 即可。
- **验证方式**：`$DSH_HOME/profiles/desktop/package.json` 里只出现 `"dsh-maid-scenery"` 一条相关依赖。
- **相关提交**：`fb58639` v0.1.1、`d7e02ba` v0.2.0。

### 1.2 装了旧版配套插件 → 症状是「安静地少东西」

- **症状**（不报红、不弹窗，就是"少了点什么"）：
  - 面板里少一行「音乐音量」滑块；
  - 播放键点了报「无可播音乐」；
  - 静态素材 404，而背景视频照旧能出；
  - `/dsh-video-skin/config.json` 回出来的版本号还是 `0.1.1`。
- **原因**：profile 里残留独立 `dsh-video-skin@0.1.1`。两套视频层往 `webServer` 注册同一批 `/dsh-video-skin/*` 路由，先注册的赢下整批，本包内置那批次次撞名抛错；而本包把路由注册包在 `try/catch` 里，失败只落一行 warning。**2026-10-14 本机真踩过一次**。
- **解法**（二选一）：
  - 彻底：`dsh plugin --profile desktop remove dsh-video-skin`，重启 DSH（要联网）；
  - 只按停：在 `$DSH_HOME/profiles/desktop/cordis.patch.yml` 末尾加
    ```yaml
    - id: dsh-video-skin
      name: dsh-video-skin
      disabled: true
    ```
    重启生效；补丁层在 bundle 层之后，包体留在盘上，删掉这三行即可退回。
- **验证方式**（三步，`127.0.0.1:19387` 换成实际宿主地址；**插件端点免鉴权**，鉴权只卡根页面）：
  ```bash
  # ① 装了 0.2.x 却回 0.1.1，就是独立包在应答
  curl -s http://127.0.0.1:19387/dsh-video-skin/config.json | grep -o '"version":"[^"]*"'
  # ② 音乐版独有路由：404 = 本包内置视频层的路由没挂上
  curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:19387/dsh-video-skin/tracks/x
  # ③ profile 里查残留（三处都要干净）
  cd "$DSH_HOME/profiles/desktop" && grep -n 'dsh-video-skin' package.json cordis.patch.yml pnpm-lock.yaml
  ```
  同一套判据也适用于 `@smalltailqwq/dsh-client-ui-skin-maid-atelier`（与本包内置主题共用 `/skin-assets/maid-atelier` 前缀）——**装过旧版配套的要先卸掉**。

### 1.3 装完不重启 → 看不出任何变化

- **症状**：装完（或改了 `runtime/`）后 F5、Ctrl+Shift+R 都没用，界面还是原样。
- **原因**：融合层注入行走宿主 `webserver/index-inject`，**注入表只在宿主启动时收集一次、没有刷新路径**。
- **解法**：装完／改注入行后**重启 DSH**。
- **验证方式**：打开控制台看有没有 `[scenery] …` 日志；另可查端点 `/dsh-maid-scenery/music.json` 是否 200。

### 1.4 界面卡死／起不来的保命操作

- **症状**：装完后界面卡死、进不去。
- **原因**：客户端半边（`client.js`）或主题客户端在启动链上出问题。
- **解法**：把 `$DSH_HOME/profiles/desktop/package.json` 的 `dsh.profile.bundles` 里 `"dsh-maid-scenery"` 删掉，重启即回原生界面（不用卸载包）。
- **验证方式**：重启后界面恢复原生外观即可。

### 1.5 安装命令

```bash
dsh plugin --profile desktop add "github:Valorine97417/dsh-maid-scenery"
```
本机开发态用的是 link（`$DSH_HOME/profiles/desktop/package.json`）：
```json
"dsh-maid-scenery": "link:D:/DeepSeek Harness/Works/dsh-maid-scenery"
```
- **注意**：`dsh` 的 `dsh.client` 入口只有 `./client`（单入口），`immediately: true`、`inject: []`——整合后的主题客户端由 `client.js` 用 `__ModuleLoader__.load` 尾部追加物化，不依赖 maid-atelier 再作为 profile 依赖（2026-10-13 实测契约）。

---

## 二、素材与路径问题

### 2.1 maid-atelier 素材满屏 404

- **症状**：静态画、蕾丝、Q 版侧栏素材全 404，`/skin-assets/maid-atelier/*` 取不到文件。
- **原因**：上游 `index.host.js` 原本在 `lib/` 下，`'../assets/runtime/'` 指向包根 `assets/`；搬进 `vendor/maid-atelier/` 后该文件已在包根一层，路径便解析到**不存在的 `vendor/assets/`**。
- **解法**：`vendor/maid-atelier/index.host.js` 里改成 `'./assets/runtime/'`。
- **验证方式**：素材路由真取到文件（200 + `immutable` + `nosniff`）、白名单外 404、非 GET/HEAD 405。冒烟补了这四条断言。
- **相关提交**：`927b914`。

### 2.2 locale 目录重复嵌套

- **症状**：主题文案加载不到（路径里出现 `locale/locale/`）。
- **原因**：搬包时目录多套了一层 `locale/`。
- **解法**：`vendor/maid-atelier/locale/{en,zh}.json` 上提一层（`57fefa9`）。
- **验证方式**：`ls vendor/maid-atelier/locale` 只应有 `en.json`、`zh.json`。

### 2.3 歌丢在 `node_modules` 里，一次升级就没了

- **症状**：装好的背景音乐，插件升级／重装后消失。
- **原因**：歌原本只能丢在 `vendor/video-skin/assets/`，那活在 `node_modules` 里，整包被换掉就跟着没。
- **解法**（0.2.2 起）：歌的**正本**在
  ```
  $DSH_HOME/dsh-maid-scenery/music/
  ```
  本地本机实测即 `C:\Users\Kayle\.dsh\dsh-maid-scenery\music\`。包内 `vendor/video-skin/assets/` 降级成**镜像**：每次启动同步一遍——① 收养包内遗留音频进正本 → ② 按正本镜像回包内（同卷走**硬链接**零额外空间，跨卷退回复制）→ ③ 清掉正本已删的旧镜像。逻辑全在 `lib/music.js`。
- **验证方式**：`$DSH_HOME/dsh-maid-scenery/music-mirror.json` 记录本轮镜像名单；`ls` 正本与包内 `assets/` 应一致；面板标签报「背景音乐 · N 首」。
- **注意**：`music-mirror.json` 里的名字在**收养阶段会被跳过**——否则"删歌"永远删不掉。

### 2.4 `git status` 里音频的处理

- **症状**：本地放了商业版权曲目（如 C418 的 `.flac`），怕跟着包推上去。
- **原因**：音频跟着包推上去＝再分发。
- **解法**：`.gitignore` 按扩展名挡住包内音频（`.flac/.mp3/.ogg/.oga/.opus/.m4a/.aac/.wav`），本地自用照旧；**闸门是「git 索引里不许有音频」，不是「磁盘上不许有」**。
- **验证方式**：`git status --short` 干净、`git ls-files vendor/video-skin/assets | grep -i flac` 无输出。

### 2.5 面板显示「背景音乐 · 目录为空」／「无可播音乐」

- **症状**：面板那行直接写着「目录为空」；点播放报「无可播音乐」。
- **原因**：① 正本目录里没有音频；② 背景层延后约 1.2 秒才建 `<audio id="dsvs-backdrop-music">`，问得太早会取不到元素。
- **解法**：面板右下角圆钮 →「打开音乐位置」把歌丢进去（目录不存在会先建出来），刷新页面；元素未建时代码刻意**保持原样不乱报**，头一分钟每秒对一次表。
- **验证方式**：`curl -s http://127.0.0.1:19387/dsh-maid-scenery/music.json` 看到 `count`／`tracks`。

### 2.6 有歌但没声音：检查 `musicVolume` 是不是 0

- **症状**：目录里有歌、播放键也正常，就是没声音。
- **原因**：`$DSH_HOME/dsh-video-skin.json` 的 `background.musicVolume` 为 `0`（面板音量滑块会把值写回这个文件；本机 2026-10-16 实测该值就是 `0`）。
- **解法**：面板滑块调回来，或直接改 json 后重启。
- **验证方式**：`cat "$DSH_HOME/dsh-video-skin.json"` 看 `background.musicVolume`。
- **补充**：`background.music` **字段缺席**时本包自动填目录第一首；**字段一旦在场一个字都不改**（写 `""` ＝明确要静音）。
- **相关提交**：`f05885c`、`f3e652e`。

### 2.7 跟上游：`upstream-sync` 一键拉新（0.2.3 起）

- **背景**：两家 vendor 的原作者都没停更（maid-atelier 与 dsh-video-skin 都在发新版），本包需要对上游保持跟进能力。**不接管上游、不 fork**，对上游零修改内置，跟进靠 `scripts/upstream-sync.mjs`。
- **用法**（三条子命令）：
  ```bash
  node scripts/upstream-sync.mjs check           # 看两家上游有没有新版本（git ls-remote，须带 -c http.proxy）
  node scripts/upstream-sync.mjs init            # 首次建 manifest 白名单（一般不用重跑）
  node scripts/upstream-sync.mjs sync <target>   # 拉新：--target maid-atelier / video-skin
  ```
- **机制**：manifest 白名单映射（video-skin 9 文件、maid-atelier 58 文件；重命名 `index.js→index.host.js`、`lib/client.js→client.js`、`lib/index.js→index.host.js`；`LICENSE-upstream` 与 `*.flac` 挡在 protect 外）；用 git blob sha1 增量，本地已一致的文件跳过不下载。
- **相关提交**：本条随 0.2.3 上线。

### 2.8 sync 把本地整合调整冲掉了（素材路由 404）

- **症状**：sync maid-atelier 后 `node scripts/smoke.mjs` 112 PASS / 2 FAIL——「素材路由真能取到文件」404、「素材响应带 immutable 缓存头」失败；页面里静态画全 404。
- **原因**：上游 0.1.8 的 `lib/index.js` 用 `new URL("../assets/runtime/", import.meta.url)`（上游文件在 `lib/` 下，`..` 指包根）；vendor 拉平到根后必须 `./assets/runtime/`。scenery v0.2.1 手工调过一处（见 2.1），**sync 拉上游原文覆盖把它冲掉了**。
- **解法**：manifest 加 `overrides` 段——per-file 的本地调整声明：
  ```json
  "maid-atelier": {
    "overrides": [{
      "v": "index.host.js",
      "why": "整合改动（dsh-maid-scenery v0.2.1）：上游文件在 lib/ 下，../assets/ 指向包根；vendor 里放在根下少一层，须为 ./assets/。",
      "replacements": [["installSkinAssets(ctx, \"maid-atelier\", new URL(\"../assets/runtime/\", import.meta.url), manifest_default);",
                        "installSkinAssets(ctx, \"maid-atelier\", new URL(\"./assets/runtime/\", import.meta.url), manifest_default);"]]
    }]
  }
  ```
  sync 拉新后自动重放（split/join 全替换 + 命中数校验，不齐打 ⚠）；`applied[v]` 记录 override 后的 blob sha，skip 判定认它——**以后上游随便改，这条永不丢**。
- **验证方式**：sync 重放后 smoke 恢复 114 PASS / 0 FAIL；再跑一次 sync 应「58 全 skip」（幂等）。
- **相关提交**：本条随 0.2.3 上线。

### 2.9 `git ls-remote` 直连挂死（upstream-sync 卡 21 秒超时）

- **症状**：`node scripts/upstream-sync.mjs check` 卡住不动，报 `Failed to connect to github.com port 443 after 21069 ms: Couldn't connect to server`。
- **原因**：git 不带 `-c http.proxy` 走直连，本机网络下 github.com:443 直连不通（curl 同族问题也见过 exit 35）。
- **解法**：脚本已内置（`PROXY = 7890`，可用 `HTTPS_PROXY` 环境变量覆盖）——`git ls-remote` 与 raw.githubusercontent.com 请求都走 `http://127.0.0.1:7890`。**自己写脚本时别忘这条**。
- **验证方式**：`git -c http.proxy=http://127.0.0.1:7890 ls-remote https://github.com/Small-tailqwq/dsh-maid-atelier.git HEAD` 秒回。
- **相关提交**：本条随 0.2.3 上线。

---

## 三、渲染与主题切换问题

### 3.1 切「视频」没反应（静态画压着视频）

- **症状**：老大报「**有背景画面，但视频背景被覆盖了**」——切到「视频」看不出视频。
- **原因**：静态工坊画挂在主题的 `[data-skin-chrome="character-stage"]` 上（`z-index:0`），视频层 `#dsvs-backdrop` 却是全屏 `z-index:-1`——**静态画天生压在视频上面**，光淡出视频层没用。
- **解法**：改**互斥显隐**——「静态画」模式把视频层整体淡出（`opacity:0`，不用 `display:none`，视频继续解码，切回不闪不重载）；「视频」模式只清 `character-stage` 的 **`background`**（两个女仆立绘是它的子元素，原地不动）。条件刻意写成 `body[data-maid-scenery="video"]` 而不是 `:not([...="art"])`——脚本没跑起来时 body 上没这个属性，主题维持原样叠加，**降级安全**（不会把用户挑的工坊画凭空抹掉）。
- **验证方式**：控制台执行 `document.body.dataset.maidScenery` 看是 `video` 还是 `art`；切「静态画」时 `#dsvs-backdrop` 的 computed opacity 为 0。
- **相关提交**：`7ec1e20` v0.1.4。

### 3.2 面板里少「背景画面」那一行（选择器用了 class 找 id）

- **症状**：聊天背景面板正常，但「背景画面」这一行**就是没有**——scenery 注入失败。
- **原因**：vendor 面板元素**只带 id、不带 class**。`document.querySelector('.dsvs-knobs')` 永远 `null`，必须 `getElementById('dsvs-knobs')`。
- **解法／类名对照**（改面板前必看）：

  | 东西 | 真身 |
  | --- | --- |
  | 面板 | `id='dsvs-knobs'`（**无 class**） |
  | 右下圆钮 | `id='dsvs-knobs-pill'`（是 id 不是 class） |
  | 行容器 | class `.dsvs-knobs-row` |
  | 标签 | class `.dsvs-knobs-label` |
  | 预设按钮 | class `.dsvs-knobs-preset`（组容器 `.dsvs-knobs-presets`） |
  | 激活态 | 挂在 `data-active="1"` 上，**不是** `aria-pressed` |

- **验证方式**：`document.getElementById('dsvs-knobs')` 有值，且里面存在 `[data-scenery-switch]`。
- **相关提交**：`416e85b` v0.1.2。

### 3.3 亮色界面过亮（暗色正常）

- **症状**：老大报「**亮色界面过亮，暗色正常很多**」。
- **原因**：dsh-video-skin 在亮色下用 `html[data-dsvs="on"] body`（特异性 0,1,2 + `!important`）把所有表面刷成**纯白** `rgba(255,255,255,…)`，且实度偏低（surface 0.45 / layer1 0.55），压过了 maid-atelier 自己的冷调瓷玻璃（`#f8faffb8` / `#ebf0fad6`，实度 0.72–0.88）——亮壁纸透出大半 + 纯白叠加 ⇒ 界面惨白。另一半成因是提亮白纱 `#dsvs-backdrop-veil` 的纯白 0.22。
- **解法**：亮色下由本插件接管四层表面与侧栏，换回冷调瓷白并压实一档（`runtime/scenery.css` E 段，全部 `!important`）：
  ```css
  html[data-dsvs="on"] body:not([data-ds-dark-theme]) {
    --dsw-alias-bg-base:          rgba(201, 213, 239, 0.88);
    --dsw-alias-bg-layer-1:       rgba(209, 219, 243, 0.88);
    --dsw-alias-bg-layer-2:       rgba(217, 226, 246, 0.90);
    --dsw-alias-bg-layer-3:       rgba(225, 232, 249, 0.90);
    --dsw-specific-sidebar-fill:  rgba(205, 216, 241, 0.88);
  }
  ```
  白纱 `#dsvs-backdrop-veil` 从纯白 0.22 换成 `rgba(226, 233, 246, 0.1)`。**暗色一个字不动**。
- **为什么写死实度、不读 `--dsvs-l-*`**：那两个变量是按"底色纯白"假设定的，读它等于把问题带回来。
- **验证方式**：纯白壁纸最坏情况下，平均表面亮度 **92% → 73%**、对比度 **15.4:1 → 10.9:1**（仍远高于 4.5:1）。
- **相关提交**：`4048456` v0.1.3。

### 3.4 深色锁定（外观三按钮不再改变界面）

- **症状／需求**：老大原话（m01089）「**帮我改一下只用深色主题界面，不再随通用设置里的外观三个按钮变化。**」
- **原因**：DSH 深色变量挂在 `body[data-ds-dark-theme]` 上，跟着「设置 → 通用 → 外观」走。
- **解法**：`runtime/scenery.js` ⑤ 钉住该属性（缺了就补回），CSS 侧补 `html[data-ds-dark-theme], html:has(body[data-ds-dark-theme]) { color-scheme: dark }`——否则滚动条与原生控件（输入框、下拉、日期选择）会在深色界面上跳回亮色。
- **验证方式**：切换通用设置里的外观三按钮，界面不再变化；输入框下拉仍是深色。
- **相关提交**：`3759e27`。

### 3.5 圆钮刷新后被按进侧边栏（报过两次）

- **症状**：老大 m01141 / m01169 两次报——圆钮（`side='left'`）跑到左侧边栏里去了。
- **原因**：`KNOBS_FRAME` 第三顺位兜底曾是 `main`，**刷新瞬间真对话列还没挂上**时它命中含侧边栏的整页容器（左缘贴窗口），于是按左缘落位就落进侧边栏。另一条路径：对话列初帧零尺寸时走「视口兜底」落位。
- **解法**：
  - `KNOBS_FRAME` 只认 `[class*='centerCol']` 与 `[data-slot='conversation.session']`，**绝不能再加 `main` 之类整页兜底**；
  - `frameReady()` 要求同时满足 `width > 160 && height > 120 && left >= 40`（侧边栏折叠也还有 56px，40 这条线安全）；不满足就**宁可不落位**，留在 CSS 出厂位；
  - 落位时机＝初始化 + `ResizeObserver` + `[0,150,500,1500]ms` 定时补位（尺寸没变时 RO 根本不回调，初帧错位会一直留着）。
- **验证方式**：`node scripts/drag-smoke.mjs`（20 PASS），含「布局没长好时不落位」回归。
- **相关提交**：`bc8bf65`、`3759e27`、`714a0be`。

### 3.6 圆钮相关的小坑（一并记）

| 症状 | 原因 | 解法 |
| --- | --- | --- |
| 触摸屏上手指一动变成滚聊天记录 | 没关掉浏览器的手势抢占 | 可拖圆钮开 `touch-action: none`（仅脚本挂上 `data-scenery-drag="1"` 后生效） |
| 拖完松手，面板自己弹开了 | 拖动尾巴那次 `click` 被 vendor 的开关逻辑吃掉 | 拖动结束时吞掉这一次 `click`；一次没动的点击照旧开关面板（`Alt+B` 同理） |
| 换了版本后圆钮位置乱跑 | 存储里是半截旧结构数据 | `readKnobs()` 只认完整两字段（`side ∈ {left,right}` 且 `y` 有限），否则退回出厂位 |
| 拖动中面板跟着飘 | 268px 的面板跟着圆钮走 | 拖动起手先收面板 |
| 圆钮拖到屏幕上半段后面板被切在视口外 | 面板默认贴圆钮**上方** | 上方塞不下自动翻到下方；`#dsvs-knobs` 加 `max-height: calc(100vh - 32px); overflow-y: auto` |
| 圆钮压不到标题条、进不了侧边栏 | 活动范围没限定 | 横向以中间列为界、纵向以它的上下缘为界；拖动内缩 4px、吸边内缩 `KNOBS_GAP = 16px` |

- **出厂值**（vendor 写死，本包只补定位）：`right:16px; bottom:16px`、32×32、`transition 220ms`、面板 268px 宽挂底部 58px 处。
- **存储键**：`localStorage['dsh-maid-scenery-knobs'] = {side, y}`。

### 3.7 可信模式徽章与圆钮撞位（已不归本插件管）

- **症状**：raw-html 的盾锁徽章（右下角、`fixed`）与视频皮肤面板圆钮**同位重叠**。
- **原因／现况**：raw-html v7.3 起自己解决——可信模式**默认开**、徽章**默认不挂载**（需要时 `localStorage.setItem('raw-html.trustedBadge','1')` 再刷新唤出）。
- **解法**：本插件**撤掉**了早先那条 `#vcp-trusted-toggle { display:none }`——再压会把你主动唤出的徽章按死。
- **顺带一个真 bug（已修）**：`scenery.js` 早先每次加载都写 `localStorage['raw-html.trusted'] = '1'`，导致用户显式设 `'0'` 关闭可信模式后又被翻回来——**关不掉**。现在这一行删掉了。
- **验证方式**：控制台 `localStorage.getItem('raw-html.trusted')` 应保持你设的值不被改写。
- **相关提交**：`4048456`。

### 3.8 窗口顶栏／右侧栏跟主题对不上

- **症状**：老大报「界面美化还剩两个问题」：① 顶栏一条平色带像块贴上去的色板；② 右侧栏「一片单调的蓝」。第一版改完老大反馈「**还是一样**」。
- **原因**：① DSH 在 `html[data-windows-titlebar]` 下用 `.frame::before` 预留拖动区，底色直接取 `--dsw-specific-sidebar-fill`；② Windows 下 `[data-rightbar-col]` 本身没底色，实底来自主题给浮层写的 `--dsw-alias-bg-overlay: rgba(13,25,59,.98)`，视频皮肤只半透明化了 `--dsw-alias-bg-base` 与 sidebar-fill，没管 overlay，于是整栏透不上来。
- **解法（第三版，方向修正）**：老大要的不是「让视频透上来」，而是这两条边**看起来是主题的一部分**——两处都改**实心**深蓝表面、各缝一条金线收边（金只做线不做面），顶栏底色直接取 `--dsw-alias-bg-layer-2`（主题把面板蓝写在这里），右栏顶部加一道殿蓝柔光；`[data-dockkit-pane]` / `[data-dockkit-float]` / `[data-sidebar-right-session]` 都是 DSH 写在 DOM 上的稳定锚点。亮色下换同族冷调瓷白。
- **注意**：选择器**不再写死 `html` 前缀**（写死过一次，规则空转、改了没生效）；配合深色锁定后只在暗色下生效。
- **相关提交**：`3759e27`。

### 3.9 侧边栏展开后按钮消失 / 输入框内图片显示异常（待核）

- **症状**：老大报过两处——④ 侧边栏展开后按钮消失；⑤ 输入框内图片显示异常；另有一条「**图片不显示**」。
- **已知**：当时已排除 scenery 的 CSS 嫌疑，疑上游主题；此后主题从二手搬运版 `@dsh-external` 换成**正源 Small-tailqwq 0.1.7**（比搬运版新六个小版本），换源后**未见单独复报**，但也没做过正式复验收口。图片不显示那条**等老大 Network 取证，至今未取**。
- **若再冒头**：先核对当前主题版本，再看本包覆盖段（`runtime/scenery.css` 的 E / G 段）；不要再翻 ego 侧边栏美化线的旧账（那条已按拍板全清回 0.8.6 原版，插件也已卸载）。
- **状态**：**（待核）**——未解决结论，保留记录。

### 3.10 重装后设置丢了

- **症状**：没装皮肤管理器时，立绘／字体／导航等定制项掉回样式表默认。
- **原因**：登记项在本包 `client.js`，执行一向由皮肤管理器读自己的偏好表再回调 `apply`；只装本包时没人调用。
- **解法**（0.2.1 起）：本包启动时自己读同一份 `localStorage['dsh.skin-manager.preferences.v2']` 的 `maid-atelier` 段并投影一次，管理器上线后照旧接管（两边同源，不会互相覆盖）。出厂基线集中在 `client.js` 的 `SKIN_DEFAULTS`（立绘默认关、对话区字体默认 Georgia 衬线 #22）——**改「新装用户的默认样子」只改这一处**。
- **相关提交**：`70b2427`。

---

## 四、关键路径与配置落点

| 东西 | 位置 |
| --- | --- |
| 本仓库 | `D:\DeepSeek Harness\Works\dsh-maid-scenery`（远端 `Valorine97417/dsh-maid-scenery`，**私有**） |
| `$DSH_HOME`（本机实测） | `C:\Users\Kayle\.dsh` |
| profile 依赖 | `$DSH_HOME/profiles/desktop/package.json` → `"dsh-maid-scenery": "link:D:/DeepSeek Harness/Works/dsh-maid-scenery"` |
| 界面卡死保命位 | 同上文件的 `dsh.profile.bundles` 里的 `"dsh-maid-scenery"` 一行 |
| 视频层配置 | `$DSH_HOME/dsh-video-skin.json`；可调键 `boot.enabled`、`background.{music, musicVolume}` 与 `OVERRIDE_KEYS = [surface, surfaceLight, veil, veilLight, musicVolume]` |
| 音乐正本 | `$DSH_HOME/dsh-maid-scenery/music/` |
| 镜像名单 | `$DSH_HOME/dsh-maid-scenery/music-mirror.json` |
| 包内镜像 | `vendor/video-skin/assets/` |
| 本包唯一改造点 | `runtime/scenery.css` / `runtime/scenery.js`（vendor 两家零修改，只去掉源映射注释） |

**端点**（插件端点免鉴权；根页面才要 token）：

```
/dsh-video-skin/boot.mp4        /dsh-video-skin/background.mp4
/dsh-video-skin/music.mp3       /dsh-video-skin/tracks/<文件名>
/dsh-video-skin/config.json     /dsh-video-skin/override      (POST 存 / DELETE 恢复默认)
/skin-assets/maid-atelier/*     （主题素材，哈希命名，immutable）
/dsh-maid-scenery/music.json            （报 dir / count / tracks）
/dsh-maid-scenery/open-music-folder     （只认 POST，免得页面一加载就被预取弹窗）
```

**localStorage 键**：

| 键 | 用途 |
| --- | --- |
| `dsh-maid-scenery-mode` | 背景画面模式：`video` / `art`（读不到退会话内存 `window.__maidSceneryMode`） |
| `dsh-maid-scenery-knobs` | 圆钮位置 `{side:'left'\|'right', y}` |
| `dsh.skin-manager.preferences.v2` | 皮肤偏好（`maid-atelier` 段，本包兜底读、管理器主读） |
| `raw-html.trusted` / `raw-html.trustedBadge` | raw-html 自己的开关，**本插件不碰** |

**DOM 锚点与属性**：

- `body[data-maid-scenery="video"|"art"]`（本插件挂牌，脚本没跑就没有）
- `body[data-ds-dark-theme]`（深色锁定钉住）、`html[data-dsvs="on"]`（视频皮肤挂牌）
- `[data-skin-chrome="character-stage"]`（静态画 + 立绘层）、`#dsvs-backdrop` / `#dsvs-backdrop-veil`
- `[class*='centerCol']`（对话列，兜底 `[data-slot='conversation.session']`）、`.BynINW_sidebarCol`（侧栏）
- `#dsvs-knobs` / `#dsvs-knobs-pill`（面板与圆钮，**都只有 id**）

**生效边界（三条路，别一概而论）**：

| 改了什么 | 怎么生效 |
| --- | --- |
| `runtime/scenery.css` / `scenery.js`（融合层注入行） | **必须重启 DSH**（F5 / Ctrl+Shift+R 全无效） |
| `client.js`（客户端半边） | 浏览器**硬刷新**即可（combo URL `/plugins/??<id>/client.js&rev=…` 含 mtime/size） |
| 宿主 `index.js` 新增路由 | 重启（旧进程里新端点仍 404） |
| `$DSH_HOME/dsh-video-skin.json` / assets 音频 | 重启（宿主只在启动时读盘；运行期只有面板滑块会写回该 json） |

---

## 五、排查手法

1. **先跑冒烟，别靠眼看**：
   ```bash
   node scripts/smoke.mjs        # 114 PASS —— 注入行生成/顺序/内容、三层装配、失败路径、皮肤清单、音乐库
   node scripts/drag-smoke.mjs   # 20 PASS —— 把 runtime/scenery.js 真拉进迷你 DOM 跑 pointerdown/move/up
   ```
   冒烟用 `.smoke-home/` 隔离，不读真实 `$DSH_HOME/dsh-video-skin.json`；ESM import 会被提升，故被测模块必须在设置 `DSH_HOME` 之后**动态 import**。
   - **已知坑**：一条基线断言曾在 CRLF 下永远失败——`workspaceRowHeight` 是那段最后一项，后面跟的是换行，旧断言只认逗号。
2. **探路由定位「谁在应答」**：`/dsh-*/…` 这些插件端点不校验会话，根页面才要 token——`curl` 版本号、`curl -o /dev/null -w '%{http_code}'` 看独有路由是否 404（见 1.2）。
3. **看日志判活**：控制台 `[scenery] client 半边已执行 <ISO 时间>` 是客户端半边的送达路标（排查无限加载用）；宿主侧告警统一前缀 `[maid-scenery]`。
4. **控制台定点确认**：
   ```js
   document.body.dataset.maidScenery          // video / art
   document.getElementById('dsvs-knobs')      // 面板在不在
   getComputedStyle(document.getElementById('dsvs-backdrop')).opacity   // 静态画模式应为 0
   ```
5. **改渲染前先复验上游**：老大报的「侧边栏按钮消失」「输入框图片异常」很可能上游 0.1.7 已修——**换正源后先重启复验再决定要不要动融合层**，别急着写补丁。
6. **测拖动别手测**：断言跟手、吸边、夹回对话框、位置记忆、点击吞噬、刷新瞬间不落位——`drag-smoke.mjs` 已经把这些场景都喂过一遍。
7. **跟完上游必跑 smoke**：sync 后 `git diff --stat vendor/` 看上游改了什么，再 `node scripts/smoke.mjs` 自测融合层——素材 404 这类「同步引入」的问题当场现形（见 2.8）；别等上线后界面坏了才回头查。

---

## 暂未遇到

- 视频层 `boot.mp4` 开机动画的时序问题（「有时候还没放完就切掉了」已在 vendor 内修掉：`fadeMs` 改成固定时长、默认 `exitMode: 'end'` 先放完再淡出）——本包整合后**未再遇到**。
- 跨卷安装时硬链接退化为复制导致的空间占用异常——逻辑已备（`linkSync` 失败退 `copyFileSync` 并只落 warning），**本机未实际遇到**。
- 非 Windows（macOS / Linux）下的顶栏与打开音乐目录——代码里备了 `open` / `xdg-open` 分支，**未在真机验证**。
