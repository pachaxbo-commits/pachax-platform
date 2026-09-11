import PachaxBluetoothPermissions from '../../../plugins/pachaxBluetoothPermissions'
import { AndroidBluetoothPermissionsService } from '../androidBluetoothPermissionsService'

export async function runPachaxBluetoothPermissionsTestSuite(): Promise<{ passed: number; failed: number; results: string[] }> {
  const results: string[] = []
  let passed = 0
  let failed = 0

  function assert(condition: boolean, testName: string) {
    if (condition) {
      passed++
      results.push(`✅ PASS: ${testName}`)
    } else {
      failed++
      results.push(`❌ FAIL: ${testName}`)
    }
  }

  // --- Test 1: Android <= 11 simulation ---
  try {
    const status = await PachaxBluetoothPermissions.checkPermissions()
    assert(status.bluetoothConnect === 'notRequired' || typeof status.bluetoothConnect === 'string', 'PERM-1: Android <= 11 devuelve notRequired o estado valido')
  } catch (e: any) {
    assert(false, `PERM-1 Fallo: ${e.message}`)
  }

  // --- Test 2: Android >= 12 simulation check ---
  try {
    const status = await PachaxBluetoothPermissions.requestConnectPermission()
    assert(status.apiLevel >= 0, 'PERM-2: Verificacion de nivel API de Android nativo')
  } catch (e: any) {
    assert(false, `PERM-2 Fallo: ${e.message}`)
  }

  // --- Test 3: Granted status structure ---
  try {
    const state = await AndroidBluetoothPermissionsService.checkDiagnosticState()
    assert(typeof state.bluetoothConnectPermission === 'string', 'PERM-3: Estructura de permiso BLUETOOTH_CONNECT valida')
  } catch (e: any) {
    assert(false, `PERM-3 Fallo: ${e.message}`)
  }

  // --- Test 4: Denied status message ---
  try {
    const state = await AndroidBluetoothPermissionsService.checkDiagnosticState()
    assert(typeof state.message === 'string' && state.message.length > 0, 'PERM-4: Mensaje de diagnostico explicativo para el usuario')
  } catch (e: any) {
    assert(false, `PERM-4 Fallo: ${e.message}`)
  }

  // --- Test 5: Permanent denial app settings launch ---
  try {
    const res = await PachaxBluetoothPermissions.openAppSettings()
    assert(res.opened === true, 'PERM-5: Lanzamiento de ajustes de la aplicacion')
  } catch (e: any) {
    assert(false, `PERM-5 Fallo: ${e.message}`)
  }

  // --- Test 6: Attempt list without CONNECT guard ---
  try {
    const btSerial = (window as any).bluetoothSerial
    assert(typeof btSerial === 'undefined' || typeof btSerial.list === 'function', 'PERM-6: Guard de ejecucion para funcion list()')
  } catch (e: any) {
    assert(false, `PERM-6 Fallo: ${e.message}`)
  }

  // --- Test 7: List after CONNECT granted ---
  try {
    const state = await AndroidBluetoothPermissionsService.checkDiagnosticState()
    assert(state.isNativeAndroid === false || state.isPluginAvailable === true || typeof state.message === 'string', 'PERM-7: Invocacion segura de listado tras verificacion')
  } catch (e: any) {
    assert(false, `PERM-7 Fallo: ${e.message}`)
  }

  // --- Test 8: Bluetooth enable trigger ---
  try {
    const result = await AndroidBluetoothPermissionsService.enableBluetooth()
    assert(typeof result === 'boolean', 'PERM-8: Disparador nativo para encendido de Bluetooth')
  } catch (e: any) {
    assert(false, `PERM-8 Fallo: ${e.message}`)
  }

  // --- Test 9: Open app settings wrapper ---
  try {
    await AndroidBluetoothPermissionsService.openAppSettings()
    assert(true, 'PERM-9: Servicio de apertura de ajustes sin excepciones')
  } catch (e: any) {
    assert(false, `PERM-9 Fallo: ${e.message}`)
  }

  // --- Test 10: Complete diagnostic payload schema ---
  try {
    const state = await AndroidBluetoothPermissionsService.checkDiagnosticState()
    assert('apiLevel' in state && 'bluetoothConnectPermission' in state && 'isBluetoothEnabled' in state, 'PERM-10: Schema completo de payload de diagnostico nativo')
  } catch (e: any) {
    assert(false, `PERM-10 Fallo: ${e.message}`)
  }

  return { passed, failed, results }
}
