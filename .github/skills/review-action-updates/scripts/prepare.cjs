"use strict";

// All inputs are data. Do not require/import/evaluate bundles or load project configs.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { parse } = require("@babel/parser");
const generate = require("@babel/generator").default;
const { TraceMap, decodedMappings } = require("@jridgewell/trace-mapping");

const MAX_INPUT = 16 * 1024 * 1024;
const MAX_OUTPUT = 192 * 1024 * 1024;
const CHUNK_BYTES = 24 * 1024;
const MAX_PAIRS = 100;
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const json = (bytes) => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));

function read(file, limit = MAX_INPUT) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.size > limit) throw new Error("not_regular_file_or_input_limit");
  return fs.readFileSync(file);
}

function inside(root, relative) {
  if (typeof relative !== "string" || path.isAbsolute(relative)) throw new Error("invalid_evidence_path");
  const resolved = fs.realpathSync(path.resolve(root, relative));
  if (!resolved.startsWith(root + path.sep)) throw new Error("evidence_path_escape");
  return resolved;
}

class Artifacts {
  constructor(root) { this.root = root; this.bytes = 0; }
  write(name, bytes) {
    const content = Buffer.from(bytes);
    this.bytes += content.length;
    if (this.bytes > MAX_OUTPUT) throw new Error("output_limit");
    const filename = path.join(this.root, name);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, content, { flag: "wx" });
    return name;
  }
  json(name, data) { return this.write(name, JSON.stringify(data, null, 2) + "\n"); }
  chunks(prefix, text) {
    // Split at UTF-8 character boundaries, even for a single enormous string literal.
    const result = [];
    let buffer = [], size = 0, offset = 0, line = 1, startLine = 1;
    const flush = () => {
      if (!size) return;
      const content = buffer.join("");
      const file = this.write(`${prefix}/${String(result.length + 1).padStart(4, "0")}.txt`, content);
      result.push({ file, start_byte: offset, end_byte: offset + size, start_line: startLine, end_line: line });
      offset += size; startLine = line; buffer = []; size = 0;
    };
    for (const char of text) {
      const bytes = Buffer.byteLength(char);
      if (size + bytes > CHUNK_BYTES) flush();
      buffer.push(char); size += bytes;
      if (char === "\n") { line++; if (size >= CHUNK_BYTES / 2) flush(); }
    }
    flush();
    return result;
  }
}

function diff(artifacts, prefix, before, after) {
  if (before === after) return { changed: false, chunks: [] };
  const a = artifacts.write(`${prefix}/before.txt`, before);
  const b = artifacts.write(`${prefix}/after.txt`, after);
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_") && !["GIT_CONFIG_NOSYSTEM", "GIT_CONFIG_GLOBAL"].includes(key)) delete env[key];
  const run = spawnSync("git", ["-c", "core.hooksPath=/dev/null", "diff", "--no-index", "--no-ext-diff", "--no-textconv", "--text", "--no-renames", "--", a, b],
    { cwd: artifacts.root, env, encoding: "utf8", timeout: 15000, maxBuffer: 32 * 1024 * 1024 });
  if (run.error || ![0, 1].includes(run.status)) throw new Error("diff_failed_or_limit");
  return { changed: true, chunks: artifacts.chunks(`${prefix}/diff`, run.stdout) };
}

function blob(root, directory, item) {
  if (!item) return null;
  if (!["100644", "100755"].includes(item.mode) || item.gap) throw new Error("missing_or_nonregular_blob");
  if (!/^[0-9a-f]{40}$/.test(item.oid) || item.content !== `blobs/${item.oid}`) throw new Error("invalid_blob_reference");
  const bytes = read(inside(root, `${directory}/${item.content}`));
  const oid = crypto.createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  if (oid !== item.oid || bytes.length !== item.size) throw new Error("blob_integrity_mismatch");
  return bytes;
}

