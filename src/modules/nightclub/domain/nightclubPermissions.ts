import type { NightclubModuleId } from './nightclubAccounts.ts'

export type NightclubPermissionAction = 'view' | 'create' | 'edit' | 'delete'

export function hasNightclubPermission(
  permissions: ReadonlySet<string> | null | undefined,
  section: NightclubModuleId,
  action: NightclubPermissionAction = 'view'
): boolean {
  if (permissions === undefined || permissions === null) return true
  return permissions.has(`${section}.${action}`)
}
