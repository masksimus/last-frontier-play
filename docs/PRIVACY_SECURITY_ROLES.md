# Privacy, information security and digital-law roles

This is a **mandatory cross-product design/release review process** for websites, Android apps, VK Mini Apps, HTML5/WebGL games, analytics/advertising funnels and AI services. It supplements `AGENTS.md`, `SECURITY.md` where present, and any design or QA instructions.

**Roles describe capabilities and deliverables, not appointments or professional accreditation.** An AI agent may prepare an assessment, draft a policy, audit code and suggest fixes; it is **not** an appointed DPO, a licensed/retained attorney, an authorized security officer or a regulator. Binding legal opinions, regulator submissions and formal designation must be reviewed/authorized by the real operator and qualified humans as required.

## 1. Information security specialist (ИБ)

Responsibilities:
- Maintain threat models: assets, trust boundaries, attackers, abuse scenarios, likelihood/impact and evidence-backed residual risks.
- Review authentication, authorization, API secrets, permissions, dependencies, input validation, update/signing pipeline, backups, logs and infrastructure exposure.
- For web/mobile apps, check session handling, secure transport, data-at-rest protection, WebView/JS bridges, Android exported components, least privilege and third-party SDKs.
- Use static checks, dependency scanning and runtime tests when tooling allows, and document vulnerabilities and fixes.

Deliverables: `threat-model.md` or scoped risk register, reproducible findings, issue severity, mitigations with changed file paths, test evidence and unresolved risks.

Release gate: no known critical issue accepted silently; unresolved issues explicitly recorded with an approved mitigation/exception.

## 2. Digital-law specialist / legal drafter

Responsibilities:
- Identify applicable jurisdictions, platform rules and legal obligations *for the actual product/data flow*. For products aimed at Russia, review the current law on personal data (Federal Law 152-FZ), related requirements, Roskomnadzor processes and actual Play/RuStore/VK/Yandex publishing policies as applicable.
- Draft tailored privacy policy, user terms, consent language, cookie/SDK notice, processor arrangements and user request procedures where relevant.
- Check truthfulness of product claims, intellectual-property provenance/asset licenses, marketing practices and monetization/disclosure terms.
- Avoid copied boilerplate or claiming that an unreviewed template makes a product legally compliant.

Deliverables: draft documents with version/date, identified data controllers/operators, actual purposes and recipients, legal-review checklist, unresolved questions and references to official legal/platform materials.

Release gate: responsible human verifies company/operator identity, contact details, actual data flows and required disclosures before legal text goes live.

## 3. DPO / privacy coordinator (functional role)

Responsibilities:
- Create a personal-data register listing collected fields, subjects, purpose, justification, collection channel, retention/deletion, access, storage region, recipients and international transfers if any.
- Assess data minimization, third-party processors and data-subject request handling; coordinate privacy impact/threat reviews, incident-response contacts and obligations to notify regulators where applicable.
- For services serving Russian users, assess the operator's Roskomnadzor notification situation, localization and transfer restrictions *from current verified rules*. Do not assume a legal exemption without checking it.
- Treat children's, biometric, health, financial and other high-impact data as escalated review areas, with lawful-basis and additional safeguards evaluated as needed.

Deliverables: living data map, records of decisions, request/incident procedures, retention matrix and named **real** accountable contact (if designated). Never list the model or a fictitious person as the DPO.

Release gate: actual collection, transfer, consent, retention and user-contact behavior must match the published policy.

## 4. Software engineers / privacy-by-design developers

Responsibilities:
- Implement technical safeguards, clear data boundaries and secure defaults before adding collection, analytics, remote APIs, advertising or login.
- Prefer on-device storage and the minimum necessary permissions for features that can run offline; verify network traffic empirically and avoid unsupported claims about zero collection.
- Provide access/export, correction or deletion flows where required; implement storage lifecycle, data protection, robust error handling and appropriate accessibility.
- Add automated tests: permission manifest and package checks, static secret scanning, endpoint inventories, known dependency risks, sanitizer/input tests, app installation/launch where available.
- Check that analytics and crash-reporting SDKs are not introduced without documented purpose and actual configuration review.

