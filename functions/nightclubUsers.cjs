const { HttpsError } = require('firebase-functions/v2/https')
const catalog = require('./nightclubPermissions.json')
const valid = new Set([
  ...catalog.sections.flatMap(section => ['view', 'create', 'edit', 'delete'].map(action => section.id + '.' + action)),
  ...catalog.special.map(item => 'special.' + item.id),
])
function normalizeNightclubPermissions(input) {
  if (!Array.isArray(input) || input.length > valid.size || input.some(permission => typeof permission !== 'string' || !valid.has(permission))) throw new HttpsError('invalid-argument', 'Permisos de Nocturna inválidos.')
  const selected = new Set(input)
  for (const section of catalog.sections) {
    if (['create', 'edit', 'delete'].some(action => selected.has(section.id + '.' + action)) && !selected.has(section.id + '.view')) throw new HttpsError('invalid-argument', 'Modificar una sección requiere acceso de lectura.')
  }
  if (selected.has('special.manageUsers') && !selected.has('users.view')) throw new HttpsError('invalid-argument', 'Gestionar usuarios requiere Ver Usuarios.')
  if (selected.has('special.closeCash') && !selected.has('cash.view')) throw new HttpsError('invalid-argument', 'Cerrar caja requiere Ver Caja.')
  return [...selected].sort()
}
module.exports = { normalizeNightclubPermissions }
