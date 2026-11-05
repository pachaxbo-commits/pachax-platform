const BILLING_GRACE_PERIOD_DAYS = 7;
const BILLING_GRACE_PERIOD_MS = BILLING_GRACE_PERIOD_DAYS * 86_400_000;
const BILLING_TIME_ZONE = 'America/La_Paz';
const MONTHLY_PREPAY_PERIODS = Object.freeze([1, 2, 3, 6, 12]);
const ANNUAL_PREPAY_PERIODS = Object.freeze([1, 2, 3, 5]);

const zonedDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BILLING_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function zonedParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('A valid date is required.');
  const parts = Object.fromEntries(zonedDateFormatter.formatToParts(date).map(part => [part.type, part.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
    millisecond: date.getUTCMilliseconds(),
  };
}

function localPartsToDate(parts) {
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond || 0);
  let utcMillis = localAsUtc;
  // Resolve the offset in the target IANA zone. Iteration also avoids hardcoding
  // Bolivia's current UTC offset into persisted commercial periods.
  for (let index = 0; index < 3; index += 1) {
    const observed = zonedParts(new Date(utcMillis));
    const observedAsUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second, observed.millisecond);
    utcMillis += localAsUtc - observedAsUtc;
  }
  return new Date(utcMillis);
}

function normalizePrepaidPeriods(cycle, value = 1) {
  if (!['monthly', 'annual'].includes(cycle)) throw new TypeError('A monthly or annual billing cycle is required.');
  const periods = Number(value);
  const allowed = cycle === 'monthly' ? MONTHLY_PREPAY_PERIODS : ANNUAL_PREPAY_PERIODS;
  if (!Number.isInteger(periods) || !allowed.includes(periods)) {
    throw new TypeError(`Prepaid ${cycle} periods must be one of: ${allowed.join(', ')}.`);
  }
  return periods;
}

function addBillingPeriods(startValue, cycle, periods = 1, anchorDay = null) {
  const normalizedPeriods = normalizePrepaidPeriods(cycle, periods);
  const start = startValue instanceof Date ? startValue : new Date(startValue);
  const parts = zonedParts(start);
  const originalDay = anchorDay == null ? parts.day : Number(anchorDay);
  if (!Number.isInteger(originalDay) || originalDay < 1 || originalDay > 31) throw new TypeError('Billing anchor day must be from 1 to 31.');
  const monthsToAdd = normalizedPeriods * (cycle === 'annual' ? 12 : 1);
  const monthIndex = parts.year * 12 + (parts.month - 1) + monthsToAdd;
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return localPartsToDate({ ...parts, year, month, day: Math.min(originalDay, lastDay) });
}

function billingAnchorDay(value) {
  return zonedParts(value).day;
}

function renewalPeriodStart(subscription, nowMillis = Date.now()) {
  const endMillis = subscription?.currentPeriodEnd?.toMillis?.()
    ?? (subscription?.currentPeriodEnd instanceof Date ? subscription.currentPeriodEnd.getTime() : NaN);
  const accessUntilMillis = subscription?.billingAccessUntil?.toMillis?.()
    ?? (subscription?.billingAccessUntil instanceof Date ? subscription.billingAccessUntil.getTime() : NaN);
  // An early renewal or payment during grace extends from the paid-through date.
  // Once grace has elapsed, a new full term starts at the regularization time.
  const preservePaidThroughDate = Number.isFinite(endMillis)
    && (endMillis > nowMillis || (Number.isFinite(accessUntilMillis) && nowMillis < accessUntilMillis));
  const startMillis = preservePaidThroughDate ? endMillis : nowMillis;
  const start = new Date(startMillis);
  const storedAnchor = Number(subscription?.billingAnchorDay);
  const anchorDay = preservePaidThroughDate && Number.isInteger(storedAnchor) && storedAnchor >= 1 && storedAnchor <= 31
    ? storedAnchor : billingAnchorDay(start);
  return { start, anchorDay, preservedPaidThroughDate: preservePaidThroughDate };
}

function effectiveBillingStatus(subscription, now = Date.now()) {
  if (['pending', 'suspended', 'cancelled'].includes(subscription?.status)) return subscription.status;
  const end = subscription?.currentPeriodEnd?.toMillis?.()
    ?? (subscription?.currentPeriodEnd instanceof Date ? subscription.currentPeriodEnd.getTime() : NaN);
  const accessUntil = subscription?.billingAccessUntil?.toMillis?.()
    ?? (subscription?.billingAccessUntil instanceof Date ? subscription.billingAccessUntil.getTime() : NaN);
  if (!Number.isFinite(end) || !Number.isFinite(accessUntil) || accessUntil <= now) return 'expired';
  if (end <= now) return 'grace';
  return subscription.status;
}

function daysUntilBillingDate(value, now = Date.now()) {
  if (!value) return null;
  const target = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(target.getTime())) return null;
  const currentParts = zonedParts(new Date(now));
  const targetParts = zonedParts(target);
  const currentDay = Date.UTC(currentParts.year, currentParts.month - 1, currentParts.day);
  const targetDay = Date.UTC(targetParts.year, targetParts.month - 1, targetParts.day);
  return Math.ceil((targetDay - currentDay) / 86_400_000);
}

function billingAccessUntil(periodEndMillis) {
  if (!Number.isFinite(periodEndMillis)) throw new TypeError('A valid billing period end is required.');
  return periodEndMillis + BILLING_GRACE_PERIOD_MS;
}

module.exports = {
  BILLING_GRACE_PERIOD_DAYS, BILLING_GRACE_PERIOD_MS, BILLING_TIME_ZONE,
  MONTHLY_PREPAY_PERIODS, ANNUAL_PREPAY_PERIODS, billingAccessUntil,
  zonedParts, normalizePrepaidPeriods, addBillingPeriods, billingAnchorDay,
  renewalPeriodStart, effectiveBillingStatus, daysUntilBillingDate,
};
