#!/usr/bin/env node
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

// 対象コードの checkout / install / 実行はしない。判断は SKILL.md の調査手順で行う。
// 外部パッケージに依存せず、Node.js の標準モジュールと Git だけで動かす。

const DEFAULT_MAX_BYTES = 32 * 1024 * 1024
const DEFAULT_TIMEOUT = 120

export class ReviewError extends Error {}

const utf8 = new TextDecoder('utf-8', { fatal: true })

function decodeUtf8(buffer) {
  try {
    return utf8.decode(buffer)
  } catch {
    return null
  }
}

export class Git {
  constructor({ timeout = DEFAULT_TIMEOUT, maxBytes = DEFAULT_MAX_BYTES } = {}) {
    this.timeout = timeout
    this.maxBytes = maxBytes
  }

  run(...args) {
    // 呼び出し元や上流リポジトリの diff driver / hook / replacement を使わない。
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')))
    Object.assign(env, {
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: os.devNull,
      GIT_TERMINAL_PROMPT: '0',
      GIT_NO_REPLACE_OBJECTS: '1',
    })
    if (process.env.GIT_SSL_CAINFO) env.GIT_SSL_CAINFO = process.env.GIT_SSL_CAINFO
    const command = [
      '-c', `core.hooksPath=${os.devNull}`, '-c', 'protocol.allow=never',
      '-c', 'protocol.https.allow=always', '-c', 'protocol.file.allow=always',
      '-c', 'http.followRedirects=false', ...args,
    ]
    return new Promise((resolve, reject) => {
      // stderr は認証情報や制御文字の混入を避けるため保存しない。
      const child = spawn('git', command, { env, detached: true, stdio: ['ignore', 'pipe', 'ignore'] })
      const deadline = Date.now() + this.timeout * 1000
      const chunks = []
      let size = 0
      let failure = null
      const abort = (error) => {
        if (failure) return
        failure = error
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch {
          // 既に終了している場合も close を待つ。
        }
      }
      const timer = setTimeout(() => abort(new ReviewError('Git コマンドがタイムアウトしました')), this.timeout * 1000)
      child.stdout.on('data', (chunk) => {
        if (failure) return
        size += chunk.length
        if (size > this.maxBytes) {
          abort(new ReviewError('Git 出力がサイズ制限を超えました（省略して成功扱いにはしません）'))
          return
        }
        chunks.push(chunk)
      })
      child.on('error', (error) => {
        clearTimeout(timer)
        failure ??= error.code === 'ENOENT' ? new ReviewError('git が見つかりません') : error
        reject(failure)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        if (!failure && Date.now() >= deadline) failure = new ReviewError('Git コマンドがタイムアウトしました')
        if (failure) reject(failure)
        else if (code !== 0) reject(new ReviewError(`Git コマンド失敗（終了コード ${code}）`))
        else resolve(Buffer.concat(chunks))
      })
    })
  }

  async text(...args) {
    return (await this.run(...args)).toString('utf8').trim()
  }
}

