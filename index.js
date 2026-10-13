/**
 * dsh-maid-scenery —— 宿主半边。
 *
 * 只干一件事：给 `webserver/index-inject` 贡献两行（样式 + 运行时脚本），
 * 把「maid-atelier 静态场景画」与「dsh-video-skin 视频背景」的融合规则送进页面。
 *
 * 契约全部抄 dsh-video-skin 踩过的坑（见其 index.js 头注释）：
 *   - `inject` 空数组、apply 同步注册订阅：桌面壳的注入表在宿主启动时收集一次，
 *     晚订阅没有刷新路径。
 *   - 只推 kind:'style' 与 kind:'script'，绝不推 script-src（后者失败会打掉
 *     __DSH_BOOT_READY__，整个应用起不来）。
 *   - 任何一步出错只 warn 并跳过，绝不向上抛——装饰品不配扣住用户。
 *
 * 无路由、无文件写：切换状态存 localStorage（失败退会话内存），页面侧自足。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

  ctx.on('webserver/index-inject', (table) => {
    if (!Array.isArray(table)) return
    try {
      // 顺序硬约束：style 必须在 script 前（脚本建 DOM 时样式要先在场）。
      table.push(
        { kind: 'style', text: readRuntime('scenery.css') },
        { kind: 'script', placement: 'body', text: readRuntime('scenery.js') },
      )
    } catch (error) {
      warn(`注入行生成失败，页面保持两家插件各自的原生叠加：${describe(error)}`)
    }
  })
}
