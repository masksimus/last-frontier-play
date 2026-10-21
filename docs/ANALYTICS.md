# Engineering and product analytics

## Automated, verifiable reporting

The workflow `.github/workflows/engineering-analytics.yml` runs three times per week (Mon/Wed/Fri at 06:23 UTC), manually, and when its implementation changes in a pull request. It uses the temporary read-only GITHUB_TOKEN, GitHub REST API and Node.js 22. It makes no model/API purchases and does not deploy the app.

Outputs in GitHub Actions **Artifacts → engineering-analytics**:
- `latest.md` — human-readable 30-day snapshot and evidence-based engineering recommendations.
- `latest.json` — numeric metrics and data-completeness warnings.
- Step Summary — at-a-glance report shown in GitHub Actions.

Tracked: CI completion/success/failure, build durations, pull requests, issues and commits. Data are time-bounded (UTC) and the per-endpoint sample limit is indicated in the report. GitHub token permissions allow **read only**. This workflow does not auto-merge, publish, or write to main.

## Business, audience and player analytics — separate data sources

These metrics are NOT available from GitHub alone:

| Area | Key metrics | Required source |
|---|---|---|
| Game | DAU/WAU/MAU, retention D1/D7/D30, session time, FPS, crashes, level failures | Consented/minimized in-game instrumentation, crash/performance diagnostics |
| Monetization | Revenue, ARPDAU, ARPPU, ad fill/eCPM, payer conversion | Verified platform payments/ad dashboards |
| Traffic and SEO | Search impressions, CTR, indexed URLs, ranking and acquisition source | Verified webmaster/analytics accounts |
| Site or app funnel | Visit → action → qualified lead, conversion by channel, CAC | First-party events, UTM, attribution and cost data |
| Product quality | Device split, loading latency, errors, game completion | Measured, segmented test runs or privacy-safe telemetry |

Never manufacture numbers, infer monetization from GitHub stars, equate CI PASS with visual quality, or report a conversion rate without an explicitly defined denominator. Label estimates, missing periods, small sample sizes, and uncertain attribution.

## Analytics workflow for future tasks

1. Define the business/product question and metric formula; identify its real data source, timezone, cohort, interval and exclusions.
2. Obtain only authorized data using suitable read permissions. Avoid secret collection, identifying data or tracking users without appropriate notice and consent/legal basis.
3. Verify completeness, deduplicate events, and flag missing/late data or rate-limit/sample caps.
4. Compare a baseline against trends and meaningful segments, include denominators and confidence limits when relevant.
5. Recommend the next measurable action; distinguish correlation from causation.
6. For no data, say **NOT MEASURED** and specify the missing integration rather than giving invented KPIs.

For any actual user telemetry or advertising integration, first review data-flow, privacy and platform rules. Do not automatically add external analytics SDKs or transmit player data.
