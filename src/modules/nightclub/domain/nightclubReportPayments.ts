import type { NightclubAccount, NightclubPayment } from './nightclubAccounts.ts'

export interface NightclubReportPaymentEvent {
  accountId: string
  paidBy: string
  at: string
  kind: 'collection' | 'refund'
  method: string
  amount: number
  cashAmount: number
  qrAmount: number
  cardAmount: number
}

export interface NightclubReportPaymentSummary {
  events: NightclubReportPaymentEvent[]
  accountIds: string[]
  grossCollections: number
  refunds: number
  netCollections: number
  cashCollections: number
  qrCollections: number
  cardCollections: number
  incomplete: boolean
}

const paymentAmount = (payment: NightclubPayment) => payment.amount ?? payment.cashAmount + payment.qrAmount + payment.cardAmount
const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100

/** Groups actual payment/refund events by their own timestamps; account opening never substitutes for payment time. */
export function summarizeNightclubReportPayments(accounts: NightclubAccount[], startInclusive: number, endExclusive: number): NightclubReportPaymentSummary {
  const events: NightclubReportPaymentEvent[] = []
  const accountIds = new Set<string>()
  let incomplete = false
  let grossCollections = 0
  let refunds = 0
  let cashCollections = 0
  let qrCollections = 0
  let cardCollections = 0
  const add = (event: NightclubReportPaymentEvent) => {
    if (Date.parse(event.at) < startInclusive || Date.parse(event.at) >= endExclusive) return
    events.push(event)
    if (event.kind === 'collection') {
      grossCollections += event.amount
      cashCollections += event.cashAmount
      qrCollections += event.qrAmount
      cardCollections += event.cardAmount
      accountIds.add(event.accountId)
    } else refunds += Math.abs(event.amount)
  }

  for (const account of accounts) {
    const payments = account.payments?.length ? account.payments : account.payment ? [account.payment] : []
    for (const payment of payments) {
      // A pending electronic refund is not a completed payment or refund movement.
      if (payment.kind === 'pending_electronic_refund') continue
      const amount = paymentAmount(payment)
      if (!Number.isFinite(amount) || amount < 0) { incomplete = true; continue }
      const components = [payment.cashAmount, payment.qrAmount, payment.cardAmount]
      if (components.some(value => !Number.isFinite(value) || value < 0)) { incomplete = true; continue }

      if (payment.kind === 'exchange_refund') {
        if (!payment.paidAt || !Number.isFinite(Date.parse(payment.paidAt))) { incomplete = true; continue }
        const componentTotal = components.reduce((sum, value) => sum + value, 0)
        const cash = componentTotal ? payment.cashAmount : payment.method === 'cash' ? amount : 0
        const qr = componentTotal ? payment.qrAmount : payment.method === 'qr' ? amount : 0
        const card = componentTotal ? payment.cardAmount : payment.method === 'card' ? amount : 0
        if (!componentTotal && payment.method === 'mixed') incomplete = true
        add({ accountId: account.id, paidBy: payment.paidBy || account.openedBy, at: payment.paidAt, kind: 'refund', method: payment.method, amount: -amount, cashAmount: -cash, qrAmount: -qr, cardAmount: -card })
        continue
      }

      if (!payment.paidAt || !Number.isFinite(Date.parse(payment.paidAt))) { incomplete = true; continue }
      const componentTotal = components.reduce((sum, value) => sum + value, 0)
      const cash = componentTotal ? payment.cashAmount : payment.method === 'cash' ? amount : 0
      const qr = componentTotal ? payment.qrAmount : payment.method === 'qr' ? amount : 0
      const card = componentTotal ? payment.cardAmount : payment.method === 'card' ? amount : 0
      if (!componentTotal && payment.method === 'mixed') incomplete = true
      if (componentTotal && Math.abs(componentTotal - amount) > 0.01) incomplete = true
      add({ accountId: account.id, paidBy: payment.paidBy || account.openedBy, at: payment.paidAt, kind: 'collection', method: payment.method, amount, cashAmount: cash, qrAmount: qr, cardAmount: card })

      if (payment.status === 'refunded' || payment.status === 'partially_refunded') {
        const refundAmount = payment.refundedAmount ?? (payment.status === 'refunded' ? amount : undefined)
        if (!Number.isFinite(refundAmount) || Number(refundAmount) <= 0 || !payment.refundedAt || !Number.isFinite(Date.parse(payment.refundedAt))) {
          incomplete = true
          continue
        }
        add({ accountId: account.id, paidBy: payment.refundedBy || payment.paidBy || account.openedBy, at: payment.refundedAt, kind: 'refund', method: 'refund', amount: -Number(refundAmount), cashAmount: 0, qrAmount: 0, cardAmount: 0 })
      }
    }
  }

  return {
    events,
    accountIds: [...accountIds],
    grossCollections: roundMoney(grossCollections),
    refunds: roundMoney(refunds),
    netCollections: roundMoney(grossCollections - refunds),
    cashCollections: roundMoney(cashCollections),
    qrCollections: roundMoney(qrCollections),
    cardCollections: roundMoney(cardCollections),
    incomplete,
  }
}
