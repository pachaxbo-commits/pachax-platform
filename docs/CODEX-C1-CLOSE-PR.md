# C1 commercial close and free demo entry correction

Date: 2026-10-27

## Scope and result

This branch is based on the current `origin/main` `a2d821f549200463fc001afbb2a718ed48c8d724` and carries the selected C1 commercial commits plus focused corrections. It does not merge Gemini's or Dario's worktrees. The technical availability of a public demo is independent from commercial provisioning. Production serves an interactive Restaurant salon demo at `/demo/restaurant`; the canonical demo status now reflects that, while the commercial template remains `coming_soon` and its existing provisioning policy remains independently controlled.

The public commercial privacy page remains explicitly marked as a draft. It identifies Fabrizio Alejandro Salamanca Suarez as the natural-person controller, PACHAX as the trade name, Cochabamba, Bolivia, and `pachax.bo@gmail.com`; it does not state that a company is registered or publish a residential street address. The remaining publication decision is whether the stated domicile and legal/privacy wording are sufficient for the applicable Bolivian rules; no legal conclusion is asserted here.

## Focused landing changes

- Hamburger's old `/demo/restaurant?mode=counter` route is replaced by `/demo/hamburger?data=full`.
- The featured catalog makes the Restaurant family open its variant selector; the salon variant is enabled by its verified technical status, while quick service offers the free Hamburger demo.
- Hero and modal availability now read the canonical technical status; a stale static `demoEnabled: false` cannot hide a working public route. Commercial status and provisioning remain separate.
- The modal sends Full/Empty to `freeDemoPath()` when a free demo exists and preserves the ordinary route for a technically available template.
- Resetting the selected variant is achieved by remounting the modal for a new selected item instead of a synchronous state update inside an effect.

## Configuration checks (read-only)

- Vercel project: `pachax-app`, team `team_dSUAcgsFrTlXwYciKdxiig1i`, production domain `pachax-app.vercel.app`. Production environment metadata contains `VITE_FIREBASE_APPCHECK_SITE_KEY`; the app ID/project consistency check passed without printing values. The public site-key value was not disclosed.
- Firebase project/App Check state was checked in the earlier C1 readiness pass. The web Firebase source uses `ReCaptchaEnterpriseProvider`, initialized before Auth/Firestore when configured, and only `publicCommercialGateway` enforces App Check. No global enforcement was enabled.
- Firebase Functions in Production did not include `publicCommercialGateway`; therefore there is no deployed runtime identity for that Function whose effective Secret Manager access can be proved. Source binds `PUBLIC_COMMERCIAL_RATE_LIMIT_SECRET` only to that callable. Production secret value and IAM were not read or changed. A least-privilege IAM verification remains a release gate after the authorized deployment.
- `gcloud` is unavailable in this environment, so effective Secret Manager IAM could not be independently inspected.

## Dependency audit

Current root `npm audit` reported 11 affected package entries: 1 critical, 9 high, 1 moderate. Functions lockfile audit reports zero vulnerabilities after the selected lockfile patches.

- `@capacitor/android` critical advisory is scoped to native Android/WebView behavior, not the Vercel web request form. It remains relevant to a future Android release and was not changed here.
- `@grpc/grpc-js` high advisory appears through the root Firebase/Admin tooling graph; the suggested npm fix is a major Firebase downgrade, so no downgrade was taken. Functions dependencies are clean. The Production web build completed; this does not replace a separate mobile/server dependency remediation.
- `firebase`, `@firebase/firestore`, and `@firebase/firestore-compat` appear in the reported dependency paths. Firebase SDK usage in the SaaS frontend is real, but the exact affected runtime path was not demonstrated as an exploitable commercial-form path. No broad Firebase SDK downgrade was made.
- `@firebase/rules-unit-testing` is test-only; `brace-expansion`, `postcss-selector-parser`, `source-map-js`, `vite`, and `zod` findings are build/test/development dependency paths. These do not execute as application server code in the deployed static frontend. Affected patch lock entries were updated where already available in the candidate; remaining Vite/Zod/PostCSS findings are not evidence of a production form vulnerability.
- No package-manager major upgrades or mass remediation were done. Dependency audit is not clean at root; native Android exposure remains a separate product risk.

## Verification

