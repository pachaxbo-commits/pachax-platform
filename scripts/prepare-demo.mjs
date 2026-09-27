// Local-only setup using the repository's documented demo account and callable.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { PACHAX_FUNCTIONS_REGION } = require('../functions/regions.cjs')
const authUrl = 'http://127.0.0.1:9195/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-pachax-key'
const signIn = () => fetch(authUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.test', password: 'demo1234', returnSecureToken: true }) })
let response = await signIn()
if (!response.ok) {
  const error = await response.json()
  if (!['EMAIL_NOT_FOUND', 'INVALID_LOGIN_CREDENTIALS'].includes(error.error?.message)) throw new Error('No se pudo autenticar la cuenta demo local.')
  const seed = spawnSync(process.execPath, ['firebase/tests/seedDemoTenant.mjs'], { stdio: 'ignore' })
  if (seed.status !== 0) throw new Error('Falló la carga demo local.')
  response = await signIn()
}
if (!response.ok) throw new Error('No se pudo iniciar sesión demo.')
const { idToken } = await response.json()
const result = await fetch(`http://127.0.0.1:5101/demo-pachax-platform/${PACHAX_FUNCTIONS_REGION}/tenantGateway`, {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${idToken}` },
  body: JSON.stringify({ data: { action: 'createTenant', operationId: 'dario-local-setup-v1', name: 'PACHAX Desarrollo Local', businessType: 'route_distribution', timezone: 'America/La_Paz', currency: 'BOB', currencySymbol: 'Bs' } }),
})
if (!result.ok) throw new Error(`Configuración demo rechazada: HTTP ${result.status}`)
const body = await result.json()
if (body.error) throw new Error('La función rechazó la configuración demo.')
console.log('Empresa local de desarrollo preparada para admin@example.test. Sin escrituras remotas.')
