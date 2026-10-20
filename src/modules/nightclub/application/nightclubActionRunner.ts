import type { NightclubModuleId } from '../domain/nightclubAccounts.ts'
import { nightclubCan, normalizeNightclubRole } from '../domain/nightclubAccounts.ts'
import { hasNightclubPermission } from '../domain/nightclubPermissions.ts'

export function createNightclubActionRunner(
  getIsRunning: () => boolean,
  setRunningAction: (running: boolean) => void,
  setNotice: (notice: string) => void
) {
  return async (action: () => Promise<unknown> | unknown, message: string): Promise<boolean> => {
    if (getIsRunning()) return false
    try {
      setRunningAction(true)
      const result = await action()
      if (typeof result === 'string' && result.trim().length > 0) {
        setNotice(result)
      } else {
        setNotice(message)
      }
      return true
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo completar la acción.')
      return false
    } finally {
      setRunningAction(false)
    }
  }
}

export const ALL_NIGHTCLUB_MODULE_IDS: NightclubModuleId[] = [
  'dashboard',
  'floor',
  'pos',
  'accounts',
  'bar',
  'inventory',
  'products',
  'cash',
  'history',
  'customers',
  'promoters',
  'members',
  'users',
  'reports',
  'settings',
]

export function resolveNightclubVisibleModules({
  mode: _mode,
  role,
  demoPermissions,
  permissions,
}: {
  mode?: 'tenant' | 'demo' | 'studio'
  role: string
  demoPermissions?: ReadonlySet<string> | null
  permissions?: ReadonlySet<string> | null
}): NightclubModuleId[] {
  const modules = ALL_NIGHTCLUB_MODULE_IDS
  const normalizedRole = normalizeNightclubRole(role)
  const effective = permissions !== undefined ? permissions : demoPermissions
  return modules.filter(id =>
    effective !== undefined
      ? hasNightclubPermission(effective, id)
      : nightclubCan(normalizedRole, id)
  )
}
