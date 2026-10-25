import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const entry = resolve(root, 'src/demo-isolated/main.tsx')
const original = await readFile(entry, 'utf8')
const forbiddenImport = "import 'firebase/firestore'\n"
const npmCli = process.env.npm_execpath
assert.ok(npmCli, 'Ejecuta esta prueba con npm run test:demos-only:guard para usar el npm-cli activo sin shell.')
const build = () => spawnSync(process.execPath, [npmCli, 'run', 'build:demos-only'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env },
})

assert.ok(!original.includes(forbiddenImport), 'El fixture prohibido ya existe en el entrypoint.')
let restored = false
try {
  await writeFile(entry, `${forbiddenImport}${original}`, 'utf8')
  const result = build()
  const output = `${result.stdout || ''}\n${result.stderr || ''}`
  assert.notEqual(result.status, 0, 'El guard dejó compilar un import Firebase prohibido.')
  assert.match(output, /Forbidden production dependency in demo-only build: firebase\/firestore/i, output)
  console.log('PASS: el build rechazó la referencia temporal firebase/firestore.')
} finally {
  await writeFile(entry, original, 'utf8')
  restored = true
}

assert.equal(restored, true, 'No se restauró el entrypoint original.')
const cleanBuild = build()
if (cleanBuild.status !== 0) {
  process.stderr.write(cleanBuild.stdout || '')
  process.stderr.write(cleanBuild.stderr || '')
  process.exit(cleanBuild.status || 1)
}
console.log('PASS: el entrypoint restaurado compila y genera el artefacto limpio.')
