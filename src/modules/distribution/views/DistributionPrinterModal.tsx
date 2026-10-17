import { PrinterSettingsView } from '../../../components/PrinterSettingsView'
import type { BusinessIdentity, BusinessDocumentContext } from '../../../core/businessIdentity'

export interface DistributionPrinterModalProps {
  tenantId: string
  branchId?: string
  companyName?: string
  businessIdentity?: BusinessIdentity
  documentContext?: BusinessDocumentContext
  onClose: () => void
}

/**
 * Wrapper de compatibilidad hacia el motor canónico PrinterSettingsView.
 * Centraliza la configuración de impresión universal en PACHAX Core.
 */
export function DistributionPrinterModal({
  tenantId,
  branchId = 'main',
  companyName,
  businessIdentity,
  documentContext,
  onClose,
}: DistributionPrinterModalProps) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-50">
      <PrinterSettingsView
        tenantId={tenantId}
        branchId={branchId}
        companyName={companyName}
        businessIdentity={businessIdentity}
        documentContext={documentContext}
        onClose={onClose}
        onBack={onClose}
      />
    </div>
  )
}
