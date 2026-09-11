export type PrintingEngineVersion = 'legacy' | 'new'

const STORAGE_KEY = 'pachax_printing_engine_version'

export class PrintMigrationService {
  private static instance: PrintMigrationService

  static getInstance(): PrintMigrationService {
    if (!PrintMigrationService.instance) {
      PrintMigrationService.instance = new PrintMigrationService()
    }
    return PrintMigrationService.instance
  }

  getEngineVersion(): PrintingEngineVersion {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'legacy' || stored === 'new') {
      return stored
    }
    return 'new' // Default to new PrintEngineService
  }

  setEngineVersion(version: PrintingEngineVersion): void {
    localStorage.setItem(STORAGE_KEY, version)
  }

  isNewEngineEnabled(): boolean {
    return this.getEngineVersion() === 'new'
  }
}
