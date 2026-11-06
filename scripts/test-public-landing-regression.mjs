import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { join } from 'node:path'

const root = process.cwd()
const viteEntry = join(root, 'node_modules/vite/bin/vite.js')
const testEntry = join(root, 'scripts/test-public-landing-browser.mjs')
const portProbe = createServer()
await new Promise((resolve, reject) => portProbe.listen(0, '127.0.0.1', resolve).once('error', reject))
const port = portProbe.address().port
await new Promise(resolve => portProbe.close(resolve))
const baseUrl = `http://127.0.0.1:${port}/`

const vite = spawn(process.execPath, [viteEntry, '--mode', 'emulator', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root,
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
})
let viteOutput = ''
vite.stdout.on('data', chunk => { viteOutput += chunk.toString() })
vite.stderr.on('data', chunk => { viteOutput += chunk.toString() })
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

try {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (vite.exitCode !== null) throw new Error(`Vite exited before startup.\n${viteOutput}`)
    try { ready = (await fetch(baseUrl)).status === 200 } catch { /* Vite is starting. */ }
    if (ready) break
    await wait(150)
  }
  assert.equal(ready, true, `Local emulator-mode Vite did not start.\n${viteOutput}`)

  for (const scenario of ['empty', 'synthetic']) {
    console.log(`\nLanding browser regression · ${scenario} catalog`)
    const result = await new Promise((resolve, reject) => {
      const test = spawn(process.execPath, [testEntry], {
        cwd: root,
        env: {
          ...process.env,
          LANDING_TEST_URL: baseUrl,
          LANDING_TEST_CATALOG_SCENARIO: scenario,
          LANDING_TEST_FUNCTIONS_PORT: '5101',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let output = ''
      test.stdout.on('data', chunk => { const value = chunk.toString(); output += value; process.stdout.write(value) })
      test.stderr.on('data', chunk => { const value = chunk.toString(); output += value; process.stderr.write(value) })
      test.on('error', reject)
      test.on('close', code => code === 0 ? resolve(output) : reject(new Error(`${scenario} catalog regression exited ${code}.`)))
    })
    assert(result.includes('Landing browser regression passed'), `${scenario} landing run did not report completion`)
  }
} finally {
  vite.kill()
  await new Promise(resolve => vite.once('close', resolve))
}
