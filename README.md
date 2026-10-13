# dsh-maid-scenery

视频背景 × 深海女仆工坊的**融合层**插件——把 [maid-atelier](https://github.com/flaricy/maid-atelier-ui-bundle) 主题与 [dsh-video-skin](https://github.com/Something11235/dsh-video-skin) 的聊天背景捏合成一套可切换的场景。

## 干什么

两家插件各自为政时：主题的静态工坊画铺在 body，视频皮肤的不透明兜底色把它整个盖住——要么有画没视频，要么有视频没画。本插件做两件事：

1. **静态画沉底**：把视频层的不透明兜底色改透明。视频播放时盖住画，视频未就绪/淡出时透出画，无缝衔接；
2. **面板加开关**：在视频皮肤右下角「聊天背景」面板里注入一行**背景画面**（视频 / 静态画），一键切换，选择持久化（localStorage，失败退会话内存）。切到静态画时视频层整体淡出（opacity，不销毁解码器，切回不闪不重载）。

## 安装

```bash
dsh plugin --profile desktop add github:Valorine97417/dsh-maid-scenery
```

装完重启 DSH。主题（`@dsh-external/dsh-client-ui-skin-maid-atelier`）是本包依赖，会一起装上，其 entry 行由本包的 `cordis.patch.yml` 插入——**不需要再单独装 maid-atelier**。dsh-video-skin 请老大自行安装；它缺席时本插件全部规则自动失效（条件化选择器），不误伤。

## 设计约束（都来自视频皮肤踩过的坑）

- 注入行只推 `kind:'style'` 与 `kind:'script'`，绝不推 `script-src`（后者失败会打掉 `__DSH_BOOT_READY__`，整个应用起不来）；
- `apply` 同步注册 `webserver/index-inject` 订阅，不依赖任何服务就绪（桌面壳的注入表启动时收集一次，晚订阅没有刷新路径）；
- 运行时脚本任何一步出错都安静待命——装饰品没有资格让页面变红；
- 不假设两家插件在场：CSS 以 `#dsvs-backdrop` 为锚（视频皮肤缺席则规则空转），切换按钮由 MutationObserver 等面板出现再注入（10 分钟上界后放弃观察）。

## 许可

MIT（本插件代码）。注意：maid-atelier 的美术资产为上游声明的 CC BY-NC-SA 4.0，本仓库**不复制、不再分发**任何美术资产，仅以 git 依赖引用原作者仓库。