// gh-actions-lock の出力に必要な YAML のサブセットだけを解釈する。
// ブロック形式のマッピング・シーケンス、スカラー、空の {} / [] 以外は曖昧さを避けるため拒否する。
export function parseYamlSubset(content) {
  const fail = (line, reason) => {
    throw new ReviewError(`lockfile を解釈できません: ${reason}${line ? `（${line} 行目）` : ''}`)
  }
  const lines = []
  let started = false
  content.split('\n').forEach((raw, index) => {
    const number = index + 1
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (/^\s*(#.*)?$/.test(line)) return
    const indent = line.match(/^ */)[0].length
    if (line[indent] === '\t' || /^\s*\t/.test(line)) fail(number, 'インデントのタブ')
    const text = stripComment(line.slice(indent), number, fail)
    if (indent === 0 && (text === '---' || text.startsWith('--- '))) {
      if (started || text !== '---') fail(number, '複数 document または document 先頭の値')
      started = true
      return
    }
    if (indent === 0 && (text === '...' || text.startsWith('... '))) fail(number, 'document 終端')
    started = true
    lines.push({ number, indent, text })
  })
  if (lines.length === 0) fail(null, '空の YAML')

  let position = 0
  const parseNode = () => {
    const first = lines[position]
    if (first.text === '-' || first.text.startsWith('- ')) return parseSequence(first.indent)
    return parseMapping(first.indent)
  }
  const parseSequence = (indent) => {
    const items = []
    while (position < lines.length && lines[position].indent === indent &&
      (lines[position].text === '-' || lines[position].text.startsWith('- '))) {
      const { number, text } = lines[position]
      position += 1
      const value = text.slice(1).trimStart()
      if (value === '') fail(number, 'シーケンス内の入れ子')
      items.push(parseInlineValue(value, number, fail))
      if (position < lines.length && lines[position].indent > indent) fail(lines[position].number, '複数行の値')
    }
    return items
  }
  const parseMapping = (indent) => {
    const result = {}
    while (position < lines.length && lines[position].indent === indent) {
      const { number, text } = lines[position]
      if (text === '-' || text.startsWith('- ')) fail(number, 'マッピングとシーケンスの混在')
      const { key, rest } = splitKey(text, number, fail)
      if (typeof key !== 'string') fail(number, 'キーが文字列ではありません')
      if (Object.hasOwn(result, key)) fail(number, '重複キー')
      position += 1
      let value
      if (rest === '') {
        const next = lines[position]
        if (next && next.indent > indent) value = parseNode()
        else if (next && next.indent === indent && (next.text === '-' || next.text.startsWith('- '))) value = parseSequence(indent)
        else fail(number, '値のないキー')
      } else {
        value = parseInlineValue(rest, number, fail)
        if (position < lines.length && lines[position].indent > indent) fail(lines[position].number, '複数行の値')
      }
      result[key] = value
    }
    return result
  }

  const root = parseNode()
  if (lines[0].indent !== 0) fail(lines[0].number, 'トップレベルのインデント')
  if (position < lines.length) fail(lines[position].number, 'インデントの不整合')
  return root
}

function stripComment(text, number, fail) {
  let quote = null
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quote === "'") {
      if (char === "'" && text[index + 1] === "'") index += 1
      else if (char === "'") quote = null
    } else if (quote === '"') {
      if (char === '\\') index += 1
      else if (char === '"') quote = null
    } else if ((char === "'" || char === '"') && (index === 0 || /[\s:-]/.test(text[index - 1]))) {
      quote = char
    } else if (char === '#' && /\s/.test(text[index - 1] ?? ' ')) {
      return text.slice(0, index).trimEnd()
    }
  }
  if (quote) fail(number, '閉じていない引用符')
  return text.trimEnd()
}

function splitKey(text, number, fail) {
  if (text.startsWith('? ') || text === '?') fail(number, '複合キー')
  if (text.startsWith("'") || text.startsWith('"')) {
    const { value, end } = readQuoted(text, number, fail)
    if (text[end] !== ':' || (end + 1 < text.length && text[end + 1] !== ' ')) fail(number, 'キーの形式')
    return { key: value, rest: text.slice(end + 1).trim() }
  }
  const colon = text.indexOf(': ')
  const key = colon >= 0 ? text.slice(0, colon) : text.endsWith(':') ? text.slice(0, -1) : null
  if (key === null || key.includes(':')) fail(number, 'キーの形式')
  return { key: resolvePlain(key, number, fail), rest: colon >= 0 ? text.slice(colon + 2).trim() : '' }
}

function readQuoted(text, number, fail) {
  const quote = text[0]
  let value = ''
  for (let index = 1; index < text.length; index += 1) {
    const char = text[index]
    if (quote === "'" && char === "'") {
      if (text[index + 1] === "'") {
        value += "'"
        index += 1
      } else {
        return { value, end: index + 1 }
      }
    } else if (quote === '"' && char === '\\') {
      const escaped = text[index + 1]
      if (escaped !== '"' && escaped !== '\\') fail(number, '未対応のエスケープ')
      value += escaped
      index += 1
    } else if (quote === '"' && char === '"') {
      return { value, end: index + 1 }
    } else {
      value += char
    }
  }
  fail(number, '閉じていない引用符')
}