- Node 22.23.4 Production-environment build for the correct Vercel project: PASS; TypeScript and Vite passed; isolated demo artifact: 79 files, 0 sourcemaps, 0 forbidden references. Existing large-chunk warning remains.
- `npm run build:functions-core`: PASS.
- `npm run build:rules`: PASS.
- `npm run typecheck`: PASS.
- Focal ESLint for modified TypeScript/TSX: PASS after moving modal reset to keyed remount.
- `npm run test:free-demo-routes`: PASS (1/1).
- `npm run test:commercial-catalog-contract`: PASS.
- `firebase/tests/platformSecurity.test.mjs`: PASS, 72/72, using demo project `demo-pachax-c1-close`, isolated Auth/Firestore/Functions ports and an ephemeral emulator-only secret. The initial attempt without the emulator secret failed at the fixture prerequisite; the rerun passed. The ephemeral secret and emulator config were removed.
- `git diff --check`: PASS.
- A separate visual browser click-through of the landing CTA was not completed: the Windows CUA bridge failed to initialize, and this workspace does not have a browser automation package. The helper-route test and production build pass, but they are not a substitute for an actual click test; the protected Preview can be used for that review without submitting the commercial form.

## Preview, integration, and release gates

Pull request: https://github.com/pachaxbo-commits/pachax-platform/pull/2, current remote branch SHA at this checkpoint `63b6b066661134750dfae36a539a0ce6d5ce0e4a` (the focused corrections in this checkpoint are local and have not been pushed).

Vercel Preview for that exact SHA is READY at https://pachax-mqo8ijvzw-pachaxbo-8256s-projects.vercel.app. SSO protection is enabled for deployment URLs. The Preview target inherits production Firebase variables, so it is suitable only for protected visual/navigation checks; do not submit the commercial form, create tenants, or perform writes there. The deployment is READY but no browser click-through was performed because the Windows CUA bridge failed to initialize.

Gemini PR #1 remains a separate, non-overlapping change set except for the generated demo artifact manifest, which is deliberately excluded from this branch. Recommended sequence: review/merge Gemini's finalized PR first if its G5.1 work is approved, refresh this branch against the resulting main, then review this commercial PR. Do not integrate automatically.

Public launch remains NO-GO pending legal approval of the notice/domicile wording and deployment-time verification of the new Function's runtime access to the existing secret. This branch is ready for code review; it is not authorization to deploy Functions, Rules, or Production frontend.

## Cierre de lanzamiento y primer cliente (2026-10-27)

- Rechecked PR #2: remote head `63b6b066661134750dfae36a539a0ce6d5ce0e4a`, base `a2d821f549200463fc001afbb2a718ed48c8d724`; open, mergeable and Vercel status success. The protected preview has not been used for writes. Current Production is `READY` at `a2d821f549200463fc001afbb2a718ed48c8d724`.
- Read-only Chrome against Production rendered the complete public salon demo (`/demo/restaurant?data=full`), including its temporary-session/data-demo labels and operating screen. Local C1 correction marks the canonical technical demo available and makes that canonical status authoritative over the stale static `demoEnabled:false`. It leaves commercial status `coming_soon` and provisioning policy separate. The change is local only; remote PR/Preview still carries the earlier status until separately reviewed and pushed.
- No Gemini landing/tutorial files were changed. Distribution and Nightclub direct demo pages also render interactive demo shells; their public card availability continues to be governed by the canonical demo status and is not automatically changed by this salon-specific correction.
- Scope update: the earlier checkpoint found that `/register` and `/platform/onboarding` could provision tenants. The local closure recorded below now blocks both client entrypoints before account/tenant creation and makes `tenantGateway` deny `completeOnboarding` and `createTenant` outside Firebase Emulators. Existing tenants and login remain unchanged. The callable backend change is not deployed; until authorized release it does not affect Production.
- Privacy notice remains BORRADOR. The owner-provided name, PACHAX trade name, Cochabamba and email are present; no residential address is exposed. D.S. 1793 art. 56(c) requires disclosing the controller's identity and domicile. Civil Code arts. 24 and 29 distinguish a person's domicile (main residence or principal activity) from a special domicile chosen for an act/right. Ask Bolivian counsel whether a documented non-residential service address that is authorized, physically receives correspondence/notices and can be reached is valid as the notice's special correspondence domicile. Do not label it legal domicile without advice or publish the draft meanwhile. References: [BCB, D.S. 1793](https://www.bcb.gob.bo/webdocs/normativa/2013%20-%20DS%201793%20-%20Reglamenta%20la%20Ley%20N%C2%B0%20164.pdf) and [Bolivian Civil Code, arts. 24 and 29 (WIPO Lex)](https://cdn.nestjs.wipolex.wji.prd.web1/wipolex/es/legislation/details/11444).
- Recommended first assisted pilot: Distribution, based on the project's prior closure of its production backend/routing/inventory/cash-close QA. A paid customer is still gated on the owner's UX review for Distribution, approved implementation/monthly/extras pricing, signed service/support terms, clear cancellation/offboarding/data-export handling, and manual tenant configuration. Android is not required if the agreed browser workflows cover the customer's devices; Android/hardware/offline testing remains separate.
- A mandatory owner UX review is now recorded in `CONTEXTO.md`: Restaurant Rápido, Restaurant salon, Distribution, Retail, Nightclub, then global landing/login/register/Admin. Each template needs interactive owner sign-off on PC, tablet and mobile before pilot certification; automation alone cannot pass this gate.

