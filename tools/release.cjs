#!/usr/bin/env node
// Builds the EpicMap release assets and release notes from the committed tree.
//
//   node tools/release.cjs --tag v1.2.6 [--out dist] [--repo owner/name]
//                          [--node-tap work/node-test.tap]
//                          [--browser-report work/browser-check/browser-results.json]
//
// Writes to --out:
//   epicmap-<tag>.zip         complete installation (git archive of HEAD, minus export-ignore paths)
//   epicmap-<tag>-update.zip  changed EpicMap/ and scripts/ files since the previous release, plus UPDATE.txt
//                             (only when a previous release with a complete ZIP exists)
//   SHA256SUMS.txt
//   release-notes.md          CHANGELOG section + generated download/installation/verification sections
//   release.json              { tag, version, title, prerelease, previousTag, ... } for the workflow
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const UPDATE_DIRS = ['EpicMap/', 'scripts/'];
const COMPANION = 'scripts/epicmap.lic';

function parseArgs(argv) {
  const args = {
    out: 'dist',
    repo: process.env.GITHUB_REPOSITORY || '',
    nodeTap: 'work/node-test.tap',
    browserReport: 'work/browser-check/browser-results.json',
  };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (!(key in args) && key !== 'tag') throw new Error(`Unknown option ${argv[i]}`);
    args[key] = argv[++i];
  }
  if (!args.tag) throw new Error('--tag is required (for example --tag v1.2.6)');
  return args;
}

const run = (cmd, argv, opts = {}) => execFileSync(cmd, argv, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26, ...opts });
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// ---- versions -------------------------------------------------------------

