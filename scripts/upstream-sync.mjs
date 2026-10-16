#!/usr/bin/env node
// upstream-sync —— 跟踪 vendor/ 里两家上游（maid-atelier 与 dsh-video-skin）的更新。
//
// 背景：本插件把两家上游以「零修改」形态内置在 vendor/，上游都还在活跃更新。
// 本脚本负责三件事：
//   check  查上游有没有新提交 / 新版本（git ls-remote + GitHub trees API，走本机代理）
//   init   扫描 vendor 现有文件，在上游树里定位同名文件，生成 manifest.files 映射
//   sync   按映射逐文件从上游拉新覆盖 vendor/，并更新 manifest 的版本与 commit 锚点
//
// 设计原则（README 路线一）：
//   · 架构不动——vendor 仍是零修改内置，脚本只做「拉新 + 对账」，不生成补丁；
//   · 白名单语义——manifest.files 之外的上游文件（src/ tests/ scripts/ 等）一律不进 vendor；
//   · protect 名单（vendor 特有文件，如 LICENSE-upstream、本机自放的 .flac）永不触碰；
//   · 上游产物自带版本号与 git blob sha，sync 用 blob sha 做增量，没变的文件不重拉。
//
// 用法：
//   node scripts/upstream-sync.mjs check  [name]      # name = video-skin | maid-atelier，缺省两个都查
//   node scripts/upstream-sync.mjs init   [name]
//   node scripts/upstream-sync.mjs sync   [name] [--dry]
//
// 网络一律走本机代理（HTTPS_PROXY 环境变量可覆盖），直连 GitHub 在本机会挂死。

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MANIFEST = path.join(ROOT, "scripts", "upstream-manifest.json");
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || "http://127.0.0.1:7890";
const RAW = "https://raw.githubusercontent.com";
const API = "https://api.github.com";

// 两个上游目标的静态描述。renames：上游相对路径 → vendor 相对路径（同名文件不用写）。
// protect：vendor 特有文件，sync 永不覆盖（init 也不把它登记进映射）。
const TARGETS = {
  "video-skin": {
    repo: "Something11235/dsh-video-skin",
    subdir: "",
    vendorDir: "vendor/video-skin",
    renames: { "index.js": "index.host.js" },
    protect: [/\.flac$/i],
    versionFile: "package.json",
  },
  "maid-atelier": {
    repo: "Small-tailqwq/dsh-deep-whale",
    subdir: "maid-atelier",
    vendorDir: "vendor/maid-atelier",
    renames: { "lib/client.js": "client.js", "lib/index.js": "index.host.js" },
    protect: [/^LICENSE-upstream$/i],
    versionFile: "package.json",
  },
};

const argv = process.argv.slice(2);
const cmd = argv[0];
const nameArg = argv[1] && !argv[1].startsWith("--") ? argv[1] : null;
const dry = argv.includes("--dry");

const log = (...a) => console.log(...a);
const die = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

function httpGet(url) {
  return execFileSync("curl", ["-sS", "-x", PROXY, "--max-time", "60", url], {
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  });
}

function httpGetText(url) {
  return httpGet(url).toString("utf8");
}

function headSha(repo) {
  const out = execFileSync(
    "git",
    ["-c", `http.proxy=${PROXY}`, "ls-remote", `https://github.com/${repo}.git`, "HEAD"],
    { encoding: "utf8", windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
  );
  const sha = out.trim().split(/\s+/)[0];
  if (!/^[0-9a-f]{40}$/.test(sha)) die(`ls-remote 没拿到 ${repo} 的 HEAD：${out.trim()}`);
  return sha;
}

function upstreamTree(target, ref) {
  const raw = JSON.parse(httpGetText(`${API}/repos/${target.repo}/git/trees/${ref}?recursive=1`));
  if (raw.truncated) die(`${target.repo} 的树被 GitHub 截断，sync 不可靠，先停下来人工看`);
  const prefix = target.subdir ? `${target.subdir}/` : "";
  return raw.tree
    .filter((e) => e.type === "blob" && e.path.startsWith(prefix))
    .map((e) => ({ u: e.path.slice(prefix.length), sha: e.sha }));
}

// git blob sha1：本地文件与 GitHub tree API 的 blob 条目同法可算，用于增量跳过。
function blobSha(buf) {
  return createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
}

function vendorFiles(target) {
  const base = path.join(ROOT, target.vendorDir);
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = path.relative(base, path.join(dir, e.name)).split(path.sep).join("/");
      if (e.isDirectory()) walk(path.join(dir, e.name));
      else out.push(rel);
    }
  };
  walk(base);
  return out.filter((f) => !target.protect.some((re) => re.test(f)));
}

function loadManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
}

function saveManifest(m) {
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + "\n");
}

function pickNames() {
  if (!nameArg) return Object.keys(TARGETS);
  if (!TARGETS[nameArg]) die(`未知目标：${nameArg}（可选：${Object.keys(TARGETS).join(" | ")}）`);
  return [nameArg];
}

function fetchVersion(target, ref) {
  const p = target.subdir ? `${target.subdir}/${target.versionFile}` : target.versionFile;
  try {
    const pkg = JSON.parse(httpGetText(`${RAW}/${target.repo}/${ref}/${p}`));
    return pkg.version || null;
  } catch {
    return null;
  }
}

/* ---------------------------------- check ---------------------------------- */

function checkOne(name, m) {
  const target = TARGETS[name];
  const entry = m[name] || {};
  const sha = headSha(target.repo);
  const ver = fetchVersion(target, sha);
  const synced = entry.syncedRef;
  const same = synced === sha;
  log(`\n[${name}]`);
  log(`  上游 HEAD     ${sha.slice(0, 12)}${ver ? `  (v${ver})` : ""}`);
  if (!synced) {
    log(`  manifest      尚无 syncedRef（先跑 init，再跑一次 sync 固化锚点）`);
    return;
  }
  if (same) {
    log(`  已同步        ✓（${synced.slice(0, 12)}${entry.syncedVersion ? `，v${entry.syncedVersion}` : ""}，${entry.syncedAt || "?"}）`);
  } else {
    const from = entry.syncedVersion ? `v${entry.syncedVersion}` : synced.slice(0, 12);
    log(`  有新提交      ${from} → ${ver ? `v${ver}` : sha.slice(0, 12)}（${synced.slice(0, 12)} → ${sha.slice(0, 12)}）`);
    log(`  动手          node scripts/upstream-sync.mjs sync ${name}`);
  }
}

/* ----------------------------------- init ----------------------------------- */

function initOne(name, m) {
  const target = TARGETS[name];
  const sha = headSha(target.repo);
  const tree = upstreamTree(target, sha);
  const byPath = new Map(tree.map((e) => [e.u, e.sha]));
  const byName = new Map();
  for (const e of tree) {
    const base = e.u.split("/").pop();
    if (!byName.has(base)) byName.set(base, []);
    byName.get(base).push(e.u);
  }
  const files = [];
  const missing = [];
  for (const v of vendorFiles(target)) {
    const reverseRename = Object.entries(target.renames).find(([, vendorPath]) => vendorPath === v);
    if (byPath.has(v)) { files.push({ v, u: v }); continue; }
    if (reverseRename && byPath.has(reverseRename[0])) { files.push({ v, u: reverseRename[0] }); continue; }
    const hits = byName.get(v.split("/").pop());
    if (hits && hits.length === 1) { files.push({ v, u: hits[0] }); continue; }
    missing.push(v);
  }
  m[name] = {
    ...(m[name] || {}),
    repo: target.repo,
    subdir: target.subdir,
    vendorDir: target.vendorDir,
    files: files.sort((a, b) => a.v.localeCompare(b.v)),
  };
  log(`\n[${name}] 登记映射 ${files.length} 个文件（上游 HEAD ${sha.slice(0, 12)}）`);
  for (const { v, u } of files) {
    if (u !== v) log(`  ${u} → ${v}`);
  }
  if (missing.length) {
    log(`  ⚠ 未能对齐 ${missing.length} 个（不会登记，需人工确认后在 manifest 里手写映射）：`);
    for (const f of missing) log(`    ${f}`);
  }
}

/* ----------------------------------- sync ----------------------------------- */

