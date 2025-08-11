#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'node:child_process';

function escapeMdx(text) {
  if (!text) return '';
  return String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatArg(arg) {
  const base = arg.variadic ? `${arg.name}...` : arg.name;
  return arg.required ? `<${base}>` : `[${base}]`;
}
function toSlug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function makeCommandFilepath(commandPath) {
  const parts = commandPath.split(' ');
  if (parts.length === 1) return { relDir: '', filename: `${toSlug(parts[0])}.mdx` };
  return { relDir: parts.slice(0, -1).map(toSlug).join('/'), filename: `${toSlug(parts[parts.length - 1])}.mdx` };
}

function renderOptionsTable(options) {
  if (!options.length) return 'No options.\n';
  const rows = options
    .map((o) => `| ${escapeMdx(o.short ?? '')} | ${escapeMdx(o.long ?? '')} | ${escapeMdx(o.description ?? '')} | ${o.required ? 'Yes' : 'No'} | ${o.defaultValue === undefined ? '' : `\`${escapeMdx(String(o.defaultValue))}\``} |`)
    .join('\n');
  return ['| Short | Long | Description | Required | Default |', '| --- | --- | --- | :---: | --- |', rows].join('\n');
}

function renderArgsList(args) {
  if (!args.length) return 'No positional arguments.\n';
  return args.map((a) => `- \`${formatArg(a)}\``).join('\n');
}

function generatePageForCommand(help, programName, commandPath) {
  const { description, usage, args, options, subcommands } = help;
  const title = commandPath || programName;
  const header = `---\ntitle: ${escapeMdx(title)}\n---`;
  const parts = [header];
  if (description) parts.push('', description);
  if (usage) parts.push('', '### Usage', '', `\`${usage}\``);
  if (args && args.length) parts.push('', '### Arguments', '', renderArgsList(args));
  parts.push('', '### Options', '', renderOptionsTable(options || []));
  if (subcommands && subcommands.length) {
    parts.push('', '### Subcommands', '');
    for (const sc of subcommands) {
      parts.push(`- \`${programName} ${sc.name}\` — ${escapeMdx(sc.description ?? '')}`);
    }
  }
  const body = parts.join('\n').trim() + '\n';
  const { relDir, filename } = makeCommandFilepath(commandPath || programName);
  return { relDir, filename, content: body };
}

function generateIndexPage(rootHelp, programName, pkgVersion, pkgDescription) {
  const title = `${programName} Commands`;
  const header = `---\ntitle: ${escapeMdx(title)}\n---`;
  const intro = rootHelp.description || pkgDescription || '';
  const lines = [header, '', intro, `Version: \`${pkgVersion}\``, '', '### Command List', ''];
  for (const sc of rootHelp.subcommands || []) {
    lines.push(`- \`${programName} ${sc.name}\` — ${escapeMdx(sc.description ?? '')}`);
  }
  lines.push('', '---', '', 'This reference is auto-generated. Do not edit manually.');
  return { relDir: '', filename: 'index.mdx', content: lines.join('\n') + '\n' };
}

function runHelp(args) {
  const res = spawnSync(process.execPath, ['dist/index.js', ...args, '--help'], { encoding: 'utf8' });
  if (res.status !== 0 && res.stdout.trim() === '') {
    throw new Error(`Failed to run help for: ${args.join(' ')}`);
  }
  return res.stdout;
}

