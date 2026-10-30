# PACHAX Reports Core V1

## Shared contract

`src/core/reports/reportTypes.ts` defines versioned `BusinessReportV1` output: tenant, branch, business type, inclusive company-local date period, identity/branding, completeness, record count, warnings, and aligned sheets. Partial or unknown results cannot be exported through the canonical digital-report document adapter. `reportPeriod.ts` converts company-local inclusive dates into half-open UTC boundaries (including daylight-saving transitions). PDF and Excel use the shared business identity and document exports; print jobs use `PrintEngineService`'s `cash_report` adapter.

`reports.basic` remains a baseline for backward compatibility. `reports.detailed` and `reports.export` are plan capabilities. Frontend checks only control presentation. `tenantGateway.authorizeReportCapability` separately verifies the authenticated active tenant member, the canonical `reports.read` permission, tenant billing access, and the requested feature before export/print. Existing Rules continue to deny direct client writes; the retail report itself is fetched from a callable, not a newly opened Firestore collection.

## Template coverage and completeness

| Template | V1 coverage | Data limits / pending |
| --- | --- | --- |
| Comercio / Venta Rápida | Server-side date-filtered sales pages (100 rows, stable cursor), payment totals, detailed product rows, identity-branded PDF/XLSX, browser print, and server feature authorization; export is disabled until every page is loaded. | Maximum 10,000 rows per UI load; beyond that the UI blocks final totals/export. The existing `retailSales(branchId ASC, createdAt DESC)` composite index is present; Firestore's implicit document-name tie-breaker supports stable paging. |
| Distribución | Existing report formulas, cost/closure/credit sheets, and data selection remain unchanged; wrappers now use the shared branded PDF/XLSX implementation and identity context. Server authorization is checked before exports. | Distribution's existing operation sync/completeness gates remain in force; physical inventory valuation remains unavailable when reliable historical cost is missing. |
| Restaurante Rápido and Restaurante con salón | The canonical Restaurant experience uses the shared date, identity, PDF/XLSX, browser-print, and server export-authorization contracts for both profiles. Paid sales, payment method and product summaries use the branch orders query; inventory movement details use recorded movements only, with no synthetic ingredient costs. | Orders are currently listened to without a date cursor; inventory movement listener is capped at 100 and shift history at 20. When the raw movement listener reaches 100, the UI hides inventory totals and explains the limitation; export/print is also blocked even if the selected date filter has fewer or zero rows. A paginated date-scoped source is still required for scalable all-history guarantees. |
| Nightclub / Lounge | Existing account, payment, round, cash, and inventory-derived summaries remain, with company timezone date boundaries and shared branded PDF/XLSX export. Export is blocked when existing listener caps (closed accounts 50, rounds/payments 200) are reached; plan export authorization is checked server-side. | Current listeners are capped; threshold detection prevents obvious truncated exports, but paginated server report queries are still required for arbitrary history. No profit/cost is inferred. |
| Encomiendas | Integration seam: implement an adapter to `BusinessReportV1`, identity, period, completeness, and shared exports after Gemini's workstream is ready. | This PR does not edit Gemini files or its demo and does not add Encomiendas as a commercial tenant. |

## Integrity rules

- Reports derive from persisted source documents and do not create or mutate financial/inventory records.
- Sales and payments are not added twice; operational cash balances and sales aggregates remain separate measures.
- Inventory consumption/cost/profit is reported only when the source movements/costs exist and reconcile. Missing cost remains unavailable, not zero or an invented estimate.
- A valid page is not a complete period. Retail marks completion only after the server cursor is exhausted; Nightclub blocks export at known listener limits. Restaurant adapters remain visibly limited until they have server pagination and completeness metadata.
- Company-local date range is inclusive for user input; backend queries use `[startInclusive, endExclusive)` UTC.
- Identity (business name/logo/contact/branch) is supplied from the active tenant context. Logo embedding is restricted to same-origin raster assets; inaccessible/unsupported logos do not break export.

## Verification and release boundary

All automated writes must use isolated Firebase Emulators with demo project IDs. This branch is based on `main` after Documents Core V1. No Production, Staging, Rules, indexes, IAM, billing, Preview, or data changes are part of Reports Core V1. Before later integration, verify query/index requirements and deploy only the changed tenant function contract if needed; do not change Distribution calculations or rules without a demonstrated requirement. Hardware printer certification is outside this block.

## Focused verification on this branch

- Node 22.23.4: `test:reports-core` 4/4; `test:documents-printing-core` 10/10; Restaurant 117/117; Nightclub 97/97; Distribution 59 plus QR date, parity, catalog, and serialization checks: PASS.
- Firebase Emulators: `test:commercial-capabilities` passed capability matrix, legacy compatibility, generic server authorization, active/disabled member and branch checks, and product quota mutation with document capability snapshots. `test:retail-tenant` passed 15 assertions including a 205-sale, 3-page report, no duplicate rows, export feature gating, and unauthorized-branch rejection.
- `typecheck`, `build:functions-core`, `build:emulator`, and `git diff --check`: PASS after fixes. The first isolated demo build correctly rejected the new static gateway dependency; the demo-only Vite config now substitutes a demo-scoped authorization adapter, and the passing artifact guard reports 95 files, zero sourcemaps, zero forbidden references. Production tenant authorization remains in `tenantGateway`.
- Focal ESLint still reports inherited findings in `browserDialogPrinterAdapter.ts` and `NightclubExperience.tsx`; none overlap this branch's added lines. New `src/core/reports` modules, report UI changes, and report tests have no ESLint findings. No project-wide lint rule was suppressed.
- The existing `retailSales` composite index is sufficient; this branch does not modify Firestore indexes or Rules. Encomiendas/Gemini files were not edited. No Preview was generated from this branch. Read-only Vercel inspection found READY deployments for other branches, so Preview disablement could not be presumed. A request to set `previewDeploymentsDisabled=true` returned without exposing the persisted flag; do not push/open this PR until that setting is verifiably disabled or Preview Firebase isolation is complete.
- Remaining scope limits: restaurant inventory history still comes from its 100-row listener and blocks export at the cap; Nightclub blocks at known listener caps; Distribution formulas and reconciliation remain unchanged. No authenticated visual Preview or physical printer hardware certification was performed. `platformGateway`, `tenantGateway`, and `processTenantOperation` must be reviewed together for release because `commercialCapabilities.cjs` now accepts and preserves detailed/export report capability snapshots; no Functions were deployed in this block.
