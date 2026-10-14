/**
 * dsh-maid-scenery —— 宿主半边（v0.2.0 整合版）。
 *
 * 一个包，三层，全部由本文件在 apply 时同步装配：
 *   ① 视频层（vendor/video-skin）—— 开机动画覆盖层 + 聊天背景视频 + 右下角面板路由；
 *   ② 融合层（runtime/）—— 两家互斥显隐规则 + 面板里的「视频 / 静态画」切换行；
 *   ③ 主题层（vendor/maid-atelier）—— `/skin-assets/maid-atelier/*` 静态画素材路由。
 *
 * 另有两条自加的端点（④），只服务面板上的「背景音乐」行：
 *   - `/dsh-maid-scenery/music.json`：报出音乐目录与目录里的曲目数；
 *   - `/dsh-maid-scenery/open-music-folder`：用系统文件管理器打开那个目录（只认 POST）。
 * 音频本身由使用者自备（不进 git 索引，见 README「背景音乐（自备，不入库）」）。
 * 0.2.2 起这个目录是 `$DSH_HOME/dsh-maid-scenery/music/`（歌的正本，重装不丢），
 * 包内 `vendor/video-skin/assets/` 降级成镜像——同步逻辑全在 lib/music.js。
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
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { apply as applyVideoSkin } from './vendor/video-skin/index.host.js'
import { apply as applyMaidAtelier } from './vendor/maid-atelier/index.host.js'
import {
  ensureAutoMusic,
  listAudioFiles,
  musicHomeDir,
  resolveHomeDir,
  syncMusicLibrary,
} from './lib/music.js'

export const name = 'maid-scenery'
export const inject = []

const RUNTIME_DIR = 'runtime'

/** 包内素材目录（相对包根）：视频层扫的就是这一处，音乐正本的镜像也落在这里。 */
const ASSETS_DIR = path.join('vendor', 'video-skin', 'assets')

/** 面板「背景音乐」行用的两个端点。 */
const MUSIC_INFO_ROUTE = '/dsh-maid-scenery/music.json'
const MUSIC_OPEN_ROUTE = '/dsh-maid-scenery/open-music-folder'

function describe(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 用系统文件管理器打开音乐目录。
 *
 * 目录不存在就先建出来——这个按钮的全部意义就是「让我把歌丢进去」，
 * 空目录打不开等于把用户堵在第一步。
 *
 * @param {string} dir 绝对路径。
 * @returns {string} 实际调用的命令名（写进响应方便排查）。
 */
function openFolder(dir) {
  fs.mkdirSync(dir, { recursive: true })
  const command =
    process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  const child = spawn(command, [dir], { detached: true, stdio: 'ignore' })
  // 打开失败只是"没打开"：进程是 detached 的，错误只能异步到达，不该抛回宿主。
  child.on('error', () => {})
  child.unref()
  return command
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

  // ── ④ 音乐库：正本在 DSH_HOME，包内目录只是镜像（见 lib/music.js 头注释） ──
  // 先同步、再注册端点：这样"用户丢歌的目录""视频层扫的目录""面板报的目录"三方是同一处。
  const homeDir = resolveHomeDir()
  let musicDir = path.join(packageRoot, ASSETS_DIR)
  if (homeDir === undefined) {
    warn('问不到 DSH_HOME，音乐库退回包内目录（重装会丢歌）')
  } else {
    musicDir = musicHomeDir(homeDir)
    try {
      const library = syncMusicLibrary({ homeDir, packageRoot, warn })
      if (library.adopted.length > 0) {
        warn(`从包内收编 ${library.adopted.length} 首歌进音乐目录：${library.adopted.join('、')}`)
      }
      if (library.removed.length > 0) {
        warn(`清掉 ${library.removed.length} 个已从音乐目录删掉的旧镜像：${library.removed.join('、')}`)
      }
      const auto = ensureAutoMusic({ homeDir, tracks: library.tracks, warn })
      if (auto.changed) warn(`背景音乐没配过，已自动指向目录第一首：${auto.music}`)
    } catch (error) {
      warn(`音乐库同步失败，继续用包内目录：${describe(error)}`)
    }
  }

  try {
    ctx.inject(['webServer'], (child) => {
      child.effect(() => {
        /** @type {Array<() => void>} */
        const disposers = []

        /** @param {import('node:http').ServerResponse} res @param {number} status @param {unknown} body */
        const json = (res, status, body) => {
          const text = JSON.stringify(body)
          res.writeHead(status, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(text),
            'Cache-Control': 'no-store',
          })
          res.end(text)
        }

        disposers.push(
          child.webServer.register({
            kind: 'exact',
            path: MUSIC_INFO_ROUTE,
            handler: (req, res) => {
              try {
                const tracks = listAudioFiles(musicDir)
                json(res, 200, { dir: musicDir, count: tracks.length, tracks })
              } catch (error) {
                json(res, 500, { dir: musicDir, error: describe(error) })
              }
            },
          }),
        )

        disposers.push(
          child.webServer.register({
            kind: 'exact',
            path: MUSIC_OPEN_ROUTE,
            handler: (req, res) => {
              // 只认 POST：GET 可能被浏览器预取或缓存，谁也不想页面一加载就弹出一个资源管理器。
              const method = String(req.method ?? 'GET').toUpperCase()
              if (method !== 'POST') {
                json(res, 405, { error: 'use POST' })
                return
              }
              try {
                const command = openFolder(musicDir)
                json(res, 200, { dir: musicDir, opened: true, command })
              } catch (error) {
                warn(`打开音乐目录失败：${describe(error)}`)
                json(res, 500, { dir: musicDir, opened: false, error: describe(error) })
              }
            },
          }),
        )

        return () => {
          for (const dispose of disposers) {
            try { dispose() } catch { /* 拆解失败不是失败理由 */ }
          }
        }
      })
    })
  } catch (error) {
    warn(`音乐面板端点装配失败，面板上的「打开音乐位置」会没反应：${describe(error)}`)
  }
}
