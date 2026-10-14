/**
 * dsh-maid-scenery —— 音乐库（宿主半边，0.2.2 起）。
 *
 * 视频层的歌单固定扫**包内** `vendor/video-skin/assets/`（上游零修改复用，不动它），
 * 可那个目录活在 `node_modules` 里——插件一升级、一重装，用户丢进去的歌就跟着没了。
 * 所以本模块把「歌的家」搬到 DSH_HOME，包内那份降级成镜像：
 *
 *     $DSH_HOME/dsh-maid-scenery/music/     ← 正本：用户丢歌的地方（面板「打开音乐位置」开的就是这里）
 *     vendor/video-skin/assets/             ← 镜像：硬链接优先（同卷零占空间），跨卷退回复制
 *
 * 启动时同步一次（幂等，每次启动重跑一遍）：
 *   ① 收养——包内遗留的音频（用户以前直接丢 node_modules 的）复制进 home，正本归位；
 *   ② 镜像——home 里每首歌硬链接进包内，名字/大小对不上就重做；
 *   ③ 清理——上一轮镜像过、如今 home 里已没有的，把包内那份删掉（正本都删了，镜像不该赖着）。
 *
 * 顺带接管一件事：`$DSH_HOME/dsh-video-skin.json` 的 `background.music` **字段缺席**时，
 * 自动填上目录第一首，让"丢进目录就能播"成立。字段一旦在场（哪怕写空串＝用户要静音），
 * 本模块一个字都不动——代管只能补空缺，不能覆盖用户已经说出口的话。
 *
 * 每一步出错都只 warn：音乐是装饰品，不配扣住宿主。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** 视频层认的音频扩展名（与 vendor/video-skin/lib/config.js 的白名单逐字一致）。 */
export const AUDIO_EXTENSIONS = Object.freeze([
  '.mp3',
  '.ogg',
  '.oga',
  '.opus',
  '.m4a',
  '.aac',
  '.flac',
  '.wav',
])

/** 本包在 $DSH_HOME 下的数据目录名。 */
export const HOME_DATA_DIR = 'dsh-maid-scenery'

/** 数据目录里的音乐子目录名（歌的正本）。 */
export const MUSIC_DIR_NAME = 'music'

/** 镜像名单文件名（记「包内哪些文件是本模块放进去的」）。 */
export const MIRROR_FILE_NAME = 'music-mirror.json'

/** 视频层的用户配置文件（与 vendor/video-skin/lib/config.js 的 HOME_CONFIG_FILE 同名）。 */
export const HOME_CONFIG_FILE = 'dsh-video-skin.json'

/** @param {unknown} error @returns {string} */
function describe(error) {
  return error instanceof Error ? error.message : String(error)
}

/** @param {string} file @returns {import('node:fs').Stats | null} */
function statOrNull(file) {
  try {
    return fs.statSync(file)
  } catch {
    return null
  }
}

/**
 * DSH_HOME 的位置：宿主的 `DSH_HOME` 优先，没有就退回 `~/.dsh`。
 * @param {NodeJS.ProcessEnv} [env] 环境变量表。
 * @param {string} [home] 用户主目录（默认取 os.homedir()）。
 * @returns {string | undefined} 绝对路径；两面都问不到就是 undefined。
 */
export function resolveHomeDir(env = process.env, home) {
  const fromEnv = env && typeof env.DSH_HOME === 'string' && env.DSH_HOME !== '' ? env.DSH_HOME : undefined
  if (fromEnv !== undefined) return path.resolve(fromEnv)
  try {
    const base = typeof home === 'string' && home !== '' ? home : os.homedir()
    return typeof base === 'string' && base !== '' ? path.join(base, '.dsh') : undefined
  } catch {
    return undefined
  }
}

/**
 * 音乐正本目录（$DSH_HOME/dsh-maid-scenery/music）。
 * @param {string} homeDir DSH_HOME。
 * @returns {string} 绝对路径。
 */