const TAG_RE = /^v(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

function parseTag(tag) {
  const m = TAG_RE.exec(tag);
  if (!m) return null;
  return { tag, nums: [+m[1], +m[2], +m[3]], pre: m[4] || null, base: `${m[1]}.${m[2]}.${m[3]}` };
}

// Semver precedence: numbers first, then a release outranks its prereleases,
// then prerelease identifiers compare numerically or lexically.
function compareTags(a, b) {
  for (let i = 0; i < 3; i++) if (a.nums[i] !== b.nums[i]) return a.nums[i] - b.nums[i];
  if (!a.pre || !b.pre) return (a.pre ? -1 : 0) - (b.pre ? -1 : 0);
  const pa = a.pre.split('.'), pb = b.pre.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    const na = /^\d+$/.test(pa[i]), nb = /^\d+$/.test(pb[i]);
    if (na && nb && +pa[i] !== +pb[i]) return +pa[i] - +pb[i];
    if (na !== nb) return na ? -1 : 1;
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

// ---- changelog ------------------------------------------------------------

function changelogSection(version) {
  const text = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n');
  const headings = [...text.matchAll(/^## \[([^\]]+)\](.*)$/gm)];
  const idx = headings.findIndex((h) => h[1] === version);
  if (idx < 0) throw new Error(`CHANGELOG.md has no "## [${version}]" section`);
  const h = headings[idx];
  const start = h.index + h[0].length;
  const end = idx + 1 < headings.length ? headings[idx + 1].index : text.length;
  const parts = h[2].split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(parts[0] || '') ? parts.shift() : null;
  const title = parts.join(' - ');
  if (!title) throw new Error(`CHANGELOG.md section ${version} needs a title: "## [${version}] - YYYY-MM-DD - Title"`);
  let body = text.slice(start, end).trim();

  // Pull out "### Installation notes" so it can be merged into the generated install section.
  let installNotes = [];
  body = body.replace(/^### Installation notes\n([\s\S]*?)(?=^### |(?![\s\S]))/m, (_, notes) => {
    installNotes = notes.trim().split('\n').filter((l) => l.trim()).map((l) => l.replace(/^\s*[-*]\s+/, ''));
    return '';
  }).trim();
  return { date, title, body, installNotes };
}

// Release bodies cannot resolve repository-relative paths; point images and links at the tagged tree.
function absolutizeLinks(markdown, repo, tag) {
  if (!repo) return markdown;
  return markdown.replace(/(!?)\[([^\]]*)\]\(([^)\s]+)\)/g, (all, bang, label, target) => {
    if (/^(?:[a-z]+:|#|\/)/i.test(target)) return all;
    const base = bang ? `https://raw.githubusercontent.com/${repo}/${tag}/` : `https://github.com/${repo}/blob/${tag}/`;
    return `${bang}[${label}](${base}${target.replace(/^\.\//, '')})`;
  });
}

// ---- previous release -----------------------------------------------------

function findPreviousRelease(repo, current) {
  if (!repo) return null;
  let releases;
  try {
    releases = JSON.parse(run('gh', ['api', '--paginate', '--slurp', `repos/${repo}/releases?per_page=100`])).flat();
  } catch (e) {
    throw new Error(`Could not list releases for ${repo}: ${e.message}`);
  }
  const candidates = releases
    .filter((r) => !r.draft)
    .map((r) => ({ release: r, parsed: parseTag(r.tag_name) }))
    .filter(({ release, parsed }) => parsed
      && compareTags(parsed, current) < 0
      && (current.pre || !parsed.pre) // stable releases only update from stable releases
      && release.assets.some((a) => a.name === `epicmap-${release.tag_name}.zip`))
    .sort((a, b) => compareTags(b.parsed, a.parsed));
  return candidates[0] ? candidates[0].release.tag_name : null;
}

function listFiles(dir) {
  const out = [];
  (function walk(rel) {
    for (const ent of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(p); else if (ent.isFile()) out.push(p);
    }
  })('');
  return out.sort();
}

// ---- test results ---------------------------------------------------------

function readVerification(args) {
  const tapFile = path.resolve(root, args.nodeTap);
  const reportFile = path.resolve(root, args.browserReport);
  if (!fs.existsSync(tapFile)) throw new Error(`Missing offline test results at ${args.nodeTap}; run the tests first`);
  if (!fs.existsSync(reportFile)) throw new Error(`Missing browser check results at ${args.browserReport}; run npm run test:browser first`);
  const tap = fs.readFileSync(tapFile, 'utf8');
  const count = (name) => { const m = new RegExp(`^# ${name} (\\d+)$`, 'm').exec(tap); return m ? +m[1] : NaN; };
  const tests = count('tests'), pass = count('pass'), fail = count('fail');
  if (!(tests > 0) || pass !== tests || fail !== 0) throw new Error(`Offline tests did not all pass (tests=${tests} pass=${pass} fail=${fail})`);
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  if (!report.passed || !Array.isArray(report.checks) || !report.checks.length || (report.pageErrors || []).length) {
    throw new Error('Browser check report does not show a clean pass');
  }
  return { tests, browserChecks: report.checks };
}

// ---- main -----------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));
  const current = parseTag(args.tag);
  if (!current) throw new Error(`Tag ${args.tag} is not vX.Y.Z or vX.Y.Z-suffix`);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (pkg.version !== current.base && pkg.version !== args.tag.slice(1)) {
    throw new Error(`Tag ${args.tag} does not match package.json version ${pkg.version}`);
  }
  for (const f of ['UPDATE.txt', 'INSTALL-UPDATE.txt', 'docs/USER_GUIDE.md']) {
    if (!fs.readFileSync(path.join(root, f), 'utf8').includes(current.base)) {
      throw new Error(`${f} does not mention ${current.base}; update it for this release`);
    }
  }
  if (run('git', ['status', '--porcelain', '--untracked-files=no']).trim()) {
    throw new Error('Tracked files have uncommitted changes; releases are built from the committed tree');
  }

  const log = run('git', ['log', '-1', '--format=%H']).trim();
  const changes = changelogSection(current.base);
  const verification = readVerification(args);
  const out = path.resolve(root, args.out);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'epicmap-release-'));

  // Complete installation: the committed tree minus export-ignore paths, with the user guide as README.md.
  const stage = path.join(tmp, 'stage');
  fs.mkdirSync(stage);
  const tarFile = path.join(tmp, 'tree.tar');
  run('git', ['archive', '--format=tar', '-o', tarFile, 'HEAD']);
  run('tar', ['-xf', tarFile, '-C', stage]);
  fs.copyFileSync(path.join(root, 'docs/USER_GUIDE.md'), path.join(stage, 'README.md'));
  const stageFiles = listFiles(stage);
  for (const required of ['README.md', 'EpicMap/index.html', COMPANION]) {
    if (!stageFiles.includes(required)) throw new Error(`Complete ZIP would be missing ${required}`);
  }
  const fullZip = `epicmap-${args.tag}.zip`;
  run('zip', ['-X', '-q', '-r', path.join(out, fullZip), '.'], { cwd: stage });
  const assets = [fullZip];

  // Update: files that differ from the previous release's complete ZIP.
  const previousTag = findPreviousRelease(args.repo, current);
  let update = null;
  if (previousTag) {
    const prevDir = path.join(tmp, 'previous');
    run('gh', ['release', 'download', previousTag, '-R', args.repo, '-p', `epicmap-${previousTag}.zip`, '-D', tmp]);
    run('unzip', ['-q', path.join(tmp, `epicmap-${previousTag}.zip`), '-d', prevDir]);
    const inScope = (f) => UPDATE_DIRS.some((d) => f.startsWith(d));
    const prevFiles = new Set(listFiles(prevDir).filter(inScope));
    const changed = stageFiles.filter(inScope).filter((f) => !prevFiles.has(f)
      || sha256(path.join(stage, f)) !== sha256(path.join(prevDir, f)));
    const removed = [...prevFiles].filter((f) => !stageFiles.includes(f));
    update = { changed, removed, companionChanged: changed.includes(COMPANION) };
    if (changed.length) {
      const updateZip = `epicmap-${args.tag}-update.zip`;
      run('zip', ['-X', '-q', path.join(out, updateZip), 'UPDATE.txt', ...changed], { cwd: stage });
      assets.push(updateZip);
      update.zip = updateZip;
    }
  }

  const sums = assets.map((a) => `${sha256(path.join(out, a))}  ${a}`).join('\n') + '\n';
  fs.writeFileSync(path.join(out, 'SHA256SUMS.txt'), sums);
  fs.rmSync(tmp, { recursive: true, force: true });

  const notes = renderNotes({ args, changes, update, previousTag, verification, sums, commit: log });
  fs.writeFileSync(path.join(out, 'release-notes.md'), notes);
  const meta = {
    tag: args.tag,
    version: args.tag.slice(1),
    title: `EpicMap ${args.tag} - ${changes.title}`,
    prerelease: Boolean(current.pre),
    previousTag,
    commit: log,
    assets: [...assets, 'SHA256SUMS.txt'],
    update,
  };
  fs.writeFileSync(path.join(out, 'release.json'), JSON.stringify(meta, null, 2) + '\n');
  console.log(JSON.stringify(meta, null, 2));
}