function formatBundle(bytes, artifacts, side) {
  const code = bytes ? new TextDecoder("utf-8", { fatal: true }).decode(bytes) : "";
  const ast = parse(code, { sourceType: "unambiguous", tokens: true, errorRecovery: false });
  const output = generate(ast, { comments: true, compact: false, minified: false, sourceMaps: true, sourceFileName: "bundle" }, code);
  // Record the first available original position for every formatted line.
  const positions = decodedMappings(new TraceMap(output.map)).map((segments, index) => {
    const first = segments.find((segment) => segment.length >= 4);
    return { formatted_line: index + 1, raw_line: first ? first[2] + 1 : null, raw_column_utf16: first ? first[3] : null };
  });
  const formatted = output.code + "\n";
  return { code, ast, formatted, summary: {
    present: bytes !== null,
    raw_sha256: hash(bytes || Buffer.alloc(0)), raw_bytes: bytes?.length || 0,
    normalized_sha256: hash(formatted), formatted_lines: formatted.split("\n").length,
    chunks: artifacts.chunks(`${side}/formatted`, formatted),
    positions: artifacts.json(`${side}/positions.json`, positions)
  } };
}

function inspectMap(bytes, bundle) {
  if (!bytes) return { summary: { status: "absent" }, sources: new Map() };
  const data = json(bytes);
  if (data.version !== 3 || data.sections || !Array.isArray(data.sources) || !Array.isArray(data.sourcesContent) ||
      data.sources.length !== data.sourcesContent.length || data.sources.length > 10000 ||
      !data.sources.every((s) => typeof s === "string") ||
      !data.sourcesContent.every((s) => s === null || typeof s === "string") ||
      !Array.isArray(data.names) || !data.names.every((s) => typeof s === "string") ||
      typeof data.mappings !== "string" || (data.sourceRoot !== undefined && typeof data.sourceRoot !== "string")) {
    throw new Error("unsupported_source_map");
  }
  const keys = data.sources.map((source) => JSON.stringify([data.sourceRoot || "", source]));
  if (new Set(keys).size !== keys.length) throw new Error("ambiguous_source_names");
  const sources = new Map(keys.map((key, i) => [key, { source: data.sources[i], source_root: data.sourceRoot || "", content: data.sourcesContent[i] }]));
  const lines = bundle.code.split("\n");
  const originalLines = data.sourcesContent.map((s) => s === null ? null : s.split("\n"));
  const decoded = decodedMappings(new TraceMap(data));
  let segments = 0, mapped = 0, unmapped = 0;
  for (let line = 0; line < decoded.length; line++) {
    let previous = -1;
    for (const segment of decoded[line]) {
      if (++segments > 2000000) throw new Error("source_map_segment_limit");
      if (![1, 4, 5].includes(segment.length) || !segment.every(Number.isSafeInteger) ||
          segment[0] < 0 || segment[0] < previous || line >= lines.length || segment[0] > lines[line].length) throw new Error("invalid_generated_mapping");
      previous = segment[0];
      if (segment.length >= 4) {
        const [, source, row, column, name] = segment;
        if (source < 0 || source >= keys.length || row < 0 || column < 0 ||
            (name !== undefined && (name < 0 || name >= data.names.length))) throw new Error("invalid_original_mapping");
        const text = originalLines[source];
        if (text && (row >= text.length || column > text[row].length)) throw new Error("original_mapping_out_of_range");
      }
    }
  }
  // This is a claimed association, not verification that sources explain executable bytes.
  for (const token of bundle.ast.tokens) {
    if (token.type.label === "eof") continue;
    const candidates = decoded[token.loc.start.line - 1] || [];
    let lo = 0, hi = candidates.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (candidates[mid][0] <= token.loc.start.column) lo = mid + 1; else hi = mid; }
    const segment = candidates[lo - 1];
    if (segment && segment.length >= 4) mapped++; else unmapped++;
  }
  return { sources, summary: { status: "available_unverified", sha256: hash(bytes), source_count: sources.size,
    missing_contents: data.sourcesContent.filter((s) => s === null).length,
    segments, claimed_mapped_tokens: mapped, unmapped_tokens: unmapped,
    note: "座標の範囲確認のみ。mapとsourcesContentは未信頼で、意味の一致や網羅性の証明ではない" } };
}

