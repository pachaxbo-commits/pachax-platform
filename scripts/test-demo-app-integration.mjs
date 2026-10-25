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
  assert.ok(config.headers.some(({ source, headers }) => source === route && headers.some(({ key, value }) => key === 'Content-Security-Policy' && value.includes("connect-src 'none'"))), `${route} must receive the isolated CSP`)
}
console.log('Main-app demo integration artifact and Vercel route checks passed.')
