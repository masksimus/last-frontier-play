import assert from "node:assert/strict";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";

const WINDOW_DAYS = 30;
const PAGE_SIZE = 100;
const PAGE_LIMIT = 3;

function within(date, since, until) {
  const value = Date.parse(date || "");
  return Number.isFinite(value) && value >= since && value <= until;
}

function pct(a, b) {
  return b ? Number((100 * a / b).toFixed(1)) : null;
}

export function calculateMetrics(data, since, until) {
  const runs = data.runs.filter(x => within(x.created_at, since, until));
  const completed = runs.filter(x => x.status === "completed");
  const successful = completed.filter(x => x.conclusion === "success").length;
  const failed = completed.filter(x => ["failure", "timed_out", "action_required"].includes(x.conclusion)).length;
  const neutral = completed.length - successful - failed;
  const durations = completed
    .map(x => (Date.parse(x.updated_at || "") - Date.parse(x.run_started_at || x.created_at || "")) / 60000)
    .filter(x => Number.isFinite(x) && x >= 0)
    .sort((a, b) => a - b);
  const prs = data.prs;
  const issues = data.issues.filter(x => !x.pull_request);
  const commits = data.commits.filter(x => within(x.commit?.committer?.date || x.commit?.author?.date, since, until));

  return {
    period_start: new Date(since).toISOString(),
    period_end: new Date(until).toISOString(),
    workflow_runs: { observed: runs.length, completed: completed.length, successful, failed, other_completed: neutral,
      pass_rate_percent: pct(successful, successful + failed),
      median_duration_minutes: durations.length ? Number(durations[Math.floor((durations.length - 1) / 2)].toFixed(2)) : null },
    pull_requests: {
      opened: prs.filter(x => within(x.created_at, since, until)).length,
      merged: prs.filter(x => within(x.merged_at, since, until)).length,
      open_observed: prs.filter(x => x.state === "open").length
    },
    issues: {
      opened: issues.filter(x => within(x.created_at, since, until)).length,
      closed: issues.filter(x => within(x.closed_at, since, until)).length,
      open_observed: issues.filter(x => x.state === "open").length
    },
    commits_observed: commits.length,
    caveats: [
      "Aggregates may be incomplete if any API collection reaches the configured page limit.",
      "Workflow success does not prove playable game quality, security, real-device support or release readiness.",
      "No player analytics, sales or revenue data are collected by this workflow."
    ]
  };
}

