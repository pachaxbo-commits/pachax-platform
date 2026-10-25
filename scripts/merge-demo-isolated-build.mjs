import { cp, mkdir, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const appOutput = resolve(root, 'dist')
const isolatedOutput = resolve(root, 'dist-demo-isolated')
const htmlSource = resolve(isolatedOutput, 'demo-isolated.html')
const assetSource = resolve(isolatedOutput, 'demo-assets')
const guardTarget = resolve(appOutput, 'demo-isolation-network-guard.js')
const htmlTarget = resolve(appOutput, 'demo-isolated.html')
const assetTarget = resolve(appOutput, 'demo-assets')

await stat(appOutput)
await stat(htmlSource)
await stat(assetSource)
try {
  await stat(assetTarget)
  throw new Error('Refusing to merge isolated demo assets over existing app assets.')
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

const html = await readFile(htmlSource, 'utf8')
if (!html.includes('/demo-assets/')) throw new Error('Isolated demo HTML does not reference its namespaced assets.')
if (html.includes('/assets/')) throw new Error('Isolated demo HTML references the main app asset namespace.')
if (!html.includes('/demo-isolation-network-guard.js')) throw new Error('Isolated demo HTML is missing its network guard.')
await stat(guardTarget)

await mkdir(appOutput, { recursive: true })
await cp(htmlSource, htmlTarget)
await cp(assetSource, assetTarget, { recursive: true, errorOnExist: true, force: false })
console.log('Merged isolated demo entrypoint and namespaced assets into dist/.')
