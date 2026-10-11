import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** R1 scope from PRD §5. */
export const R1_IDS = new Set([
  'ACC-3',
  'RL-1', 'RL-2', 'RL-3', 'RL-4', 'RL-5', 'RL-6', 'RL-7',
  'RH-1', 'RH-2', 'RH-11',
  'ST-1', 'ST-2', 'ST-3',
]);

export function parsePrdCatalog(text) {
  const items = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(
      /^\|\s*((?:ACC|HAL|RL|RH|ST|SO|DX|NAV)-\d+)\s*\|\s*([^|]+)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]+)\|/,
    );
    if (match) {
      // Standard 7-column catalog rows (HC, CD, Today, Evidence, Priority)
      items.set(match[1], {
        id: match[1],
        title: match[2].trim(),
        today: match[5].trim(),
        priority: match[7].trim(),
      });
      continue;
    }
    const dx = line.match(/^\|\s*(DX-\d+)\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/);
    if (dx) {
      items.set(dx[1], {
        id: dx[1],
        title: dx[2].trim(),
        today: '',
        priority: dx[4].trim(),
      });
    }
  }
  return items;
}

export function parseFeatureScenarios(featuresDir) {
  const byId = new Map();
  const unknown = [];
  if (!existsSync(featuresDir)) return { byId, unknown };
  for (const name of readdirSync(featuresDir)) {
    if (!name.endsWith('.feature')) continue;
    const text = readFileSync(join(featuresDir, name), 'utf8');
    const lines = text.split(/\r?\n/);
    let pendingTags = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const tagLine = line.match(/^\s*(@.+\S)\s*$/);
      if (tagLine) {
        pendingTags = tagLine[1].trim().split(/\s+/);
        continue;
      }
      const scenario = line.match(/^\s*Scenario(?: Outline)?:\s*(.+)\s*$/);
      if (!scenario) continue;
      const tags = pendingTags;
      pendingTags = [];
      const pending = tags.includes('@pending') || tags.includes('@deferred');
      const ids = [];
      for (const tag of tags) {
        const id = tag.replace(/^@/, '');
        if (/^(?:ACC|HAL|RL|RH|ST|SO|DX|NAV)-\d+$/.test(id)) ids.push(id);
      }
      for (const id of ids) {
        const list = byId.get(id) ?? [];
        list.push({
          id,
          name: scenario[1].trim(),
          pending,
          file: name,
          line: i + 1,
          tags,
        });
        byId.set(id, list);
      }
    }
  }
  return { byId, unknown };
}

export function parseDesignGaps(text) {
  const gaps = [];
  let inSection = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^##\s*8\.\s*Gap/i.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+/.test(line)) break;
    if (!inSection) continue;
    const match = line.match(/^\|\s*(G-\d+)\s*\|\s*([^|]+)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]+)\|/);
    if (!match || match[1] === 'ID') continue;
    const fix = match[5].trim();
    const closed = /Closed in\s+\S+/i.test(fix) || /^Closed\b/i.test(fix);
    const taskRefs = [...fix.matchAll(/\b(\d+\.\d+)\b/g)].map((m) => m[1]);
    gaps.push({
      id: match[1],
      gap: match[2].trim(),
      where: match[3].trim(),
      severity: match[4].trim(),
      fix,
      closed,
      taskRefs,
    });
  }
  return gaps;
}

export function parseDoneTasks(tasksText) {
  const done = new Set();
  for (const line of tasksText.split(/\r?\n/)) {
    if (!/^\|/.test(line)) continue;
    if (!/Uygulandı/i.test(line)) continue;
    for (const match of line.matchAll(/\b(\d+\.\d+)\b/g)) {
      done.add(match[1]);
    }
    // Explicit phrases like "Task 10.2" in done rows
    for (const match of line.matchAll(/Task\s+(\d+\.\d+)/gi)) {
      done.add(match[1]);
    }
  }
  // Also treat numbered headings "### Task X.Y" that appear under completed history
  // only when the Status table says Uygulandı for that id — already covered above.
  return done;
}

export function releaseOf(id) {
  if (R1_IDS.has(id)) return 'R1';
  if (/^RH-(3|4|5|6|7|8|9|10)$/.test(id) || id === 'RL-8' || id === 'RL-10' || id === 'ST-8') return 'R2';
  if (/^ST-[4-7]$/.test(id) || id === 'HAL-4' || id === 'HAL-7') return 'R3';
  if (/^SO-/.test(id) || /^HAL-[568]$/.test(id) || id === 'RL-12') return 'R4';
  return 'later';
}

/**
 * @param {{
 *   catalog: Map<string, { id: string, title: string, today: string, priority: string }>,
 *   scenarios: Map<string, Array<{ pending: boolean, name: string, file: string }>>,
 *   gaps: Array<{ id: string, closed: boolean, taskRefs: string[], fix: string }>,
 *   doneTasks: Set<string>,
 *   mode: 'warn' | 'strict',
 *   r1ReleaseDone?: boolean,
 * }} input
 */