function renderNotes({ args, changes, update, previousTag, verification, sums, commit }) {
  const full = `epicmap-${args.tag}.zip`;
  const lines = [];
  lines.push(absolutizeLinks(changes.body.replace(/^###(?=\s)/gm, '##'), args.repo, args.tag), '');

  lines.push('## Downloads and installation', '');
  lines.push(`- **New installation:** download \`${full}\`, extract it, place the \`EpicMap\` folder in your Lich folder and copy \`scripts/epicmap.lic\` into your Lich scripts folder. Run \`;epicmap\`; additional characters use \`;epicmap noopen\`.`);
  if (update && update.zip) {
    const companion = update.companionChanged ? ' and copy its `scripts/epicmap.lic` into your Lich scripts folder' : '';
    lines.push(`- **Existing installation (${previousTag}):** download \`${update.zip}\` and merge its \`EpicMap\` folder into the existing one${companion}. Keep your existing maps and room data. Users on an older version should use the complete ZIP.`);
  } else {
    lines.push('- **Existing installation:** replace your `EpicMap` folder with the one from the complete ZIP' +
      (update && !update.companionChanged ? '.' : ' and copy `scripts/epicmap.lic` into your Lich scripts folder.'));
  }
  if (update && update.removed.length) {
    lines.push(`- Delete these files from an existing installation; they were removed after ${previousTag}: ${update.removed.map((f) => `\`${f}\``).join(', ')}.`);
  }
  if (update && !update.companionChanged) {
    lines.push('- Reload the open map with **Ctrl+F5**. No Lich companion restart is needed for this browser-only update.');
  } else {
    lines.push('- Restart the Lich companion with `;kill epicmap` and then `;epicmap`, and reload the open map with **Ctrl+F5**.');
  }
  for (const note of changes.installNotes) lines.push(`- ${note}`);
  lines.push('');
  lines.push(update && update.zip
    ? 'The complete ZIP includes all maps, data, the companion and artwork credits. Do not use the smaller update as a complete installation.'
    : 'The complete ZIP includes all maps, data, the companion and artwork credits.');
  lines.push('');

  const zipWord = update && update.zip ? 'Both ZIPs were' : 'The ZIP was';
  lines.push('## Verification', '');
  lines.push(`All ${verification.tests} offline regression tests and ${verification.browserChecks.length} headless-browser check groups passed. ${zipWord} built by GitHub Actions from commit ${commit.slice(0, 7)}.`, '');
  lines.push('<details><summary>Browser checks</summary>', '');
  for (const check of verification.browserChecks) lines.push(`- ${check}`);
  lines.push('', '</details>', '');
  lines.push('SHA-256 (also in SHA256SUMS.txt):', '', '```text', sums.trimEnd(), '```', '');
  return lines.join('\n');
}

try {
  main();
} catch (e) {
  console.error(`release: ${e.message}`);
  process.exit(1);
}
