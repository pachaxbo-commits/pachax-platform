import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

function collectSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(fullPath))
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(fullPath)
    }
  }
  return files
}

test('nightclub production module has ZERO runtime imports from src/demo/**', () => {
  const rootDir = join(process.cwd(), 'src', 'modules', 'nightclub')
  const files = collectSourceFiles(rootDir)

  const violatingFiles: { file: string; line: string }[] = []

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf8')
    const lines = content.split('\n')
    for (const line of lines) {
      if (/from\s+['"][^'"]*demo\b/i.test(line) || /import\s*\(\s*['"][^'"]*demo\b/i.test(line)) {
        violatingFiles.push({ file: filePath, line: line.trim() })
      }
    }
  }

  assert.deepEqual(violatingFiles, [], `Found unauthorized demo imports in nightclub production modules: ${JSON.stringify(violatingFiles, null, 2)}`)
})

test('production Nightclub uses canonical experience without demo fixtures or local controller', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'modules', 'nightclub', 'views', 'NightclubApp.tsx'), 'utf8')
  assert.doesNotMatch(source, /createNightclubDataset|useNightclubController|localStorage/)
  assert.match(source, /NightclubExperience/)
  assert.match(source, /useTenantNightclubController/)
  assert.match(source, /permission/i, 'NightclubApp must manage subscriptions with permissions')
})