function syncOne(name, m) {
  const target = TARGETS[name];
  const entry = m[name];
  if (!entry || !Array.isArray(entry.files) || !entry.files.length) {
    die(`[${name}] manifest 里没有文件映射，先跑 init`);
  }
  const sha = headSha(target.repo);
  const tree = upstreamTree(target, sha);
  const byPath = new Map(tree.map((e) => [e.u, e.sha]));
  const files = entry.files.filter((f) => {
    if (target.protect.some((re) => re.test(f.v))) return false;
    return true;
  });
  for (const f of files) {
    if (!byPath.has(f.u)) die(`[${name}] 上游树里找不到 ${f.u}——上游结构变了，先人工核对映射再 sync`);
  }
  log(`\n[${name}] 上游 HEAD ${sha.slice(0, 12)}，映射 ${files.length} 个文件${dry ? "（--dry 预演，不落盘）" : ""}`);
  const overrides = entry.overrides || [];
  const applied = entry.applied || {};
  let pulled = 0, skipped = 0, byteTotal = 0;
  for (const f of files) {
    const dest = path.join(ROOT, target.vendorDir, f.v);
    const wantSha = byPath.get(f.u);
    if (!dry && fs.existsSync(dest)) {
      const local = blobSha(fs.readFileSync(dest));
      const needsOverride = overrides.some((o) => o.v === f.v);
      // 无 override：本地等于上游原文即未变；有 override：本地须是「原文+override」的形态才算未变。
      if (!needsOverride && local === wantSha) { skipped++; continue; }
      if (needsOverride && local === applied[f.v]) { skipped++; continue; }
    }
    const url = `${RAW}/${target.repo}/${sha}/${target.subdir ? `${target.subdir}/` : ""}${f.u}`;
    if (dry) { log(`  将拉取 ${f.u} → ${target.vendorDir}/${f.v}`); pulled++; continue; }
    let buf = httpGet(url);
    const override = overrides.find((o) => o.v === f.v);
    if (override) {
      let text = buf.toString("utf8");
      let hits = 0;
      for (const [find, replace] of override.replacements) {
        if (text.includes(find)) { text = text.split(find).join(replace); hits++; }
      }
      if (hits !== override.replacements.length) {
        log(`  ⚠ override 只命中 ${hits}/${override.replacements.length} —— 上游可能改写了这段，人工核对 ${f.v}`);
      }
      buf = Buffer.from(text, "utf8");
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    if (override) applied[f.v] = blobSha(buf);
    pulled++;
    byteTotal += buf.length;
    log(`  ✓ ${f.v}${override ? "（含本地 override）" : ""}  (${(buf.length / 1024).toFixed(1)} KB)`);
  }
  entry.applied = applied;
  if (dry) {
    log(`  预演结束：将更新 ${pulled} 个，未变的 ${files.length - pulled} 个`);
    return;
  }
  log(`  更新 ${pulled}，未变跳过 ${skipped}，共 ${(byteTotal / 1024).toFixed(1)} KB`);
  const ver = fetchVersion(target, sha);
  entry.syncedRef = sha;
  entry.syncedVersion = ver;
  entry.syncedAt = new Date().toISOString().slice(0, 19) + "Z";
  saveManifest(m);
  log(`  manifest 已固化：syncedRef=${sha.slice(0, 12)}${ver ? ` v${ver}` : ""}`);
  log(`  下一步：git diff --stat ${target.vendorDir}  看上游改了什么；node scripts/smoke.mjs 自测融合层。`);
}

/* ----------------------------------- main ----------------------------------- */

if (!cmd || !["check", "init", "sync"].includes(cmd)) {
  log(`用法：node scripts/upstream-sync.mjs <check|init|sync> [video-skin|maid-atelier] [--dry]`);
  log(`\n当前登记：`);
  try {
    const m = loadManifest();
    for (const [k, v] of Object.entries(m)) {
      if (!v || !v.files) continue;
      log(`  ${k}: ${v.files.length} 个文件${v.syncedRef ? `，锚点 ${v.syncedRef.slice(0, 12)}${v.syncedVersion ? ` v${v.syncedVersion}` : ""}` : "，无锚点"}`);
    }
  } catch { log(`  （manifest 还没有）`); }
  process.exit(0);
}

const m = fs.existsSync(MANIFEST) ? loadManifest() : {};
if (cmd === "check") {
  for (const n of pickNames()) checkOne(n, m);
} else if (cmd === "init") {
  for (const n of pickNames()) initOne(n, m);
  saveManifest(m);
  log(`\nmanifest 已写盘：${path.relative(ROOT, MANIFEST)}`);
} else {
  for (const n of pickNames()) syncOne(n, m);
}
