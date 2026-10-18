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

test('restaurant production module has ZERO runtime imports from src/demo/**', () => {
  const rootDir = join(process.cwd(), 'src', 'modules', 'restaurant')
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

  assert.deepEqual(violatingFiles, [], `Found unauthorized demo imports in restaurant production modules: ${JSON.stringify(violatingFiles, null, 2)}`)
})

test('canonical restaurant components are stateless and free of demo storage or staff mocks', () => {
  const cashSource = readFileSync(join(process.cwd(), 'src/modules/restaurant/components/RestaurantCash.tsx'), 'utf8')
  assert.doesNotMatch(cashSource, /restaurantStorage|RESTAURANT_STAFF|readStaff|localStorage/, 'RestaurantCash must not reference demo storage or staff')

  const usersSource = readFileSync(join(process.cwd(), 'src/modules/restaurant/components/RestaurantUsers.tsx'), 'utf8')
  assert.doesNotMatch(usersSource, /restaurantStorage|RESTAURANT_STAFF|readStaff|localStorage/, 'RestaurantUsers must not reference demo storage or staff')

  const appSource = readFileSync(join(process.cwd(), 'src/modules/restaurant/views/RestaurantApp.tsx'), 'utf8')
  assert.match(appSource, /permission/i, 'RestaurantApp must manage subscriptions with permissions')
})
