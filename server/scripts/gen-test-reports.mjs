// Collects the raw evidence for the Deliverable-3 reports. Cross-platform (Windows CMD, macOS, Linux).
//
//   cd server
//   node scripts/gen-test-reports.mjs                 # runs every test file (same as npm test)
//   node scripts/gen-test-reports.mjs test/a.test.js  # or only the files you list
//
// Writes to ../docs/test-reports/evidence/:
//   unit-test-run.txt      every test with pass/fail (spec reporter) and the totals
//   coverage-run.txt       line / branch / function coverage table (node built-in coverage)
//   lcov.info              machine readable coverage (used for the branch report)
//   inspection.txt         source-inspection checks used by TC-019, TC-023, TC-028
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '..', 'docs', 'test-reports', 'evidence');
mkdirSync(out, { recursive: true });
const files = process.argv.slice(2);
const header = `# generated ${new Date().toISOString()} | node ${process.version} | ${os.type()} ${os.release()}\n`;

function run(args, label) {
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return `${header}$ ${label}\n${r.stdout || ''}${r.stderr || ''}`;
}

writeFileSync(join(out, 'unit-test-run.txt'),
  run(['--test', '--test-reporter=spec', ...files], `node --test ${files.join(' ')}`));
writeFileSync(join(out, 'coverage-run.txt'),
  run(['--test', '--experimental-test-coverage', '--test-coverage-exclude=test/**', ...files],
      `node --test --experimental-test-coverage ${files.join(' ')}`));
spawnSync(process.execPath,
  ['--test', '--experimental-test-coverage', '--test-coverage-exclude=test/**',
   '--test-reporter=lcov', `--test-reporter-destination=${join(out, 'lcov.info')}`, ...files],
  { cwd: root, encoding: 'utf8' });

// ---- source inspection (static checks, no running server needed) ----
const src = join(root, 'src');
const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
});
const all = walk(src);
const read = (p) => readFileSync(p, 'utf8');
const rel = (p) => p.slice(root.length + 1).replaceAll('\\', '/');
const grep = (re) => all.flatMap((p) => read(p).split('\n').map((l, i) => [p, i + 1, l])
  .filter(([, , l]) => re.test(l)).map(([p, i, l]) => `  ${rel(p)}:${i}: ${l.trim()}`));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const lines = [header.trim(), ''];
lines.push('TC-019 password hashing');
lines.push(...grep(/bcrypt\.(hash|compare)|passwordHash/));
lines.push('', 'TC-028 horizontal scaling: shared adapter / broker in code or dependencies?');
const scale = grep(/redis|createAdapter|socket\.io-adapter|cluster/i);
lines.push(...(scale.length ? scale : ['  (none found in src/)']));
lines.push('  dependencies: ' + Object.keys(pkg.dependencies).join(', '));
lines.push('', 'TC-028 process-local state (in-memory Map)');
lines.push(...grep(/new Map\(/));
lines.push('', 'TC-011 away presence state in server code?');
const away = grep(/\baway\b/i);
lines.push(...(away.length ? away : ['  (none found: only online/offline exist)']));
lines.push('', 'TC-018 administration feature in server code?');
const admin = grep(/\badmin\b|isAdmin|role/i);
lines.push(...(admin.length ? admin : ['  (none found)']));
lines.push('', 'TC-023 modular structure: folder -> files');
for (const d of readdirSync(src).filter((f) => statSync(join(src, f)).isDirectory())) {
  lines.push(`  src/${d}/ : ${readdirSync(join(src, d)).join(', ')}`);
}
lines.push('', 'TC-023 layering check: which folders each folder imports from');
const dirOf = (p) => rel(p).split('/')[1];
const deps = {};
for (const p of all) {
  for (const m of read(p).matchAll(/from '(\.\.?\/[^']+)'/g)) {
    const target = join(dirname(p), m[1]);
    const d = rel(target + '.js').split('/')[1];
    if (d && d !== dirOf(p) && !m[1].startsWith('./')) (deps[dirOf(p)] ||= new Set()).add(d);
  }
}
for (const [d, set] of Object.entries(deps).sort()) lines.push(`  ${d} -> ${[...set].sort().join(', ')}`);
writeFileSync(join(out, 'inspection.txt'), lines.join('\n') + '\n');
console.log(`Evidence written to ${out}`);