function parseInlineValue(text, number, fail) {
  if (text === '{}') return {}
  if (text === '[]') return []
  if (text.startsWith("'") || text.startsWith('"')) {
    const { value, end } = readQuoted(text, number, fail)
    if (end !== text.length) fail(number, '引用符の後の値')
    return value
  }
  return resolvePlain(text, number, fail)
}

function resolvePlain(text, number, fail) {
  if (text === '') fail(number, '空の値')
  // anchor / alias / tag / flow collection / block scalar などの指示子で始まる値を拒否する。
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(text) || /: |\s#/.test(text)) fail(number, `未対応の YAML 構文: ${JSON.stringify(text)}`)
  if (/^(0|[1-9][0-9]*)$/.test(text)) return Number(text)
  // YAML の解釈器ごとに型が変わりうる値は文字列扱いせず拒否する。
  if (/^(~|null|Null|NULL|true|True|TRUE|false|False|FALSE|yes|Yes|YES|no|No|NO|on|On|ON|off|Off|OFF|y|Y|n|N)$/.test(text) ||
    /^[-+]?(\.[0-9]|[0-9])[0-9_.eE+-]*$/.test(text) || /^[-+]?\.(inf|Inf|INF|nan|NaN|NAN)$/.test(text) ||
    /^0[xXoObB]/.test(text) || /^[0-9]+(:[0-5]?[0-9])+$/.test(text)) {
    fail(number, `型が曖昧なスカラー: ${JSON.stringify(text)}`)
  }
  return text
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const sameKeys = (object, keys) => JSON.stringify(Object.keys(object).sort()) === JSON.stringify([...keys].sort())

export class Lockfile {
  constructor(content) {
    const check = (condition, reason) => {
      if (!condition) throw new ReviewError(`lockfile を解釈できません: ${reason}`)
    }
    const data = parseYamlSubset(content)
    check(isPlainObject(data) && sameKeys(data, ['dependencies', 'version', 'workflows']), 'トップレベルの構造')
    check(data.version === 'v0.0.3', '未対応の lockfile version')
    this.workflows = data.workflows
    this.dependencies = data.dependencies
    check(isPlainObject(this.dependencies) && isPlainObject(this.workflows), 'dependencies / workflows の型')
    for (const [key, entry] of Object.entries(this.dependencies)) {
      // eslint-disable-next-line no-control-regex
      const match = /^([A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+)@([^\s\x00-\x1f\x7f]+)$/.exec(key)
      check(match && /[A-Za-z0-9_]/.test(match[1].split('/').pop()), '依存キー')
      check(isPlainObject(entry) && sameKeys(entry, ['commit', 'owner_id', 'ref', 'repo_id']), '依存エントリの構造')
      check(entry.ref === match[2], 'ref と依存キーの不一致')
      check(typeof entry.commit === 'string' && /^sha1-[0-9a-f]{40}$/.test(entry.commit), 'commit の形式')
      check(['owner_id', 'repo_id'].every((field) => Number.isSafeInteger(entry[field]) && entry[field] > 0), 'ID の形式')
    }
    for (const [workflow, entries] of Object.entries(this.workflows)) {
      // eslint-disable-next-line no-control-regex
      check(/^\.github\/workflows\/[^/\x00-\x1f\x7f]+\.ya?ml$/.test(workflow), 'workflow パス')
      check(Array.isArray(entries) && entries.every((key) => typeof key === 'string' && Object.hasOwn(this.dependencies, key)), 'workflow の依存参照')
    }
  }
}

const LOCK_PATH = '.github/workflows/actions.lock'
const LFS_POINTER = Buffer.from('version https://git-lfs.github.com/spec/v1\n')

export class Collector {
  constructor({ repo, base, head, output, sourceRoot = null, maxBytes = DEFAULT_MAX_BYTES, timeout = DEFAULT_TIMEOUT }) {
    this.repo = fs.realpathSync(repo)
    this.base = base
    this.head = head
    this.output = path.resolve(output)
    this.sourceRoot = sourceRoot && fs.realpathSync(sourceRoot)
    this.maxBytes = maxBytes
    this.git = new Git({ timeout, maxBytes })
    this.manifest = {
      schema_version: 1, collection_status: 'incomplete', errors: [], updates: [],
      source_mode: this.sourceRoot ? 'local_fixture' : 'github_https',
      limitations: ['収集成功は安全性・provenance・祖先関係の確認を意味しない',
        'コンテナ、実行時ダウンロード、git submodule、Git LFS の実体は取得しない'],
    }
  }

  async collect() {
    // 既存の証拠を上書きしない。上位ディレクトリは利用者が指定する信頼済みの保存先。
    fs.mkdirSync(this.output, { mode: 0o700 })
    const manifest = this.manifest
    try {
      manifest.stage = 'comparison_context'
      await this.prepareContext()
      manifest.stage = 'before_lock'
      const before = new Lockfile(await this.readLock(manifest.base, 'before.lock'))
      manifest.stage = 'after_lock'
      const after = new Lockfile(await this.readLock(manifest.head, 'after.lock'))
      manifest.workflows = { before: before.workflows, after: after.workflows }
      manifest.stage = 'workflow_diff'
      const contextDiff = await this.gitContext('diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--text',
        manifest.base, manifest.head, '--', '.github/workflows')
      this.save('workflows.diff', contextDiff)
      manifest.stage = 'consumer_snapshot'
      manifest.consumer = { directory: 'consumer', gaps: [] }
      await this.snapshot(this.context, manifest.head, 'consumer', manifest.consumer, ['.github/workflows', '.github/actions'])
      manifest.stage = 'upstream_updates'
      const updates = this.updates(before.dependencies, after.dependencies)
      for (const [index, update] of updates.entries()) {
        manifest.updates.push(update)
        await this.collectUpdate(update, String(index + 1).padStart(3, '0'))
      }
      const complete = manifest.consumer.gaps.length === 0 &&
        manifest.updates.every((update) => update.collection_status === 'complete')
      manifest.collection_status = complete ? 'complete' : 'incomplete'
      manifest.stage = 'finished'
    } catch (error) {
      if (!(error instanceof ReviewError)) throw error
      manifest.errors.push(error.message)
    } finally {
      this.saveJson('manifest.json', manifest)
    }
    return manifest
  }

  async prepareContext() {
    this.manifest.base = await this.git.text('-C', this.repo, 'rev-parse', '--verify', '--end-of-options', `${this.base}^{commit}`)
    this.manifest.head = await this.git.text('-C', this.repo, 'rev-parse', '--verify', '--end-of-options', `${this.head}^{commit}`)
    this.context = path.join(this.output, 'context.git')
    await this.git.run('init', '--bare', '--template=', this.context)
    for (const sha of new Set([this.manifest.base, this.manifest.head])) {
      await this.git.run(`--git-dir=${this.context}`, 'fetch', '--no-tags', '--no-recurse-submodules', '--depth=1', '--', this.repo, sha)
    }
  }

  gitContext(...args) {
    return this.git.run(`--git-dir=${this.context}`, ...args)
  }

  async readLock(sha, filename) {
    const mode = (await this.gitContext('ls-tree', sha, '--', LOCK_PATH)).toString('utf8')
    if (!mode.startsWith('100644 blob ') && !mode.startsWith('100755 blob ')) {
      throw new ReviewError(`${filename}: lockfile が存在しないか通常ファイルではありません`)
    }
    const content = await this.gitContext('show', `${sha}:${LOCK_PATH}`)
    this.save(filename, content)
    const text = decodeUtf8(content)
    if (text === null) throw new ReviewError(`${filename}: lockfile が UTF-8 ではありません`)
    return text
  }

  updates(before, after) {
    const old = { ...before }
    const current = { ...after }
    const result = []
    const repositoryOf = (key) => key.split('@')[0]
    for (const key of Object.keys(old).filter((key) => Object.hasOwn(current, key)).sort()) {
      const previous = old[key]
      const next = current[key]
      delete old[key]
      delete current[key]
      if (!sameEntry(previous, next)) result.push(this.update(repositoryOf(key), { [key]: previous }, { [key]: next }))
    }
    const repositories = [...new Set([...Object.keys(old), ...Object.keys(current)].map(repositoryOf))].sort()
    for (const repository of repositories) {
      const pick = (entries) => Object.fromEntries(Object.entries(entries).filter(([key]) => key.startsWith(`${repository}@`)))
      const oldEntries = pick(old)
      const newEntries = pick(current)
      if (Object.keys(oldEntries).length <= 1 && Object.keys(newEntries).length <= 1) {
        result.push(this.update(repository, oldEntries, newEntries))
      } else {
        // 複数バージョンを推測で対応付けない。追加は全ツリー、削除は旧ツリーを収集する。
        for (const [key, entry] of Object.entries(oldEntries)) result.push(this.update(repository, { [key]: entry }, {}))
        for (const [key, entry] of Object.entries(newEntries)) result.push(this.update(repository, {}, { [key]: entry }))
      }
    }
    return result
  }

  update(repository, before, after) {
    const previous = Object.values(before)[0]
    const next = Object.values(after)[0]
    return {
      repository, before, after,
      kind: !previous ? 'added' : !next ? 'removed' : 'changed',
      identity_changed: Boolean(previous && next && ['owner_id', 'repo_id'].some((field) => previous[field] !== next[field])),
      collection_status: 'incomplete', gaps: [],
    }
  }

  async collectUpdate(update, directory) {
    try {
      update.stage = 'initialize'
      update.directory = directory
      fs.mkdirSync(path.join(this.output, directory))
      const bare = path.join(this.output, directory, 'source.git')
      await this.git.run('init', '--bare', '--template=', bare)
      update.stage = 'resolve_source'
      const source = this.upstreamSource(update.repository)
      const snapshots = {}
      for (const side of ['before', 'after']) {
        const entry = Object.values(update[side])[0]
        if (!entry) continue

        const sha = entry.commit.replace(/^sha1-/, '')
        update.stage = `fetch_${side}`
        await this.git.run(`--git-dir=${bare}`, 'fetch', '--no-tags', '--no-recurse-submodules', '--depth=1', '--', source, sha)
        const actual = await this.git.text(`--git-dir=${bare}`, 'rev-parse', '--verify', `${sha}^{commit}`)
        if (actual !== sha) throw new ReviewError('取得したコミットが要求 SHA と一致しません')

        snapshots[side] = sha
        update.stage = `snapshot_${side}`
        await this.snapshot(bare, sha, `${directory}/${side}`, update)
      }
      // 三点比較や merge-base ではなく、置換前後の tree を直接比較する。
      update.stage = 'tree_diff'
      const emptyTree = await this.git.text(`--git-dir=${bare}`, 'hash-object', '-w', '-t', 'tree', os.devNull)
      const diff = await this.git.run(`--git-dir=${bare}`, 'diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--text',
        '--full-index', snapshots.before ?? emptyTree, snapshots.after ?? emptyTree, '--')
      this.save(`${directory}/changes.diff`, diff)
      if (update.gaps.length === 0) update.collection_status = 'complete'
      update.stage = 'finished'
    } catch (error) {
      if (!(error instanceof ReviewError)) throw error
      update.gaps.push(error.message)
    }
  }

  upstreamSource(repository) {
    if (!this.sourceRoot) return `https://github.com/${repository}.git`

    let source
    try {
      source = fs.realpathSync(path.join(this.sourceRoot, repository))
    } catch (error) {
      if (error.code === 'ENOENT') throw new ReviewError('ローカル取得元がありません')
      throw error
    }
    if (!source.startsWith(`${this.sourceRoot}/`)) throw new ReviewError('ローカル取得元が source-root の外です')
    return source
  }

  async snapshot(bare, sha, directory, update, paths = []) {
    const tree = await this.git.run(`--git-dir=${bare}`, 'ls-tree', '-r', '-l', '-z', sha, '--', ...paths)
    let total = 0
    const files = []
    for (const record of splitNul(tree)) {
      const tab = record.indexOf(0x09)
      const [mode, type, oid, size] = record.subarray(0, tab).toString('latin1').split(/\s+/)
      const filePath = decodeUtf8(record.subarray(tab + 1))
      if (filePath === null) throw new ReviewError('UTF-8 でないファイル名のため一覧を正確に保存できません')

      const bytes = Number.parseInt(size, 10) || 0
      const item = { path: filePath, mode, oid, size: bytes }
      if (type !== 'blob') {
        item.gap = 'submodule の実体は未取得'
      } else if (bytes > this.maxBytes || total + bytes > this.maxBytes) {
        item.gap = 'snapshot のサイズ制限を超えるため本文未取得'
      } else {
        const content = await this.git.run(`--git-dir=${bare}`, 'cat-file', 'blob', oid)
        total += content.length
        // 元のパスを保存先に使わず、symlink も作らない。
        item.content = `blobs/${oid}`
        this.save(`${directory}/${item.content}`, content)
        if (content.includes(0) || decodeUtf8(content) === null) item.gap = 'バイナリ本文の手動確認が必要'
        if (content.subarray(0, LFS_POINTER.length).equals(LFS_POINTER)) item.gap = 'Git LFS の実体は未取得'
        if (mode === '120000') item.note = 'symlink のリンク先文字列のみ保存'
      }
      if (item.gap) update.gaps.push(`${directory}: ${JSON.stringify(item.path)}: ${item.gap}`)
      files.push(item)
    }
    this.saveJson(`${directory}/tree.json`, files)
  }

  save(relative, content) {
    const target = path.join(this.output, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
  }

  saveJson(relative, data) {
    this.save(relative, `${JSON.stringify(data, null, 2)}\n`)
  }
}

function sameEntry(left, right) {
  return ['ref', 'commit', 'owner_id', 'repo_id'].every((field) => left[field] === right[field])
}

function splitNul(buffer) {
  const records = []
  let start = 0
  for (let index = buffer.indexOf(0); index !== -1; index = buffer.indexOf(0, start)) {
    records.push(buffer.subarray(start, index))
    start = index + 1
  }
  if (start < buffer.length) records.push(buffer.subarray(start))
  return records
}

const USAGE = `Usage: node collect.mjs --base REF [--head REF] --output NEW_DIR [options]
    --repo PATH
    --base REF
    --head REF
    --output PATH
    --source-root PATH   検証用: PATH/owner/repo から取得（GitHub の出所確認には使えない）
    --max-bytes N        各 Git 出力・各 snapshot の上限（既定 32 MiB）
    --timeout N          Git コマンドごとの秒数（既定 120）
    -h, --help`

function positiveInteger(value) {
  if (value === undefined) return undefined
  if (!/^-?[0-9]+$/.test(value) || Number(value) <= 0 || !Number.isSafeInteger(Number(value))) {
    throw new ReviewError('制限値は正の整数にしてください')
  }
  return Number(value)
}

export async function main(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        repo: { type: 'string', default: process.cwd() },
        base: { type: 'string' },
        head: { type: 'string', default: 'HEAD' },
        output: { type: 'string' },
        'source-root': { type: 'string' },
        'max-bytes': { type: 'string' },
        timeout: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    })
    if (values.help) {
      stdout.write(`${USAGE}\n`)
      return 0
    }
    if (!values.base || !values.output || positionals.length > 0) throw new ReviewError('--base と --output が必要です')
    const options = { repo: values.repo, base: values.base, head: values.head, output: values.output, sourceRoot: values['source-root'] }
    const maxBytes = positiveInteger(values['max-bytes'])
    const timeout = positiveInteger(values.timeout)
    if (maxBytes !== undefined) options.maxBytes = maxBytes
    if (timeout !== undefined) options.timeout = timeout

    const manifest = await new Collector(options).collect()
    const { collection_status, base, head, errors } = manifest
    stdout.write(`${JSON.stringify({ collection_status, base, head, errors })}\n`)
    return manifest.collection_status === 'complete' ? 0 : 2
  } catch (error) {
    const known = error instanceof ReviewError || String(error.code ?? '').startsWith('ERR_PARSE_ARGS') || error.syscall
    if (!known) throw error
    stderr.write(`収集失敗: ${error.message}\n`)
    return 2
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2))
}