Deliverables: code, tests, threat mitigations, architecture/data-flow diagrams, CI evidence and testable privacy-facing UI, not just a written policy.

Release gate: run appropriate tests with exact PASS/FAIL/NOT RUN and reproduce any high-risk defect before marking it fixed.

## 5. Business analyst / product manager

Responsibilities:
- Define why each data field is needed, who benefits, the specific product outcome and the privacy/security cost.
- For every proposed analytics event, specify event name, schema, purpose, source, aggregation, retention, attribution and whether identifying data are genuinely necessary.
- Prioritize benefits against user trust, storage/hosting cost, complexity, regulator exposure and future maintenance.
- Keep product requirements and published behavior aligned; never invent user counts, conversion metrics or legal bases to justify more data collection.

Deliverables: data-minimization decisions, metric definitions, feature requirements, consent/opt-out flows where needed and a prioritized backlog.

Release gate: remove unneeded collection, have a credible measurement plan and record unverified assumptions.

## Required per-product privacy and security workflow

1. **Scope:** identify product, versions, country/regions, host/app store, owners, target ages and real integrations.
2. **Map data:** inspect source and configuration, SDKs, backend, telemetry, browser storage/cookies, server logs and external services. Note even IP/online identifiers may matter depending on the context.
3. **Assess:** create a data inventory, third-party/transfer list, security risk register and privacy impact notes. A purely local app still needs a review of backups, exports, cloud sharing and device-level privacy.
4. **Draft:** write the appropriate privacy policy and other legal/UI notices from evidence. Do not add a generic website notice to a mobile game without checking actual behavior.
5. **Implement:** use minimum permissions, access controls, secure defaults, retention/deletion and user-request mechanisms where applicable.
6. **Verify:** run code/dependency/permission checks, observe live network and data flow when possible, test interaction and compare policy against behavior.
7. **Approve & release:** record human owner/legal review, unresolved risks and applicable jurisdiction checks; never send regulatory notifications, change legal terms in production or start collecting personal data without authorization.

## Reusable review record

Use `docs/privacy-reviews/<project-or-issue>.md` when reviewing a specific app/site. Include:

```markdown
# Privacy / Security Review — <product and version>
Status: PLANNED | IN_PROGRESS | BLOCKED | VERIFIED
Scope & jurisdictions:
Actual responsible owner / operator: UNKNOWN until verified
Data fields collected:
Collection purpose and source:
Local storage, servers, SDKs, vendors and cross-border flows:
Retention/deletion / backup / export:
Lawful-basis questions / notice / consent UX (if applicable):
Authentication, permissions and threat model:
Security findings, severity, actual mitigations:
Applicable Russian/EU/platform rules to verify with sources:
Draft documents produced (paths):
| Check & command | PASS / FAIL / NOT RUN | Evidence |
|---|---|---|
| <measured test> | NOT RUN | <reason> |
Human legal/privacy approval: NOT OBTAINED until real approval
Open risks:
Next executable step:
```

## Important guardrails

- **Do not make up** organization names, legal addresses, registration numbers, DPO contacts, retention periods, cloud providers, data processors, consent records or certified compliance.
- “No accounts” does **not** necessarily mean “no personal-data processing”; examine identifiers, analytics/advertising SDKs, error reporting, IP/device/network data, stored user content and exports.
- Do not create or submit an RKN/other regulator notice, silently change production policies, subscribe to services or send user records to third parties without explicit authority.
- Before publication, verify latest law/platform rules with authoritative sources, considering the **effective date** and actual processing circumstances. For Russian products, start with the official legal information portal (https://pravo.gov.ru/) and Roskomnadzor materials (https://rkn.gov.ru/).
- Separate verified law and facts from legal interpretation. Use professional legal review for high-risk areas or where binding advice is needed.
- An AI's written assessment is **not evidence of formal certification, legal compliance, a real appointed DPO or a completed penetration test**.
