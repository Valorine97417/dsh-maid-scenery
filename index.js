/**
 * dsh-maid-scenery —— 宿主半边（v0.2.0 整合版）。
 *
 * 一个包，三层，全部由本文件在 apply 时同步装配：
 *   ① 视频层（vendor/video-skin）—— 开机动画覆盖层 + 聊天背景视频 + 右下角面板路由；
 *   ② 融合层（runtime/）—— 两家互斥显隐规则 + 面板里的「视频 / 静态画」切换行；
 *   ③ 主题层（vendor/maid-atelier）—— `/skin-assets/maid-atelier/*` 静态画素材路由。
 *
 * 契约全部抄 dsh-video-skin 踩过的坑（见 vendor/video-skin/index.host.js 头注释）：
 *   - `inject` 空数组、apply 同步注册订阅：桌面壳的注入表在宿主启动时收集一次，
 *     晚订阅没有刷新路径。
 *   - 只推 kind:'style' 与 kind:'script'，绝不推 script-src（后者失败会打掉
 *     __DSH_BOOT_READY__，整个应用起不来）。
 *   - 任何一步出错只 warn 并跳过，绝不向上抛——装饰品不配扣住用户。
 *     三层各自独立 try：视频层挂了融合层照旧，主题层挂了视频层照旧。
 *
 * 装配顺序有意为之：原来三件是 profile 里的三个独立包，bundles 顺序是
 * video-skin（第 5 位）→ scenery（第 15 位）。注入行按监听器注册顺序入表，
 * 所以这里先装视频层、再推融合层，保持与整合前一致的层叠关系（融合规则压在上层）。
 *
 * vendor 两家产物零修改复用：它们的 `new URL('.', import.meta.url)` /
 * `new URL('../assets/runtime/', import.meta.url)` 都是相对自身文件推导的，
 * 搬进 vendor/ 子目录后依然落在各自的包根上（2026-10-13 实测确认）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { apply as applyVideoSkin } from './vendor/video-skin/index.host.js'
import { apply as applyMaidAtelier } from './vendor/maid-atelier/index.host.js'

export const name = 'maid-scenery'
export const inject = []

const RUNTIME_DIR = 'runtime'

function describe(error) {
  return error instanceof Error ? error.message : String(error)
}

/** 按 mtime+size 缓存的运行时读取器（改文件刷新即生效，直出形态无需重启）。 */
function makeReader(packageRoot) {
  const cache = new Map()
  return (file) => {
    const target = path.join(packageRoot, RUNTIME_DIR, file)
    const stat = fs.statSync(target)
    const hit = cache.get(file)
    if (hit !== undefined && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.text
    const text = fs.readFileSync(target, 'utf8')
    cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, text })
    return text
  }
}

export function apply(ctx) {
  const packageRoot = fileURLToPath(new URL('.', import.meta.url))
  const readRuntime = makeReader(packageRoot)

  const warn = (message) => {
    try { ctx.logger?.warn?.(`[${name}] ${message}`) } catch { /* 日志不是失败理由 */ }
  }

  // ── ① 视频层：注入行 + 素材路由 + 滑块写回端点（vendor 原样装配） ──
  try {
    applyVideoSkin(ctx)
  } catch (error) {
    warn(`视频层装配失败，聊天背景与开机动画保持原生外观：${describe(error)}`)
  }

  // ── ② 融合层：style 必须在 script 前（脚本建 DOM 时样式要先在场） ──
  ctx.on('webserver/index-inject', (table) => {
    if (!Array.isArray(table)) return
    try {
      table.push(
        { kind: 'style', text: readRuntime('scenery.css') },
        { kind: 'script', placement: 'body', text: readRuntime('scenery.js') },
      )
    } catch (error) {
      warn(`融合层注入行生成失败，页面保持视频层原生叠加：${describe(error)}`)
    }
  })

  // ── ③ 主题层：静态画素材路由（/skin-assets/maid-atelier/*） ──
  try {
    applyMaidAtelier(ctx)
  } catch (error) {
    warn(`主题层装配失败，静态画素材将 404（视频层不受影响）：${describe(error)}`)
  }
}
