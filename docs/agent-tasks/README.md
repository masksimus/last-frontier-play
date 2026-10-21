# Continuation ledger for long game-development tasks

Use a dedicated Markdown record at `docs/agent-tasks/<issue-or-short-id>.md` for each substantial ongoing task. This directory is a protocol, **not** a claim that agents are running continuously or that a build has passed. Do not commit secrets or personal data.

## Mandatory task record

Copy this structure into a new task-specific file and fill it from evidence:

```markdown
# Task: <goal>
Status: PLANNED | IN_PROGRESS | BLOCKED | VERIFIED | DONE
Owner: <agent or operator>
Branch: <branch>
Last verified commit: <SHA or NOT VERIFIED>
Updated: <UTC date-time>

## Acceptance criteria
- [ ] <observable behavior, not a vague promise>

## Implemented
- <path, commit, and what changed; use NONE before work begins>

## Verification
| Check / command | PASS / FAIL / NOT RUN | Evidence / output |
|---|---|---|
| <actual command> | NOT RUN | <reason> |

## Blockers
- <actual blocker, or NONE>

## Next executable step
1. <exact file, command or action; include expected outcome>

## Resume context
<key decisions, current assumptions, relevant refs, asset provenance, test limitations>
```

## Agent resume procedure

1. Inspect `AGENTS.md`, the task record, current Git branch/commit, open PR and relevant CI; compare recorded SHA with actual HEAD.
2. Reconcile stale or conflicting task records with source, history and verified test evidence; do not treat a written PASS as valid without linked evidence.
3. Continue from the **next executable step** without redoing finished work or asking again for already supplied requirements.
4. Work in small, reviewable increments. After each coherent milestone, update the task record with exact changed paths, commit, results and the next step.
5. If interrupted or blocked, save a runnable handoff with the precise failure and recovery path. Mark tests not actually run as NOT RUN.
6. Only mark DONE when acceptance criteria have direct evidence and no required release gate is merely assumed. Keep the previous deployed game versions intact.

An ordinary chat session does not run indefinitely between user messages. Automatic continuation needs a separately configured and authorized agent/runner; GitHub Actions alone builds/tests code but does not invent new development work.
