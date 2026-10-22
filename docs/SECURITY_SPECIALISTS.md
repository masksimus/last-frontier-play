# Six application and website security specialist roles

Applies to **all authorized user projects**, not just games: Android, websites, VK Mini Apps, web APIs, AI agents, WebGL/GLB pipelines, CRM integrations, SEO sites and data analytics.

These are **six review disciplines that an AI assistant can support**, not six separately running people, an official SOC, a penetration-testing certification, or a promise of continuous surveillance. Apply alongside `docs/PRIVACY_SECURITY_ROLES.md`, `SECURITY.md` and `AGENTS.md` when they exist. This document does not itself turn on logging, monitoring, vulnerability scanners, incidents, automated attacks or external services.

## 1. Application Security Engineer (AppSec)

**Work:** inspect source, dependencies, SDKs, build/signing, secret handling, Android components, WebViews, client/server boundaries, authorization, input validation, data exports, restore flows and release settings. Reference relevant OWASP ASVS / MASVS practices based on platform and actual risk.

**Evidence:** scoped threat list; affected paths, reproducible regression test, fix commit, result of static/dependency/runtime checks, residual risk.

**Gate:** high-risk findings explicitly resolved or clearly marked BLOCKED with an accountable human reviewer; avoid claiming any scan is comprehensive.

## 2. Authorized penetration tester (ethical hacker)

**Work:** define an approved scope, allowed accounts/endpoints/devices, test window, exclusions and stop conditions. Perform only non-destructive, rate-limited tests that are authorized for that system: access control, authentication/session handling, injection, file import, exposed endpoints, business logic, client-side data leakage and basic mobile attack surface.

**Evidence:** target and written authorization/scope, prerequisites, exact minimal reproduction, impact, severity, affected versions, remediation and retest. Redact credentials and user data.

**Restrictions:** NO exploitation of third-party production systems, credential attacks, data exfiltration, denial of service, phishing or broad scanning without explicit scope and authorization. Automated security tests in a self-owned repository are not proof of a full independent pentest.

## 3. SOC analyst (security operations)

**Work:** inventory actual signals (auth failures, release integrity, application errors, CI alerts, admin actions, access anomalies), define event schemas/retention, false-positive handling and meaningful alert thresholds. Review signals from connected, authorized sources only.

**Evidence:** source and timestamp of each event, detection rule, severity, alert channel, escalation ownership and proof that an alert can be produced without disclosing sensitive content.

**Limits:** when the product is purely offline or no log/monitoring pipeline exists, report `NOT MONITORED`. Never invent SOC dashboards, login events, alert history or claim 24/7 human response. Do not silently enable invasive telemetry.

## 4. Incident response specialist

**Work:** follow a runbook: identify, assess severity, contain affected components, preserve evidence (with privacy controls), eradicate confirmed causes, restore from known-good versions, test recovery, notify applicable stakeholders under current obligations after authorized review, and document lessons learned.

**Evidence:** UTC event timeline, impacted versions/assets, scope of compromised data, hypothesis vs confirmed facts, change approvals, restore verification, postmortem and prevention tests.

**Limits:** do not rotate secrets, revoke access, take down production, send user data, notify regulators or make public statements without authorization unless necessary safeguards are already expressly delegated.

## 5. Security architect

**Work:** maintain trust-boundary/data-flow diagrams and specify least privilege, origin isolation, encryption/key management when warranted, safe file import/export, secure update/signing, backend compartmentalization, network controls and incident readiness.

**Evidence:** architecture decisions (ADR), threat scenarios, assumptions, chosen trade-offs, tests that enforce critical invariants and explicit unverified areas.

**Gate:** design reflects the actual deployed topology and user data; no fictitious backend, always-on agent, SOC or server.

## 6. Cybersecurity consultant / independent reviewer

**Work:** audit implemented controls and previous findings against product risk, deployment context, platform requirements and the available tests; prioritize a manageable mitigation backlog with owner/cost/impact.

**Evidence:** audit date, scope, tested assets, method, source/test links, severity, unresolved risk and measurable next action.

**Gate:** an AI self-review is a technical advisory draft, not an independent security certification or regulator attestation.

## Required engineering and release workflow

1. **Scope and authority:** identify repository, app/site/API, environment, owner, data categories, permission to test and exclusions.
2. **Architecture:** inspect manifest, routes, API authorization, WebView bridges, storage, dependencies, CI artifacts, signing, third-party SDKs, and actual deployed configurations.
3. **Threat model and priority:** list assets, entry points, attacker assumptions, trust boundaries, worst credible impacts and abuse cases.
4. **Checks:** run justified source/CI/permission checks and safe tests in isolated environments. Reproduce a bug before claiming a fix.
5. **Fix and repeat:** implement least-privilege protection, add regression coverage, run app/game/site builds, and include runtime smoke evidence when available.
6. **Operational handoff:** map what could be monitored and who receives alerts. If no backend/telemetry exists, label it `NOT MONITORED` rather than enabling user tracking.
7. **Incident readiness:** document containment contacts and rollback/recovery approach; do not perform unauthorized production actions.
8. **Report:** findings with `PASS / FAIL / NOT RUN / NOT MONITORED`, reproduction/commit links, privacy impact, limitations, next executable step.

## Security review record template

For significant tasks create `docs/security-reviews/<product>-<task>.md` containing:

```markdown
# Security review: <product / version>
Scope, target and authorization:
Threat model / affected trust boundary:
AppSec source analysis and checks:
Authorized penetration test scope: NOT RUN unless actually approved/tested
SOC data sources and alerts: NOT MONITORED until verified
Incident response / rollback owner and contact: NOT ASSIGNED until verified
Architecture mitigations and code changes:
Independent reviewer findings: NOT REVIEWED until actually performed
| Security check | PASS / FAIL / NOT RUN | Link or local evidence |
|---|---|---|
| <command/test> | NOT RUN | <reason> |
Open findings and severities:
Actual human sign-off:
Next executable step:
```

**Report accurately:** repository tests can verify assertions about a known source state. They cannot establish the absence of all vulnerabilities, safe real-world behavior, compliance, or full penetration-testing coverage. A green CI does not equal a security certificate.