function preparePair(job) {
  const { root, output, update, filename, beforeItem, afterItem, beforeMap, afterMap } = job;
  const artifacts = new Artifacts(output);
  const result = { path: filename, repository: update.repository, status: "complete", gaps: [], warnings: [],
    requires_bundle_review: true, sources: [], limits: { input_bytes: MAX_INPUT, output_bytes: MAX_OUTPUT, chunk_bytes: CHUNK_BYTES } };
  const formatted = {}, maps = {}, rawMaps = {}, raw = {};
  for (const side of ["before", "after"]) {
    try {
      raw[side] = blob(root, `${update.directory}/${side}`, side === "before" ? beforeItem : afterItem);
      formatted[side] = formatBundle(raw[side], artifacts, side);
      result[side] = formatted[side].summary;
      const item = side === "before" ? beforeItem : afterItem;
      result[side].git_oid = item?.oid || null;
      result[side].mode = item?.mode || null;
    } catch { result.gaps.push(`${side}: bundle_parse_or_input_failed`); }
    try {
      rawMaps[side] = blob(root, `${update.directory}/${side}`, side === "before" ? beforeMap : afterMap);
      if (formatted[side]) maps[side] = inspectMap(rawMaps[side], formatted[side]);
      if (maps[side]) result[side].source_map = maps[side].summary;
    } catch { result.gaps.push(`${side}: source_map_parse_or_input_failed`); }
  }
  result.bundle_changed = (beforeItem?.oid || null) !== (afterItem?.oid || null) || (beforeItem?.mode || null) !== (afterItem?.mode || null);
  result.requires_bundle_review = result.bundle_changed;
  if (result.bundle_changed && beforeMap && afterMap && beforeMap.oid === afterMap.oid) result.warnings.push("bundle_changed_but_source_map_unchanged");
  if (formatted.before && formatted.after) {
    try {
      result.normalized_diff = diff(artifacts, "normalized", formatted.before.formatted, formatted.after.formatted);
      if (result.bundle_changed && !result.normalized_diff.changed) result.warnings.push("raw_bundle_changed_without_normalized_change_review_original");
    } catch { result.gaps.push("normalized_diff_failed_or_limit"); }
  }
  // A missing bundle is a known empty side. A failed/missing map for an existing
  // bundle means its source list is unknown, rather than empty.
  const known = (side, item) => maps[side]?.summary.status === "available_unverified" ||
    (!item && maps[side]?.summary.status === "absent");
  const comparable = known("before", beforeItem) && known("after", afterItem);
  result.source_comparison = comparable ? "available" : "unavailable";
  if (!comparable && [maps.before, maps.after].some((map) => map?.summary.status === "available_unverified")) {
    result.gaps.push("source_comparison_unavailable");
  }
  const oldSources = comparable ? maps.before.sources : new Map(), newSources = comparable ? maps.after.sources : new Map();
  for (const key of [...new Set([...oldSources.keys(), ...newSources.keys()])].sort()) {
    const a = oldSources.get(key), b = newSources.get(key);
    const state = !a ? "added" : !b ? "removed" : a.content === b.content ? "unchanged" : "changed";
    const row = { source: (b || a).source, source_root: (b || a).source_root, state,
      before_sha256: typeof a?.content === "string" ? hash(a.content) : null,
      after_sha256: typeof b?.content === "string" ? hash(b.content) : null };
    result.sources.push(row);
    if ((a && a.content === null) || (b && b.content === null)) { row.gap = "missing_sourcesContent"; continue; }
    if (state !== "unchanged") {
      try { row.diff = diff(artifacts, `sources/${String(result.sources.length).padStart(4, "0")}`, a?.content || "", b?.content || ""); }
      catch { row.gap = "source_diff_failed_or_limit"; }
    }
  }
  if (result.bundle_changed && result.sources.length && result.sources.every((s) => s.state === "unchanged")) result.warnings.push("bundle_changed_without_sourcesContent_changes");
  if (result.sources.some((s) => s.gap)) result.gaps.push("source_content_comparison_incomplete");
  result.source_counts = comparable ? Object.fromEntries(["added", "removed", "changed", "unchanged"].map((state) => [state, result.sources.filter((s) => s.state === state).length])) : null;
  if (result.gaps.length) result.status = "incomplete";
  result.review_note = "前処理の完了はレビュー完了ではない。バンドル差分はmapの内容によらず全て調査対象に残す";
  artifacts.json("result.json", result);
  return result;
}

function tree(root, update, side) {
  if (!Object.keys(update[side] || {}).length) return [];
  const rows = json(read(inside(root, `${update.directory}/${side}/tree.json`)));
  if (!Array.isArray(rows) || rows.some((r) => typeof r.path !== "string") || new Set(rows.map((r) => r.path)).size !== rows.length) throw new Error("invalid_tree");
  return rows;
}

