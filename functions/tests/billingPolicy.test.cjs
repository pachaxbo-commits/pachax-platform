const assert = require('node:assert/strict');
const {
  addBillingPeriods, billingAnchorDay, daysUntilBillingDate, effectiveBillingStatus,
  billingAccessUntil, normalizePrepaidPeriods, renewalPeriodStart,
} = require('../billingPolicy.cjs');

function dateAtLaPaz(year, month, day, hour = 12, minute = 0) {
  // Bolivia is UTC-04:00; these fixtures name local wall time explicitly.
  return new Date(Date.UTC(year, month - 1, day, hour + 4, minute));
}
function parts(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).reduce((result, item) => { result[item.type] = item.value; return result; }, {});
}

const jan31 = dateAtLaPaz(2024, 1, 31, 12, 35);
assert.deepEqual({ ...parts(addBillingPeriods(jan31, 'monthly', 1, 31)) }, { ...parts(dateAtLaPaz(2024, 2, 29, 12, 35)) });
assert.deepEqual({ ...parts(addBillingPeriods(jan31, 'monthly', 2, 31)) }, { ...parts(dateAtLaPaz(2024, 3, 31, 12, 35)) });
const leapDay = dateAtLaPaz(2024, 2, 29, 9, 15);
assert.deepEqual({ ...parts(addBillingPeriods(leapDay, 'annual', 1, 29)) }, { ...parts(dateAtLaPaz(2025, 2, 28, 9, 15)) });
assert.deepEqual({ ...parts(addBillingPeriods(dateAtLaPaz(2026, 1, 31), 'monthly', 2, 31)) }, { ...parts(dateAtLaPaz(2026, 3, 31)) });
assert.equal(billingAnchorDay(jan31), 31);
assert.equal(normalizePrepaidPeriods('monthly', 12), 12);
assert.equal(normalizePrepaidPeriods('annual', 5), 5);
assert.throws(() => normalizePrepaidPeriods('monthly', 4), /must be one of/);
assert.throws(() => normalizePrepaidPeriods('annual', 12), /must be one of/);
for (const periodCount of [2, 3, 6, 12]) {
  const monthIndex = 2024 * 12 + periodCount;
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  const expected = dateAtLaPaz(year, month, Math.min(31, new Date(Date.UTC(year, month, 0)).getUTCDate()), 12, 35);
  assert.deepEqual(parts(addBillingPeriods(jan31, 'monthly', periodCount, 31)), parts(expected),
    `${periodCount} prepaid months retain the anchored end-of-month date.`);
}

const periodEnd = Date.UTC(2026, 4, 1);
const accessUntil = billingAccessUntil(periodEnd);
assert.equal(effectiveBillingStatus({ status: 'active', currentPeriodEnd: new Date(periodEnd), billingAccessUntil: new Date(accessUntil) }, periodEnd - 1), 'active');
assert.equal(effectiveBillingStatus({ status: 'active', currentPeriodEnd: new Date(periodEnd), billingAccessUntil: new Date(accessUntil) }, periodEnd), 'grace');
assert.equal(effectiveBillingStatus({ status: 'overdue', currentPeriodEnd: new Date(periodEnd), billingAccessUntil: new Date(accessUntil) }, accessUntil - 1), 'grace');
assert.equal(effectiveBillingStatus({ status: 'active', currentPeriodEnd: new Date(periodEnd), billingAccessUntil: new Date(accessUntil) }, accessUntil), 'expired');
assert.equal(effectiveBillingStatus({ status: 'suspended', currentPeriodEnd: new Date(periodEnd), billingAccessUntil: new Date(accessUntil) }, periodEnd - 1), 'suspended');
assert.equal(effectiveBillingStatus({ status: 'active' }, periodEnd - 1), 'expired');
assert.equal(daysUntilBillingDate(dateAtLaPaz(2026, 11, 11), dateAtLaPaz(2026, 11, 4).getTime()), 7);
const endOfGraceEnd = dateAtLaPaz(2026, 11, 11).getTime();
const paidThrough = dateAtLaPaz(2026, 11, 4).getTime();
const prepayStart = renewalPeriodStart({ currentPeriodEnd: new Date(paidThrough), billingAccessUntil: new Date(endOfGraceEnd), billingAnchorDay: 4 }, dateAtLaPaz(2026, 10, 30).getTime());
assert.equal(prepayStart.start.getTime(), paidThrough);
assert.equal(prepayStart.anchorDay, 4);
const graceStart = renewalPeriodStart({ currentPeriodEnd: new Date(paidThrough), billingAccessUntil: new Date(endOfGraceEnd), billingAnchorDay: 4 }, dateAtLaPaz(2026, 11, 8).getTime());
assert.equal(graceStart.start.getTime(), paidThrough, 'Payment during grace extends from the paid-through date.');
const dueDayStart = renewalPeriodStart({ currentPeriodEnd: new Date(paidThrough), billingAccessUntil: new Date(endOfGraceEnd), billingAnchorDay: 4 }, paidThrough);
assert.equal(dueDayStart.start.getTime(), paidThrough, 'Payment exactly on the due instant preserves paid-through time and starts grace.');
const expiredStart = renewalPeriodStart({ currentPeriodEnd: new Date(paidThrough), billingAccessUntil: new Date(endOfGraceEnd), billingAnchorDay: 4 }, dateAtLaPaz(2026, 11, 20).getTime());
assert.equal(expiredStart.start.getTime(), dateAtLaPaz(2026, 11, 20).getTime());
assert.equal(expiredStart.anchorDay, 20, 'After grace, a fresh full term anchors to regularization date.');
const finalGraceInstant = renewalPeriodStart({ currentPeriodEnd: new Date(paidThrough), billingAccessUntil: new Date(endOfGraceEnd), billingAnchorDay: 4 }, endOfGraceEnd);
assert.equal(finalGraceInstant.start.getTime(), endOfGraceEnd, 'At the exact end of grace, the new term begins at regularization rather than discarding time beyond the paid-through date.');

console.log('PASS billing policy: La Paz date arithmetic, prepayment bounds, early/grace/expired renewals and fail-closed missing dates');