export function evaluateTrace(input) {
  const { catalog, scenarios, gaps, doneTasks, mode } = input;
  const r1ReleaseDone = input.r1ReleaseDone === true;
  const errors = [];
  const warnings = [];
  const rows = [];

  const emit = (id, kind, message) => {
    const release = releaseOf(id);
    const soft = mode === 'warn' && release !== 'R1';
    if (soft) warnings.push({ id, kind, message, release });
    else errors.push({ id, kind, message, release });
  };

  for (const [id, item] of catalog) {
    const scens = scenarios.get(id) ?? [];
    const doneCount = scens.filter((s) => !s.pending).length;
    const pendingCount = scens.filter((s) => s.pending).length;
    const priority = item.priority;
    const skipPriority = /^won't$/i.test(priority) || /^P3$/i.test(priority);
    rows.push({
      id,
      priority,
      today: item.today,
      scenariosDone: doneCount,
      scenariosPending: pendingCount,
      release: releaseOf(id),
    });

    if (!skipPriority && scens.length === 0) {
      emit(id, 'missing-scenario', `${id} (${priority}) has no feature scenario`);
    }

    if (
      R1_IDS.has(id)
      && /^P0$/i.test(priority)
      && scens.length > 0
      && doneCount === 0
      && (mode === 'strict' || r1ReleaseDone)
    ) {
      // Strict mode always enforces R1 P0 green; warn mode only after R1 exit task is done.
      emit(id, 'r1-still-pending', `${id} is P0 in R1 but every scenario is still @pending`);
    }
  }

  for (const [id, scens] of scenarios) {
    if (!catalog.has(id)) {
      for (const scen of scens) {
        errors.push({
          id,
          kind: 'unknown-id',
          message: `scenario "${scen.name}" in ${scen.file} tags ${id}, which is not in the PRD catalog`,
          release: releaseOf(id),
        });
      }
    }
  }

  for (const gap of gaps) {
    if (gap.closed) continue;
    const doneRef = gap.taskRefs.find((ref) => doneTasks.has(ref));
    if (doneRef) {
      // Gap closures are repo-wide; always errors (not softened by warn).
      errors.push({
        id: gap.id,
        kind: 'gap-open-task-done',
        message: `${gap.id} is still open but Fix names done task ${doneRef}`,
        release: 'gap',
      });
    }
  }

  return { rows, errors, warnings };
}

export function renderReport(result, mode) {
  const lines = [
    `# Traceability report`,
    ``,
    `Mode: **${mode}**`,
    ``,
    `| ID | Priority | Release | Today | Scenarios done | Scenarios pending |`,
    `| --- | --- | --- | --- | ---: | ---: |`,
  ];
  for (const row of result.rows.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))) {
    lines.push(
      `| ${row.id} | ${row.priority} | ${row.release} | ${row.today || '—'} | ${row.scenariosDone} | ${row.scenariosPending} |`,
    );
  }
  lines.push('', '## Errors', '');
  if (result.errors.length === 0) lines.push('_None_');
  else for (const err of result.errors) lines.push(`- **${err.kind}** (${err.id}): ${err.message}`);
  lines.push('', '## Warnings', '');
  if (result.warnings.length === 0) lines.push('_None_');
  else for (const warn of result.warnings) lines.push(`- **${warn.kind}** (${warn.id}): ${warn.message}`);
  lines.push('');
  return lines.join('\n');
}

export function runTrace(options = {}) {
  const root = options.root ?? ROOT;
  const mode = options.mode ?? process.env.TRACE_MODE ?? 'strict';
  const prdPath = options.prdPath ?? join(root, 'docs/product/PRD.md');
  const designPath = options.designPath ?? join(root, 'docs/product/DESIGN.md');
  const tasksPath = options.tasksPath ?? join(root, 'CURSOR_TASKS.md');
  const featuresDir = options.featuresDir ?? join(root, 'features');
  const outPath = options.outPath ?? join(root, 'reports/traceability.md');

  const catalog = parsePrdCatalog(readFileSync(prdPath, 'utf8'));
  const { byId: scenarios } = parseFeatureScenarios(featuresDir);
  const gaps = parseDesignGaps(readFileSync(designPath, 'utf8'));
  const doneTasks = parseDoneTasks(readFileSync(tasksPath, 'utf8'));
  // R1 exit is 11.2–11.4 (Status table); 10.3 alone does not finish ST/RL-4.
  const r1ReleaseDone = doneTasks.has('11.4');

  const result = evaluateTrace({
    catalog,
    scenarios,
    gaps,
    doneTasks,
    mode: mode === 'strict' ? 'strict' : 'warn',
    r1ReleaseDone,
  });
  const report = renderReport(result, mode === 'strict' ? 'strict' : 'warn');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, report, 'utf8');
  return { ...result, report, mode: mode === 'strict' ? 'strict' : 'warn', outPath };
}

function main() {
  const result = runTrace();
  for (const warn of result.warnings) {
    console.warn(`[trace:warn] ${warn.kind} ${warn.id}: ${warn.message}`);
  }
  for (const err of result.errors) {
    console.error(`[trace:error] ${err.kind} ${err.id}: ${err.message}`);
  }
  console.log(`[trace] wrote ${result.outPath} (${result.errors.length} errors, ${result.warnings.length} warnings, mode=${result.mode})`);
  if (result.errors.length > 0) process.exit(1);
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) main();
