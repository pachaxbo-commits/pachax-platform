import type { Order } from '../../../types'

export interface RestaurantCustomer {
  id: string
  firstName: string
  lastName?: string
  countryCode: string
  phone: string
  normalizedPhone: string
  email?: string
  birthday?: string
  notes?: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export const customerName = (customer: RestaurantCustomer) => [customer.firstName, customer.lastName].filter(Boolean).join(' ')
export const phoneDigits = (value: string) => value.replace(/\D/g, '')

export function legacyCustomersFromOrders(orders: Order[]): RestaurantCustomer[] {
  const unique = new Map<string, RestaurantCustomer>()
  for (const order of orders) {
    const name = order.customerName?.trim()
    if (!name || ['cliente', 'cliente general', 'cliente en mesa'].includes(name.toLocaleLowerCase('es-BO'))) continue
    const normalizedPhone = order.customerPhone && phoneDigits(order.customerPhone).length >= 7 ? normalizeCustomerPhone('591', order.customerPhone) : ''
    const key = normalizedPhone || name.toLocaleLowerCase('es-BO')
    if (unique.has(key)) continue
    const [firstName, ...last] = name.split(/\s+/)
    unique.set(key, { id: order.customerId || `legacy-${order.id}`, firstName, lastName: last.join(' '), countryCode: '591', phone: normalizedPhone.slice(3), normalizedPhone, active: true, createdAt: order.createdAt, updatedAt: order.createdAt })
  }
  return [...unique.values()]
}

export function normalizeCustomerPhone(countryCode: string, phone: string) {
  const country = phoneDigits(countryCode)
  let local = phoneDigits(phone)
  if (local.startsWith('00' + country)) local = local.slice(country.length + 2)
  else if (local.startsWith(country) && local.length > country.length + 6) local = local.slice(country.length)
  return country && local ? country + local : ''
}

export function customerOrders(customer: RestaurantCustomer, orders: Order[]) {
  return orders.filter(order => {
    if (order.status === 'cancelled') return false
    if (order.customerId) return order.customerId === customer.id
    const number = phoneDigits(order.customerPhone || '')
    if (number) return number === customer.normalizedPhone || normalizeCustomerPhone(customer.countryCode, number) === customer.normalizedPhone
    return customer.id.startsWith('legacy-') && !customer.normalizedPhone && order.customerName?.trim().toLocaleLowerCase('es-BO') === customerName(customer).toLocaleLowerCase('es-BO')
  }).sort((a, b) => new Date(b.paidAt || b.createdAt).getTime() - new Date(a.paidAt || a.createdAt).getTime())
}

export function customerSummary(customer: RestaurantCustomer, orders: Order[]) {
  const related = customerOrders(customer, orders)
  const paid = related.filter(order => order.paymentStatus === 'paid')
  return {
    orders: related,
    visits: paid.length,
    lastVisit: paid[0]?.paidAt || paid[0]?.createdAt,
    totalSpent: paid.reduce((total, order) => total + order.total, 0),
  }
}

export function whatsappUrl(customer: RestaurantCustomer, message?: string) {
  if (!customer.normalizedPhone) return ''
  const url = new URL(`https://wa.me/${customer.normalizedPhone}`)
  if (message) url.searchParams.set('text', message)
  return url.toString()
}