async function getPage(path, token) {
  const response = await fetch("https://api.github.com" + path, {
    headers: { "Authorization": "Bearer " + token, "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "repository-engineering-analytics" },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 250);
    throw new Error("GitHub API " + response.status + " for " + path.split("?")[0] + ": " + body);
  }
  return response.json();
}

async function collect(repo, resource, key, token) {
  const results = [];
  let truncated = false;
  for (let page = 1; page <= PAGE_LIMIT; page++) {
    const sep = resource.includes("?") ? "&" : "?";
    const response = await getPage("/repos/" + repo + "/" + resource + sep + "per_page=" + PAGE_SIZE + "&page=" + page, token);
    const items = key ? response[key] : response;
    if (!Array.isArray(items)) throw new Error("API collection is not an array: " + resource);
    results.push(...items);
    if (items.length < PAGE_SIZE) break;
    if (page === PAGE_LIMIT) truncated = true;
  }
  return { items: results, truncated };
}

function line(label, value) { return "| " + label + " | " + (value === null ? "н/д" : value) + " |"; }

function renderReport(repo, m, truncated) {
  const c = m.workflow_runs;
  const recommendations = [];
  if (c.successful + c.failed === 0) recommendations.push("Проверить запуск CI: нет завершённых успешных/ошибочных проверок за период.");
  if (c.pass_rate_percent !== null && c.pass_rate_percent < 90) recommendations.push("Разобрать упавшие workflow и наиболее частые причины ошибок.");
  if (m.pull_requests.open_observed > 5) recommendations.push("Проверить очередь открытых Pull Request.");
  if (!recommendations.length) recommendations.push("Поддерживать автоматические проверки и добавить браузерный/мобильный smoke-test, если его ещё нет.");

  return [
    "# Engineering analytics — " + repo,
    "",
    "Период: " + m.period_start.slice(0, 10) + " — " + m.period_end.slice(0, 10) + " (UTC, последние 30 дней).",
    "",
    "| Метрика | Значение |",
    "|---|---:|",
    line("CI: завершённых запусков", c.completed),
    line("CI: успешных", c.successful),
    line("CI: ошибок / тайм-аутов", c.failed),
    line("CI: прочие завершения", c.other_completed),
    line("CI: доля успешных, исключая отменённые/нейтральные", c.pass_rate_percent === null ? null : c.pass_rate_percent + "%"),
    line("CI: медианная продолжительность, мин.", c.median_duration_minutes),
    line("Pull Request открыто за период", m.pull_requests.opened),
    line("Pull Request объединено за период", m.pull_requests.merged),
    line("Открытых PR в полученной выборке", m.pull_requests.open_observed),
    line("Issue создано за период", m.issues.opened),
    line("Issue закрыто за период", m.issues.closed),
    line("Коммитов в полученной выборке", m.commits_observed),
    "",
    "## Следующие действия",
    ...recommendations.map(x => "- " + x),
    "",
    "## Границы данных",
    "- Источник: GitHub REST API этого репозитория. В расчётах нет пользовательской телеметрии.",
    "- Лимит: " + PAGE_SIZE * PAGE_LIMIT + " записей каждого типа; срез по времени указан выше.",
    "- " + (truncated ? "**ВНИМАНИЕ: хотя бы один список достиг предела выборки — показатели могут быть занижены.**" : "Списки не достигли установленного предела; это не независимая проверка полноты внешних данных."),
    ...m.caveats.map(x => "- " + x),
    ""
  ].join("\n");
}

function selfTest() {
  const start = Date.parse("2026-09-20T00:00:00Z");
  const end = Date.parse("2026-10-20T00:00:00Z");
  const m = calculateMetrics({
    runs: [
      { created_at:"2026-10-19T00:00:00Z", status:"completed", conclusion:"success", run_started_at:"2026-10-19T00:00:00Z", updated_at:"2026-10-19T00:04:00Z" },
      { created_at:"2026-10-19T01:00:00Z", status:"completed", conclusion:"failure", run_started_at:"2026-10-19T01:00:00Z", updated_at:"2026-10-19T01:02:00Z" },
      { created_at:"2026-10-19T02:00:00Z", status:"completed", conclusion:"cancelled" }
    ],
    prs:[{created_at:"2026-10-01",state:"closed",merged_at:"2026-10-02"}, {created_at:"2026-10-05",state:"open"}],
    issues:[{created_at:"2026-10-04",state:"open"}, {created_at:"2026-10-06",pull_request:{}}],
    commits:[{commit:{committer:{date:"2026-10-19"}}}]
  },start,end);
  assert.equal(m.workflow_runs.completed,3);
  assert.equal(m.workflow_runs.successful,1);
  assert.equal(m.workflow_runs.failed,1);
  assert.equal(m.workflow_runs.pass_rate_percent,50);
  assert.equal(m.workflow_runs.median_duration_minutes,2);
  assert.equal(m.pull_requests.merged,1);
  assert.equal(m.issues.opened,1);
  assert.equal(m.commits_observed,1);
  assert.match(renderReport("example/repo",m,false),/50%/);
  console.log("PASS: analytics aggregation and report smoke tests");
}

async function main() {
  if (process.argv.includes("--self-test")) { selfTest(); return; }
  const repo = process.env.GITHUB_REPOSITORY || "";
  const token = process.env.GITHUB_TOKEN || "";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !token) {
    throw new Error("GITHUB_REPOSITORY and GITHUB_TOKEN must be provided by GitHub Actions");
  }
  const end = Date.now();
  const start = end - WINDOW_DAYS * 86400000;
  const since = new Date(start).toISOString();
  const resources = [
    ["runs", "actions/runs", "workflow_runs"],
    ["prs", "pulls?state=all&sort=updated&direction=desc", null],
    ["issues", "issues?state=all&sort=updated&direction=desc", null],
    ["commits", "commits?since=" + encodeURIComponent(since), null]
  ];
  const entries = await Promise.all(resources.map(async ([key, endpoint, field]) =>
    [key, await collect(repo, endpoint, field, token)]));
  const data = Object.fromEntries(entries.map(([key, value]) => [key, value.items]));
  const truncated = entries.some(([,value]) => value.truncated);
  const metrics = calculateMetrics(data, start, end);
  const report = renderReport(repo, metrics, truncated);
  const directory = join("reports", "engineering-analytics");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory,"latest.json"), JSON.stringify({ repository:repo, sample_truncated:truncated, ...metrics }, null, 2) + "\n");
  await writeFile(join(directory,"latest.md"), report + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report + "\n");
  console.log(report);
}

main().catch(error => { console.error("Engineering analytics FAILED:", error.message); process.exitCode = 1; });
