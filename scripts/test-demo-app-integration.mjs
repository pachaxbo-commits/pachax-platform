import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve('dist')
const htmlPath = resolve(root, 'demo-isolated.html')
assert.ok(existsSync(htmlPath), 'Run npm run build first')
assert.ok(existsSync(resolve(root, 'demo-assets')), 'Namespaced isolated demo assets must be in main dist')
assert.ok(existsSync(resolve(root, 'demo-isolation-network-guard.js')), 'Network guard must be deployed with the isolated entrypoint')

const html = readFileSync(htmlPath, 'utf8')
assert.match(html, /connect-src 'none'/, 'isolated page must retain its network-denying CSP')
assert.match(html, /demo-isolation-network-guard\.js/, 'isolated page must load the request guard')
assert.match(html, /\/demo-assets\//, 'isolated page must use its private asset namespace')
assert.doesNotMatch(html, /(?:src|href)="\/assets\//, 'isolated page must not consume main app chunks')

const config = JSON.parse(readFileSync(resolve('vercel.json'), 'utf8'))
const routeRewrites = config.rewrites
const hamburgerIndex = routeRewrites.findIndex(({ source }) => source === '/demo/hamburger')
const retailIndex = routeRewrites.findIndex(({ source }) => source === '/demo/retail')
const catchAllDemoIndex = routeRewrites.findIndex(({ source }) => source === '/demo/(.*)')
assert.ok(hamburgerIndex >= 0 && retailIndex >= 0 && catchAllDemoIndex >= 0, 'expected both isolated rewrites and legacy demo fallback')
assert.ok(hamburgerIndex < catchAllDemoIndex && retailIndex < catchAllDemoIndex, 'isolated paths must precede the generic demo rewrite')
assert.equal(routeRewrites[hamburgerIndex].destination, '/demo-isolated.html')
assert.equal(routeRewrites[retailIndex].destination, '/demo-isolated.html')
for (const route of ['/demo/hamburger', '/demo/retail', '/demo-isolated.html']) {
  const routeHeaders = config.headers.find(({ source }) => source === route)?.headers || []
  const csp = routeHeaders.find(({ key }) => key === 'Content-Security-Policy')?.value || ''
  assert.ok(csp.includes("connect-src 'none'"), `${route} must retain its network-denying CSP`)
  assert.ok(csp.includes("frame-ancestors 'self'"), `${route} may only be embedded by a same-origin landing`)
  assert.ok(!csp.includes("frame-ancestors 'none'"), `${route} must remain embeddable by public tutorials`)
  assert.equal(routeHeaders.find(({ key }) => key === 'X-Frame-Options')?.value, 'SAMEORIGIN', `${route} must block cross-origin framing`)
}
console.log('Main-app demo integration artifact and Vercel route checks passed.')