function prepare(rootArg, outputArg) {
  const root = fs.realpathSync(rootArg), output = path.resolve(outputArg);
  fs.mkdirSync(output, { mode: 0o700 });
  const manifest = { schema_version: 1, status: "incomplete", errors: [], bundles: [],
    tools: { parser: require("@babel/parser/package.json").version, generator: require("@babel/generator/package.json").version,
      trace_mapping: require("@jridgewell/trace-mapping/package.json").version },
    note: "source mapを信用してバンドルの差分を除外しない。前処理は対象コードを実行しない" };
  try {
    const bytes = read(inside(root, "manifest.json"));
    manifest.evidence_manifest_sha256 = hash(bytes);
    const evidence = json(bytes);
    manifest.base = evidence.base; manifest.head = evidence.head;
    manifest.collection_status = evidence.collection_status;
    if (!Array.isArray(evidence.updates)) throw new Error("invalid_manifest");
    for (const update of evidence.updates) {
      if (!/^\d{3,}$/.test(update.directory)) throw new Error("invalid_update_directory");
      let before, after;
      try { before = tree(root, update, "before"); after = tree(root, update, "after"); }
      catch { manifest.errors.push(`${update.directory}: snapshot_unavailable`); continue; }
      const a = new Map(before.map((r) => [r.path, r])), b = new Map(after.map((r) => [r.path, r]));
      for (const filename of [...new Set([...a.keys(), ...b.keys()])].sort()) {
        if (!/\.(?:c|m)?js$/.test(filename)) continue;
        if (a.get(filename)?.oid === b.get(filename)?.oid && a.get(filename)?.mode === b.get(filename)?.mode &&
            a.get(`${filename}.map`)?.oid === b.get(`${filename}.map`)?.oid) continue;
        if (manifest.bundles.length >= MAX_PAIRS) throw new Error("bundle_count_limit_remaining_files_unprocessed");
        const directory = String(manifest.bundles.length + 1).padStart(4, "0");
        const dest = path.join(output, directory);
        fs.mkdirSync(dest);
        const job = { root, output: dest, update, filename, beforeItem: a.get(filename), afterItem: b.get(filename),
          beforeMap: a.get(`${filename}.map`), afterMap: b.get(`${filename}.map`) };
        const jobPath = path.join(dest, "job.json");
        fs.writeFileSync(jobPath, JSON.stringify(job));
        const env = { ...process.env }; delete env.NODE_OPTIONS; delete env.NODE_PATH; delete env.NODE_TEST_CONTEXT;
        const run = spawnSync(process.execPath, ["--max-old-space-size=768", __filename, "--worker", jobPath],
          { env, timeout: 120000, maxBuffer: 1024 * 1024 });
        let result;
        try { if (run.error || run.status !== 0) throw new Error(); result = json(read(path.join(dest, "result.json"))); }
        catch { result = { path: filename, repository: update.repository, status: "incomplete", gaps: ["worker_failed_or_resource_limit"],
          failure: { code: run.error?.code || null, exit_code: run.status, signal: run.signal }, requires_bundle_review: true }; }
        fs.unlinkSync(jobPath);
        manifest.bundles.push({ ...result, directory });
      }
    }
    manifest.status = manifest.errors.length || manifest.bundles.some((b) => b.status !== "complete") ? "incomplete" : "complete";
  } catch (error) {
    manifest.errors.push(error.code || (typeof error.message === "string" && /^[a-z_]+$/.test(error.message) ? error.message : "preparation_failed"));
  }
  fs.writeFileSync(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  return manifest;
}

if (require.main === module) {
  try {
    if (process.argv[2] === "--worker" && process.argv.length === 4) {
      preparePair(json(read(process.argv[3])));
    } else {
      if (process.argv.length !== 6 || process.argv[2] !== "--evidence" || process.argv[4] !== "--output") throw new Error("usage: node prepare.cjs --evidence DIR --output NEW_DIR");
      const manifest = prepare(process.argv[3], process.argv[5]);
      console.log(JSON.stringify({ status: manifest.status, bundles: manifest.bundles.length, errors: manifest.errors }));
      process.exitCode = manifest.status === "complete" ? 0 : 2;
    }
  } catch { console.error("前処理失敗（入力・保存先・依存関係を確認してください）"); process.exitCode = 2; }
}

module.exports = { prepare, preparePair, inspectMap, CHUNK_BYTES };
