export function onboardingErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code).replace(/^functions\//, '')
    : ''

  switch (code) {
    case 'invalid-argument':
      return 'Revisa el nombre de la empresa, el rubro y la paleta seleccionada. Luego intenta nuevamente.'
    case 'failed-precondition':
      return 'Esta cuenta ya tiene una activación pendiente que requiere revisión. Tu cuenta se conservó; contacta a soporte.'
    case 'permission-denied':
      return 'Esta cuenta no está autorizada para crear otra empresa.'
    case 'unauthenticated':
      return 'Tu sesión venció. Inicia sesión con la misma cuenta e intenta nuevamente.'
    case 'already-exists':
      return 'Ya existe una empresa asociada a esta solicitud. Actualiza la página e inicia sesión para continuar.'
    default:
      return 'No pudimos activar la empresa. Tu cuenta se conservó; puedes reintentar con la misma cuenta.'
  }
}
