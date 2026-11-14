import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, MessageCircle, X } from 'lucide-react'
import { useCommercialConfig } from '../../admin/store/commercialConfigStore'
import {
  BUSINESS_TYPE_OPTIONS,
  buildWhatsAppBusinessUrl,
  isValidWhatsAppPhone,
  type WhatsAppBusinessType,
} from './whatsappBusinessContact'

interface WhatsAppBusinessDialogProps {
  isOpen: boolean
  initialBusinessType?: WhatsAppBusinessType | null
  onClose: () => void
}

export function WhatsAppBusinessDialog({
  isOpen,
  initialBusinessType = null,
  onClose,
}: WhatsAppBusinessDialogProps) {
  const { landingContent } = useCommercialConfig()
  const [selectedType, setSelectedType] = useState<WhatsAppBusinessType | null>(initialBusinessType)
  const [otherDescription, setOtherDescription] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const otherInputRef = useRef<HTMLTextAreaElement>(null)

  const officialPhone = landingContent.officialWhatsAppNumber || ''
  const hasValidWhatsApp = isValidWhatsAppPhone(officialPhone)

  useEffect(() => {
    if (!isOpen) return
    previousFocusRef.current = document.activeElement as HTMLElement | null
    document.body.classList.add('pachax-dialog-open')
    const timer = window.setTimeout(() => {
      const target = dialogRef.current?.querySelector<HTMLElement>(
        '[data-wa-option][aria-checked="true"], [data-wa-option], button[aria-label="Cerrar diálogo"]',
      )
      target?.focus()
    }, 0)

    return () => {
      window.clearTimeout(timer)
      document.body.classList.remove('pachax-dialog-open')
      previousFocusRef.current?.focus()
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ]
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSelectOption = (optionId: WhatsAppBusinessType) => {
    setSelectedType(optionId)
    setErrorMessage('')
    if (optionId === 'other') {
      window.setTimeout(() => otherInputRef.current?.focus(), 0)
    }
  }

  const handleContinue = () => {
    if (!selectedType) {
      setErrorMessage('Selecciona el tipo de negocio que mejor describe tu operación.')
      return
    }
    if (selectedType === 'other' && otherDescription.trim().length < 3) {
      setErrorMessage('Describe brevemente tu negocio o el sistema que necesitas.')
      otherInputRef.current?.focus()
      return
    }
    const url = buildWhatsAppBusinessUrl(officialPhone, selectedType, otherDescription)
    if (!url) {
      setErrorMessage('El número oficial de WhatsApp no está configurado en este momento.')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
    onClose()
  }

  return (
    <div
      className="pachax-wa-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pachax-wa-dialog-title"
        aria-describedby="pachax-wa-dialog-desc"
        className="pachax-wa-dialog"
      >
        <div className="pachax-wa-dialog-header">
          <div className="pachax-wa-dialog-badge" aria-hidden="true">
            <MessageCircle />
          </div>
          <div className="pachax-wa-dialog-heading">
            <h2 id="pachax-wa-dialog-title">Contactar a PACHAX</h2>
            <p id="pachax-wa-dialog-desc">
              Cuéntanos qué tipo de negocio tienes y te ayudaremos a encontrar la solución adecuada.
            </p>
          </div>
          <button
            type="button"
            className="pachax-wa-dialog-close"
            onClick={onClose}
            aria-label="Cerrar diálogo"
          >
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="pachax-wa-dialog-body">
          <p id="pachax-wa-question-label" className="pachax-wa-question">
            ¿Qué tipo de negocio tienes?
          </p>

          <div
            className="pachax-wa-options"
            role="radiogroup"
            aria-labelledby="pachax-wa-question-label"
          >
            {BUSINESS_TYPE_OPTIONS.map((option) => {
              const isSelected = selectedType === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  data-wa-option={option.id}
                  className={`pachax-wa-option${isSelected ? ' is-selected' : ''}`}
                  onClick={() => handleSelectOption(option.id)}
                >
                  <span className="pachax-wa-radio-dot" aria-hidden="true">
                    {isSelected && <Check />}
                  </span>
                  <span className="pachax-wa-option-copy">
                    <strong>{option.label}</strong>
                    <small>{option.hint}</small>
                  </span>
                </button>
              )
            })}
          </div>

          {selectedType === 'other' && (
            <div className="pachax-wa-other-wrap">
              <label htmlFor="pachax-wa-other-input">
                Describe brevemente tu negocio o el sistema que necesitas.
              </label>
              <textarea
                ref={otherInputRef}
                id="pachax-wa-other-input"
                rows={3}
                maxLength={280}
                value={otherDescription}
                onChange={(event) => {
                  setOtherDescription(event.target.value)
                  if (errorMessage) setErrorMessage('')
                }}
                placeholder="Ej. Distribuidora de bebidas con 3 rutas y control de envases"
                required
              />
            </div>
          )}

          {errorMessage && (
            <p className="pachax-wa-error" role="alert">
              {errorMessage}
            </p>
          )}

          {!hasValidWhatsApp && (
            <div className="pachax-wa-unavailable" role="status">
              <p>
                El número oficial de WhatsApp no está configurado en este momento. Puedes escribirnos por nuestro canal verificado en Facebook:
              </p>
              <a
                href="https://www.facebook.com/pachaxbo"
                target="_blank"
                rel="noopener noreferrer"
              >
                Pachax - Software & Digital Marketing
                <ArrowUpRight aria-hidden="true" />
              </a>
            </div>
          )}
        </div>

        <div className="pachax-wa-dialog-footer">
          <button type="button" className="pachax-wa-cancel-btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="pachax-wa-submit-btn"
            disabled={!hasValidWhatsApp}
            onClick={handleContinue}
          >
            <MessageCircle aria-hidden="true" />
            <span>Continuar en WhatsApp</span>
          </button>
        </div>
      </div>
    </div>
  )
}