function parseHelp(text, programName, commandPath) {
  const lines = text.split(/\r?\n/);
  let description = '';
  let usage = '';
  const options = [];
  const subcommands = [];
  const args = [];

  // Accumulate description between the first blank after Usage and before Options/Commands
  let inOptions = false;
  let inCommands = false;

  // Usage
  const usageIdx = lines.findIndex((l) => l.startsWith('Usage:'));
  if (usageIdx !== -1) {
    const usageLine = lines[usageIdx];
    // Replace program binary name (index) by programName
    const afterColon = usageLine.replace(/^Usage:\s*/, '');
    const replaced = afterColon.replace(/^\S+/, programName);
    usage = `$ ${replaced}`;
  }

  // Description
  for (let i = usageIdx + 1; i < lines.length; i += 1) {
    const l = lines[i];
    if (l.trim() === '') continue;
    if (l.startsWith('Options:') || l.startsWith('Commands:')) break;
    description += (description ? '\n' : '') + l.trim();
  }

  // Parse sections
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i];
    if (l.startsWith('Options:')) { inOptions = true; inCommands = false; continue; }
    if (l.startsWith('Commands:')) { inCommands = true; inOptions = false; continue; }
    if (/^\s*$/.test(l)) continue;

    if (inOptions) {
      // e.g., "  -V, --version   output the version number"
      const m = l.match(/^\s*(-\w)?,?\s*(--[\w-]+)?\s{2,}(.+)$/);
      if (m) {
        const short = m[1] || '';
        const long = m[2] || '';
        const desc = m[3] || '';
        options.push({ short, long, description: desc, required: false });
      }
    } else if (inCommands) {
      // e.g., "  deploy [options]   Deploy intelligent contracts"
      const m = l.match(/^\s*([\w-]+)(?:\s<[^>]+>|\s\[[^\]]+\])*\s{2,}(.+)$/);
      if (m) {
        const cmdToken = m[1];
        const desc = m[2] || '';
        const name = cmdToken.trim();
        if (name !== 'help') {
          subcommands.push({ name, description: desc });
        }
      }
    }
  }

  // Derive args from usage (after commandPath)
  if (usage) {
    const usageCmd = usage.replace(/^`?\$\s+/, '').replace(/`?$/, '');
    const tokens = usageCmd.split(/\s+/);
    // find starting index of commandPath tokens
    const cmdTokens = (commandPath ? `${programName} ${commandPath}` : programName).split(' ');
    const start = tokens.findIndex((t, idx) => tokens.slice(idx, idx + cmdTokens.length).join(' ') === cmdTokens.join(' '));
    const after = start >= 0 ? tokens.slice(start + cmdTokens.length) : [];
    for (const t of after) {
      if (t === '[options]') continue;
      const m = t.match(/^<(.*)>$/) || t.match(/^\[(.*)\]$/);
      if (m) {
        const variadic = m[1].endsWith('...');
        const name = variadic ? m[1].slice(0, -3) : m[1];
        const required = t.startsWith('<');
        args.push({ name, variadic, required });
      }
    }
  }

  return { description, usage, options, subcommands, args };
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writePages(root, pages) {
  for (const page of pages) {
    const dir = path.join(root, page.relDir);
    await ensureDir(dir);
    const fullpath = path.join(dir, page.filename);
    await fs.writeFile(fullpath, page.content, 'utf8');
  }
}

async function rmrf(dir) {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {}
}

async function readPackageInfo() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = path.join(here, '..', 'package.json');
  const raw = await fs.readFile(pkgPath, 'utf8');
  const json = JSON.parse(raw);
  return { version: json.version, description: json.description };
}

async function main() {
  const { version: pkgVersion, description: pkgDescription } = await readPackageInfo();
  const programName = 'genlayer';

  const rootHelpText = runHelp([]);
  const rootHelp = parseHelp(rootHelpText, programName, '');

  const outputDirFromEnv = process.env.DOCS_OUTPUT_DIR;
  const clean = (process.env.DOCS_CLEAN || '').toLowerCase() === 'true';

  const outputs = [];
  // filter out auto 'help' just in case
  rootHelp.subcommands = (rootHelp.subcommands || []).filter((c) => c.name !== 'help');
  outputs.push(generateIndexPage(rootHelp, programName, pkgVersion, pkgDescription));

  // BFS through subcommands by invoking help for each
  const queue = [...(rootHelp.subcommands || [])].map((c) => ({ path: c.name }));
  while (queue.length) {
    const { path: cmdPath } = queue.shift();
    const helpText = runHelp(cmdPath.split(' '));
    const help = parseHelp(helpText, programName, cmdPath);
    outputs.push(generatePageForCommand(help, programName, cmdPath));
    for (const sc of help.subcommands || []) {
      queue.push({ path: `${cmdPath} ${sc.name}` });
    }
  }

  const defaultOut = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'api-references');
  const rootOut = outputDirFromEnv ? outputDirFromEnv : defaultOut;
  if (clean) await rmrf(rootOut);
  await writePages(rootOut, outputs);

  const meta = {};
  for (const c of (rootHelp.subcommands || []).map((c) => toSlug(c.name))) meta[c] = c;
  await fs.writeFile(path.join(rootOut, '_meta.json'), JSON.stringify(meta, null, 2), 'utf8');

  console.log(`Generated ${outputs.length} pages at ${rootOut}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