## Cierre temporal de altas públicas (2026-10-27)

- `PUBLIC_TENANT_SELF_SERVICE_CREATION_ENABLED` is false for the public UI. `/register` returns an assisted-contact screen before Auth services are initialized or `createUserWithEmailAndPassword` can run. `OnboardingWizard` exits before its create action; its event handler also has a defensive guard.
- `tenantGateway` checks authentication first, then denies `completeOnboarding` and `createTenant` with `failed-precondition` outside emulators. Firebase Emulator runtime is explicitly allowed for isolated QA. The underlying domain helpers remain unchanged and available for a future Platform-authorized assisted server action; no such action was added.
- Existing user login, tenant membership selection and tenant operations are unchanged. Creating an additional tenant as an existing owner is paused as well. A visitor can still create an Auth-only account through Firebase's direct public Auth API outside the PACHAX UI; disabling provider-level sign-up was not attempted because it can affect existing login. No Auth user is created by the public registration page itself.
- Validation: onboarding emulator suite 23/23; Platform security emulator suite 73/73 (with an ignored, temporary emulator-only dummy secret file that was removed); focused frontend tests 30/30; Functions source build, typecheck, emulator build, focal ESLint and `git diff --check` PASS. Runtime tested on host Node 24.13.0, while Functions declares Node 22. Build has its existing large chunk advisory. The first test attempts surfaced a gate-order issue and generated frontend/server policy coupling; both were corrected before final passing runs.
- Files: `functions/publicTenantCreation.cjs`, `functions/tenantEntrypoints.cjs`, `src/core/publicTemplates.ts`, `src/public/register/PublicRegisterView.tsx`, `src/platform/OnboardingWizard.tsx`, `firebase/tests/platformSecurity.test.mjs`, `tests/adminPlatformSecurity.test.ts`, and `tests/freeDemoRoutes.test.ts`. No Gemini/Dario sources, Rules, Storage, Vercel or Firebase Production changed. PR2 correction and this closure remain local/unpushed; `tenantGateway` deployment is required before server enforcement exists in Production.

### Current publication decision

- **Demos:** GO to remain available; the salon demo CTA discrepancy is corrected locally without touching Gemini-owned source.
- **Commercial form:** NO-GO for real visitors until the notice/domicile is legally approved, Functions and Rules are selectively deployed, and deployment-time runtime identity/secrets/App Check are verified. No deployment or production write occurred.
- **First paid pilot:** Distribution is the strongest candidate, but NO-GO until the specific contract/pricing/support/data-exit approvals and the owner UX review above. No onboarding, paid plan, payment, tenant or entitlement was activated by this work.

### Focused verification and remaining caveats

- With Node `24.13.0` on this workstation: `npm run test:free-demo-routes` PASS (1/1); `node --experimental-strip-types --test tests/adminPlatformSecurity.test.ts` PASS (29/29); `npm run typecheck` PASS; `npm run build:emulator` PASS; focal ESLint on the changed TypeScript files PASS; `git diff --check` PASS. Emulator build keeps its existing large-chunk advisory. No backend/Rules source changed, so their build suites were not repeated here.
- Read-only Chrome confirmed the deployed salon and Nightclub demos render interactive demonstration UI. This run did not automate the landing carousel click itself; the button/modal decision is covered by the focused shared-gate test. Do not claim an end-to-end click certification from that unit test.
- This correction and documentation are local/unpushed. PR #2's remote SHA and protected Preview still point at `63b6b066661134750dfae36a539a0ce6d5ce0e4a`; no one should review Preview as containing the new salon CTA until a later authorized push.
- Product readiness is deliberately separated from demo readiness. The lead form does not provision a tenant. Existing `/register` does call `completeOnboarding` for templates currently marked provisionable; owner must decide whether that separate pre-existing public self-service route is allowed before describing the whole site as assisted-only.
