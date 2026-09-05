// Proves the proxy e2e suite is not vacuous (spec: proxy-hardening, AC-3.5).
//
// A green e2e run only shows that the proxy works; it does not show that the
// suite would notice if a security control were deleted. Review round 2 named
// four controls in `server/api/arbiter/[...].ts` that the suite passed straight
// over -- the redirect refusal, the auth gate, the response-body pipeline and
// the request-body relay -- because every other case was an authenticated GET
// against an upstream that never redirected and whose body nobody read.
//
// So: delete one control at a time from the BUILT shell chunk, re-run the suite,
// and require it to fail. A surviving mutant means the corresponding test proves
// nothing.
//
// Usage: pnpm build && pnpm test:e2e:mutation

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const CHUNK = '.output/server/chunks/routes/api/arbiter/_..._.mjs'

/**
 * `expect` records the verdict this control is supposed to produce. Everything
 * that guards the browser or the upstream must die; `equivalent` marks a rewrite
 * that provably cannot change behaviour, kept here so the next reviewer sees it
 * was measured rather than skipped.
 */
const MUTANTS = [
  {
    name: 'M1  drop `redirect: "manual"` from the upstream fetch',
    expect: 'killed',
    from: 'redirect: "manual"',
    to: 'redirect: "follow"',
  },
  {
    name: 'M2  make the session gate always return a user',
    expect: 'killed',
    from: 'getSessionUser: async () => (await getUserSession(event)).user,',
    to: 'getSessionUser: async () => ({ id: "anyone" }),',
  },
  {
    name: 'M3  end the response instead of piping the upstream body',
    expect: 'killed',
    from: 'await pipeline(Readable.fromWeb(webStream), event.node.res);',
    to: 'event.node.res.end();',
  },
  {
    name: 'M4  make the request-body reader return nothing',
    expect: 'killed',
    from: 'readBody: () => readRawBody(event, false),',
    to: 'readBody: async () => void 0,',
  },
  {
    // h3 sets `req.url` back to the raw URL whenever decoding changed it and the
    // layer is mounted at '/' (`createAppEventHandler`, the `_needsRawUrl`
    // branch), which is how Nitro mounts this router. The two reads therefore
    // name the same string today. `originalUrl` is still what the shell uses:
    // it is assigned once, before any layer runs, so it survives a future
    // nested mount that would slice `req.url`.
    name: 'M5  read the rewritten `req.url` instead of `originalUrl`',
    expect: 'equivalent',
    from: 'event.node.req.originalUrl) != null ? _a : event.node.req.url)',
    to: 'event.node.req.url) != null ? _a : event.node.req.url)',
  },
]

function write(line) {
  process.stdout.write(line + '\n')
}

if (!existsSync(CHUNK)) {
  write(`${CHUNK} is missing. Run \`pnpm build\` first.`)
  process.exit(1)
}

const original = readFileSync(CHUNK, 'utf8')
const failures = []

for (const mutant of MUTANTS) {
  if (!original.includes(mutant.from)) {
    failures.push(`${mutant.name}: anchor no longer present in the built chunk`)
    write(`ANCHOR MISS  ${mutant.name}`)
    continue
  }

  writeFileSync(CHUNK, original.split(mutant.from).join(mutant.to))
  let killed = false
  try {
    execSync('pnpm test:e2e', { stdio: 'pipe' })
  } catch {
    killed = true
  }
  writeFileSync(CHUNK, original)

  const verdict = killed ? 'killed' : 'survived'
  const ok = mutant.expect === 'equivalent' ? verdict === 'survived' : verdict === 'killed'
  write(`${ok ? 'OK  ' : 'FAIL'}  ${verdict.padEnd(8)} ${mutant.name}`)
  if (!ok) failures.push(`${mutant.name}: expected ${mutant.expect}, was ${verdict}`)
}

writeFileSync(CHUNK, original)

if (failures.length > 0) {
  write('\nthe e2e suite does not cover:\n  ' + failures.join('\n  '))
  process.exit(1)
}
write('\nevery guarded control is covered by a test that fails without it')
