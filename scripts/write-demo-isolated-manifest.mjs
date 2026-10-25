import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'dist-demo-isolated')
const manifestFile = resolve(root, process.argv[2] || 'docs/demo-app-integration-evidence/demo-isolated-artifact-manifest.json')

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return listFiles(path)
    return [path]
  }))
  return nested.flat()
}

const files = (await listFiles(output))
  .sort((left, right) => relative(output, left).localeCompare(relative(output, right)))

if (files.length === 0) throw new Error('El artefacto de demos está vacío.')

const entries = []
let totalBytes = 0
for (const path of files) {
  const [bytes, info] = await Promise.all([readFile(path), stat(path)])
  totalBytes += info.size
  entries.push({
    path: relative(output, path).replaceAll('\\', '/'),
    bytes: info.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  })
}

const manifest = {
  format: 1,
  buildCommand: 'npm run build:demos-only',
  outputDirectory: 'dist-demo-isolated',
  totalFiles: entries.length,
  totalBytes,
  files: entries,
}
await mkdir(dirname(manifestFile), { recursive: true })
await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ manifest: relative(root, manifestFile).replaceAll('\\', '/'), files: entries.length, totalBytes }, null, 2))
