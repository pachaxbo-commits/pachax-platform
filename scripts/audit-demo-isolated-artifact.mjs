import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist-demo-isolated')
const textExtensions = new Set(['.html', '.js', '.css', '.json'])
const forbidden = [
  ['Firebase Auth endpoint', /identitytoolkit\.googleapis\.com/i],
  ['Firestore endpoint', /firestore\.googleapis\.com/i],
  ['Firebase Functions endpoint', /cloudfunctions\.net/i],
  ['Firebase Realtime Database endpoint', /firebaseio\.com/i],
  ['production Firebase web config', /(?:apiKey|authDomain|messagingSenderId|appId)\s*[:=]\s*['"][^'"]+/i],
  ['bot credential marker', /pachax-bot-local-2026|VITE_BOT_ADMIN_TOKEN/i],
]

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const paths = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  }))
  return paths.flat()
}

const files = await walk(root)
assert.ok(files.some((path) => relative(root, path).replaceAll('\\', '/') === 'demo-isolated.html'), 'Falta demo-isolated.html en el artefacto.')
const sourcemaps = files.filter((path) => extname(path) === '.map')
assert.deepEqual(sourcemaps, [], `El artefacto no debe publicar sourcemaps: ${sourcemaps.join(', ')}`)

const violations = []
for (const path of files) {
  if (!textExtensions.has(extname(path))) continue
  const content = await readFile(path, 'utf8')
  for (const [label, pattern] of forbidden) if (pattern.test(content)) violations.push(`${label}: ${relative(root, path)}`)
}
assert.deepEqual(violations, [], `El artefacto tiene referencias productivas prohibidas:\n${violations.join('\n')}`)
console.log(JSON.stringify({ artifactFiles: files.length, sourcemaps: sourcemaps.length, forbiddenReferences: violations.length }, null, 2))
