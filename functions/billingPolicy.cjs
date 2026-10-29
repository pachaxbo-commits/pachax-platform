const BILLING_GRACE_PERIOD_DAYS = 7;
const BILLING_GRACE_PERIOD_MS = BILLING_GRACE_PERIOD_DAYS * 86_400_000;

function billingAccessUntil(periodEndMillis) {
  if (!Number.isFinite(periodEndMillis)) throw new TypeError('A valid billing period end is required.');
  return periodEndMillis + BILLING_GRACE_PERIOD_MS;
}

module.exports = { BILLING_GRACE_PERIOD_DAYS, billingAccessUntil };
