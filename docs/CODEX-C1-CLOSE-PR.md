# C1 commercial close and free demo entry correction

Date: 2026-10-27

## Scope and result

This branch is based on `origin/main` `775867bb633f98420dd70fb74ce4d57f77eb9e8d` and carries the selected C1 commercial commits plus this focused correction. It does not merge Gemini's or Dario's worktrees. The landing keeps the technical availability of free demos separate from commercial provisioning: the salon demo remains unavailable, while the quick-service Hamburger and Retail demos retain their canonical Full/Empty routes.

The public commercial privacy page remains explicitly marked as a draft. It identifies Fabrizio Alejandro Salamanca Suarez as the natural-person controller, PACHAX as the trade name, Cochabamba, Bolivia, and `pachax.bo@gmail.com`; it does not state that a company is registered or publish a residential street address. The remaining publication decision is whether the stated domicile and legal/privacy wording are sufficient for the applicable Bolivian rules; no legal conclusion is asserted here.

## Focused landing changes

- Hamburger's old `/demo/restaurant?mode=counter` route is replaced by `/demo/hamburger?data=full`.
- The featured catalog makes the Restaurant family open its variant selector; its salon variant says “Demo próximamente” and stays disabled, while quick service offers the free Hamburger demo.
- Hero availability no longer treats Restaurant salon as an available demo by exception.
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

Pull request: https://github.com/pachaxbo-commits/pachax-platform/pull/2, branch SHA `413cf8e34480293d78deb728ad2dd240a342a9d6`.

Vercel Preview for that exact SHA is READY at https://pachax-mqo8ijvzw-pachaxbo-8256s-projects.vercel.app. SSO protection is enabled for deployment URLs. The Preview target inherits production Firebase variables, so it is suitable only for protected visual/navigation checks; do not submit the commercial form, create tenants, or perform writes there. The deployment is READY but no browser click-through was performed because the Windows CUA bridge failed to initialize.

Gemini PR #1 remains a separate, non-overlapping change set except for the generated demo artifact manifest, which is deliberately excluded from this branch. Recommended sequence: review/merge Gemini's finalized PR first if its G5.1 work is approved, refresh this branch against the resulting main, then review this commercial PR. Do not integrate automatically.

Public launch remains NO-GO pending legal approval of the notice/domicile wording and deployment-time verification of the new Function's runtime access to the existing secret. This branch is ready for code review; it is not authorization to deploy Functions, Rules, or Production frontend.
