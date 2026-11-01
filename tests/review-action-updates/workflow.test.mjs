import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const workflow = parse(fs.readFileSync(path.join(repositoryRoot, '.github/workflows/review-action-updates.yml'), 'utf8'))
const review = workflow.jobs.review
const comment = workflow.jobs.comment
const stepRun = (id) => review.steps.find((step) => step.id === id).run
const comparisonScript = stepRun('comparison')
const collectScript = stepRun('collect')
const commentScript = comment.steps[0].run
const base = 'a'.repeat(40)
const head = 'b'.repeat(40)
const pr = { state: 'open', base: { sha: base, repo: { full_name: 'owner/repo' } }, head: { sha: head } }

describe('Action update review workflow', () => {
  let directory

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'action-review-workflow-'))
    const mocks = {
      gh: `#!/bin/bash
if [[ "$1" == api ]]; then
  printf '%s' "$MOCK_PR"
elif [[ "$1" == pr && "$2" == comment ]]; then
  cp "$RUNNER_TEMP/action-review-comment.txt" "$MOCK_COMMENT"
else
  exit 1
fi
`,
      git: `#!/bin/bash
case "$1" in
  fetch) exit 0 ;;
  rev-parse) printf '%s\\n' "$MOCK_FETCH_HEAD" ;;
  diff) exit "$MOCK_DIFF_STATUS" ;;
  *) exit 1 ;;
esac
`,
      node: `#!/bin/bash
if [[ "$MOCK_MANIFEST" != absent ]]; then
  mkdir -p "$EVIDENCE"
  printf '%s' "$MOCK_MANIFEST" > "$EVIDENCE/manifest.json"
fi
exit "$MOCK_COLLECT_STATUS"
`,
      base64: `#!/bin/bash
[[ "\${MOCK_BASE64_FAILURE:-0}" == 0 ]] || exit 1
exec /usr/bin/base64 "$@"
`,
    }
    for (const [name, content] of Object.entries(mocks)) {
      fs.writeFileSync(path.join(directory, name), content, { mode: 0o755 })
    }
  })

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true })
  })

  const execute = (script, overrides = {}) => {
    const env = {
      PATH: `${directory}:${process.env.PATH}`,
      GH_TOKEN: 'test-token',
      PR_NUMBER: '123',
      REPOSITORY: 'owner/repo',
      BASE_SHA: base,
      HEAD_SHA: head,
      COLLECTION: 'incomplete',
      REPORT: '調査結果',
      GITHUB_OUTPUT: path.join(directory, 'output'),
      GITHUB_WORKSPACE: directory,
      RUNNER_TEMP: directory,
      EVIDENCE: path.join(directory, 'evidence'),
      MOCK_PR: JSON.stringify(pr),
      MOCK_FETCH_HEAD: head,
      MOCK_DIFF_STATUS: '1',
      MOCK_MANIFEST: '{"collection_status":"incomplete"}',
      MOCK_COLLECT_STATUS: '2',
      MOCK_COMMENT: path.join(directory, 'posted'),
      ...overrides,
    }
    return spawnSync('bash', ['-e', '-c', script], { env, encoding: 'utf8' })
  }
  const output = () => fs.readFileSync(path.join(directory, 'output'), 'utf8')
  const posted = () => path.join(directory, 'posted')

  it('作者を限定せずlockfile変更と手動起動を対象にし、権限を分離する', () => {
    expect(workflow.on.pull_request_target).toEqual({ types: ['opened', 'synchronize', 'reopened'] })
    expect(workflow.on.workflow_dispatch.inputs).toHaveProperty('pr_number')
    expect(workflow.permissions).toEqual({})
    expect(review.permissions).not.toHaveProperty('pull-requests-write')
    expect(review.permissions['pull-requests']).toBe('read')
    expect(comment.permissions).toEqual({ 'pull-requests': 'write' })
    expect(stepRun('analysis')).toContain('--available-tools=view,grep,glob')
    expect(stepRun('analysis')).toContain('--disable-builtin-mcps')
  })

  it('信頼済みrevisionのスクリプトでPRのheadを実行せずに収集する', () => {
    expect(review.steps[0].with).toMatchObject({ ref: '${{ github.workflow_sha }}', 'persist-credentials': false })
    expect(collectScript).toContain('node .github/skills/review-action-updates/scripts/collect.mjs')
    expect(review.steps.some((step) => /npm (ci|install)(?! -g @github\/copilot@)/.test(step.run ?? ''))).toBe(false)
  })

  it('現在のPRのSHAを固定し、lockfile差分の有無を判定する', () => {
    let result = execute(comparisonScript)
    expect(result.status, result.stderr).toBe(0)
    for (const line of ['number=123', `base=${base}`, `head=${head}`, 'changed=true']) expect(output()).toContain(line)

    result = execute(comparisonScript, { MOCK_DIFF_STATUS: '0' })
    expect(result.status, result.stderr).toBe(0)
    expect(output()).toContain('changed=false')
  })

  it('取得途中のhead変更、比較エラー、不正なPR番号を失敗扱いにする', () => {
    expect(execute(comparisonScript, { MOCK_FETCH_HEAD: 'c'.repeat(40) }).status).not.toBe(0)
    expect(execute(comparisonScript, { MOCK_DIFF_STATUS: '2' }).status).not.toBe(0)
    expect(execute(comparisonScript, { MOCK_BASE64_FAILURE: '1' }).status).not.toBe(0)
    expect(execute(comparisonScript, { PR_NUMBER: '1; touch injected' }).status).not.toBe(0)
  })

  it('収集失敗のうちmanifestがある不完全な結果だけをレビューへ渡す', () => {
    const result = execute(collectScript)
    expect(result.status, result.stderr).toBe(0)
    expect(output()).toContain('collection=incomplete')

    fs.rmSync(path.join(directory, 'evidence'), { recursive: true })
    expect(execute(collectScript, { MOCK_MANIFEST: 'absent' }).status).not.toBe(0)
    expect(execute(collectScript, { MOCK_MANIFEST: '{"collection_status":"complete"}' }).status).not.toBe(0)
    expect(execute(collectScript, { MOCK_COLLECT_STATUS: '3' }).status).not.toBe(0)
    expect(execute(collectScript, { MOCK_COLLECT_STATUS: '0' }).status).not.toBe(0)
  })

  it('未収集事項を明示し、PRが更新されたら古い結果を投稿しない', () => {
    const result = execute(commentScript)
    expect(result.status, result.stderr).toBe(0)
    const body = fs.readFileSync(posted(), 'utf8')
    for (const text of ['解析不完全', `> 比較: \`${base}\` → \`${head}\` / 収集: \`incomplete\``, '調査結果']) {
      expect(body).toContain(text)
    }

    fs.rmSync(posted())
    const changed = { ...pr, head: { sha: 'c'.repeat(40) } }
    expect(execute(commentScript, { MOCK_PR: JSON.stringify(changed) }).status).not.toBe(0)
    expect(fs.existsSync(posted())).toBe(false)
    expect(execute(commentScript, { REPORT: '' }).status).not.toBe(0)
    expect(fs.existsSync(posted())).toBe(false)
  })

  it('各runスクリプトがbash構文として有効である', () => {
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps.filter((item) => item.run)) {
        const result = spawnSync('bash', ['-n'], { input: step.run, encoding: 'utf8' })
        expect(result.status, result.stderr).toBe(0)
      }
    }
  })
})