export function musicHomeDir(homeDir) {
  return path.join(homeDir, HOME_DATA_DIR, MUSIC_DIR_NAME)
}

/**
 * 列出目录里的音频（按文件名排序，与视频层的歌单顺序一致）。
 * @param {string} dir 绝对路径。
 * @returns {string[]} 文件名列表；目录不在或读不动就是空数组。
 */
export function listAudioFiles(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() && AUDIO_EXTENSIONS.includes(path.extname(entry.name).toLowerCase()),
      )
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

/**
 * 读镜像名单；坏了、缺了都当空名单（最坏结果是重做一遍镜像）。
 * @param {string} file 名单文件绝对路径。
 * @returns {string[]} 上一轮写进包内的文件名。
 */
function readMirror(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    const list = parsed && Array.isArray(parsed.mirrored) ? parsed.mirrored : []
    return list.filter((name) => typeof name === 'string' && name !== '')
  } catch {
    return []
  }
}

/**
 * 同步一次音乐库：收养 → 镜像 → 清理。
 *
 * @param {{ homeDir: string, packageRoot: string, warn?: (message: string) => void }} input
 *   homeDir：DSH_HOME；packageRoot：本包根目录（vendor 就在它下面）。
 * @returns {{ dir: string, assetsDir: string, tracks: string[], adopted: string[], mirrored: string[], removed: string[] }}
 *   tracks＝正本目录里的曲目；adopted/mirrored/removed 只用于日志与冒烟断言。
 */
export function syncMusicLibrary(input) {
  const warn = typeof input.warn === 'function' ? input.warn : () => {}
  const homeDir = input.homeDir
  const packageRoot = input.packageRoot
  const dir = path.join(String(homeDir), HOME_DATA_DIR, MUSIC_DIR_NAME)
  const assetsDir = path.join(String(packageRoot), 'vendor', 'video-skin', 'assets')
  /** @type {{ dir: string, assetsDir: string, tracks: string[], adopted: string[], mirrored: string[], removed: string[] }} */
  const result = { dir, assetsDir, tracks: [], adopted: [], mirrored: [], removed: [] }
  if (typeof homeDir !== 'string' || homeDir === '' || typeof packageRoot !== 'string' || packageRoot === '') {
    warn('DSH_HOME 或包根问不到，音乐库同步跳过（继续用包内目录）')
    return result
  }

  const dataDir = path.join(homeDir, HOME_DATA_DIR)
  const mirrorFile = path.join(dataDir, MIRROR_FILE_NAME)
  const previous = readMirror(mirrorFile)

  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (error) {
    warn(`音乐目录建不出来（${dir}）：${describe(error)}`)
    return result
  }

  // 包内素材目录都不在（vendor 缺了）→ 只报正本目录，别去碰不存在的路径。
  if (statOrNull(assetsDir) === null) {
    result.tracks = listAudioFiles(dir)
    warn(`包内素材目录不在，镜像跳过：${assetsDir}`)
    return result
  }

  // ── ① 收养：包内有、正本没有的（用户以前直接丢在 node_modules 里）→ 复制进正本 ──
  // 注意跳过上一轮镜像名单里的名字：那些是我们自己放进去的镜像，正本删掉了就该删（第③步），
  // 不能在这里又捞回正本，否则"删歌"永远删不掉。
  const names = listAudioFiles(dir)
  const adopted = new Set()
  for (const name of listAudioFiles(assetsDir)) {
    if (names.includes(name) || previous.includes(name)) continue
    try {
      fs.copyFileSync(path.join(assetsDir, name), path.join(dir, name))
      names.push(name)
      adopted.add(name)
    } catch (error) {
      warn(`收养「${name}」失败（包内那份继续用，但重装会丢）：${describe(error)}`)
    }
  }
  names.sort((a, b) => a.localeCompare(b))
  result.tracks = names
  result.adopted = [...adopted]

  // ── ② 镜像：正本每首歌在包内有一份可用文件 ──
  // "已同步"的判据用大小（硬链时再认 inode）：同名同大小就不再动它，免得每次启动都重写文件。
  const mirroredNow = new Set()
  for (const name of names) {
    const src = path.join(dir, name)
    const dst = path.join(assetsDir, name)
    try {
      const from = statOrNull(src)
      const to = statOrNull(dst)
      if (from !== null && to !== null && (to.ino === from.ino || to.size === from.size)) {
        mirroredNow.add(name)
        continue
      }
      if (to !== null) fs.rmSync(dst, { force: true })
      try {
        fs.linkSync(src, dst)
      } catch {
        // 跨卷/文件系统不支持硬链接 → 复制一份，行为一样，只是多占一份空间。
        fs.copyFileSync(src, dst)
      }
      mirroredNow.add(name)
      result.mirrored.push(name)
    } catch (error) {
      warn(`镜像「${name}」失败，这首可能播不出来：${describe(error)}`)
    }
  }

  // ── ③ 清理：上一轮镜像过、正本里已经删掉的 → 包内那份也删（正本为准） ──
  for (const name of previous) {
    if (mirroredNow.has(name) || names.includes(name)) continue
    const dst = path.join(assetsDir, name)
    if (statOrNull(dst) === null) continue
    try {
      fs.rmSync(dst, { force: true })
      result.removed.push(name)
    } catch (error) {
      warn(`清掉旧镜像「${name}」失败：${describe(error)}`)
    }
  }

  try {
    fs.writeFileSync(
      mirrorFile,
      `${JSON.stringify({ mirrored: [...mirroredNow] }, null, 2)}\n`,
      'utf8',
    )
  } catch (error) {
    warn(`镜像名单写不进去（下次启动会重做一遍）：${describe(error)}`)
  }

  return result
}

/**
 * `background.music` 缺席时补上目录第一首。
 *
 * 只补空缺：字段一旦在场（含空串＝用户要静音）立刻收手——这是本模块唯一一处写用户文件的地方，
 * 写的还是视频皮肤面板本来就会写的那一份（`$DSH_HOME/dsh-video-skin.json`）。
 *
 * @param {{ homeDir: string, tracks: string[], warn?: (message: string) => void }} input
 * @returns {{ changed: boolean, music: string }} changed＝这次真的写了文件。
 */
export function ensureAutoMusic(input) {
  const warn = typeof input.warn === 'function' ? input.warn : () => {}
  const homeDir = input.homeDir
  const tracks = Array.isArray(input.tracks) ? input.tracks : []
  if (typeof homeDir !== 'string' || homeDir === '' || tracks.length === 0) {
    return { changed: false, music: '' }
  }

  const file = path.join(homeDir, HOME_CONFIG_FILE)
  let parsed = {}
  try {
    const text = fs.readFileSync(file, 'utf8')
    if (text.trim() !== '') {
      const value = JSON.parse(text)
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) parsed = value
    }
  } catch (error) {
    // 文件不在＝正常（还没配过）；存在但读不动/不是 JSON＝用户手写坏了，这时当"说不准"处理：
    // 不写、也不报错，交给视频皮肤自己的 warning 通道去讲。
    if (error && error.code !== 'ENOENT') {
      warn(`用户配置读不动（${file}），自动填曲跳过：${describe(error)}`)
      return { changed: false, music: '' }
    }
  }

  const background =
    parsed.background !== null && typeof parsed.background === 'object' && !Array.isArray(parsed.background)
      ? { ...parsed.background }
      : {}
  if (Object.prototype.hasOwnProperty.call(background, 'music')) {
    return { changed: false, music: typeof background.music === 'string' ? background.music : '' }
  }

  const music = `assets/${tracks[0]}`
  const next = { ...parsed, background: { ...background, music } }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  } catch (error) {
    warn(`自动填曲写不进用户配置（${file}）：${describe(error)}`)
    return { changed: false, music }
  }
  return { changed: true, music }
}
