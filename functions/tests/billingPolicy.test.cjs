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

// Deterministic calendar checks for mid-month anchors, short months (Feb 28/29), and year rollover.
const nov24Anchor = dateAtLaPaz(2026, 11, 24, 15, 0);
assert.equal(billingAnchorDay(nov24Anchor), 24);
const nov24Plus2Months = addBillingPeriods(nov24Anchor, 'monthly', 2, 24);
assert.deepEqual(parts(nov24Plus2Months), parts(dateAtLaPaz(2027, 1, 24, 15, 0)),
  'Mid-month two-month prepayment crosses year boundary to the matching anchor day.');
assert(nov24Plus2Months.getTime() - nov24Anchor.getTime() > 55 * 86_400_000,
  'Two consecutive anchored monthly periods from Nov 24 to Jan 24 span 61 calendar days.');

const feb2026FromJan31 = addBillingPeriods(dateAtLaPaz(2026, 1, 31, 10, 0), 'monthly', 1, 31);
assert.deepEqual(parts(feb2026FromJan31), parts(dateAtLaPaz(2026, 2, 28, 10, 0)),
  'Short non-leap February clamps anchor day 31 to Feb 28.');
assert.deepEqual(parts(addBillingPeriods(feb2026FromJan31, 'monthly', 1, 31)), parts(dateAtLaPaz(2026, 3, 31, 10, 0)),
  'Retained anchor day 31 restores Mar 31 after stepping through February.');

const dec31Anchor = dateAtLaPaz(2026, 12, 31, 18, 0);
assert.deepEqual(parts(addBillingPeriods(dec31Anchor, 'monthly', 1, 31)), parts(dateAtLaPaz(2027, 1, 31, 18, 0)));
assert.deepEqual(parts(addBillingPeriods(dec31Anchor, 'monthly', 2, 31)), parts(dateAtLaPaz(2027, 2, 28, 18, 0)));
assert.deepEqual(parts(addBillingPeriods(dec31Anchor, 'monthly', 3, 31)), parts(dateAtLaPaz(2027, 3, 31, 18, 0)));
assert.deepEqual(parts(addBillingPeriods(dateAtLaPaz(2027, 12, 31, 18, 0), 'monthly', 2, 31)), parts(dateAtLaPaz(2028, 2, 29, 18, 0)));

const nov30Anchor = dateAtLaPaz(2026, 11, 30, 8, 30);
assert.deepEqual(parts(addBillingPeriods(nov30Anchor, 'monthly', 2, 30)), parts(dateAtLaPaz(2027, 1, 30, 8, 30)));
assert.deepEqual(parts(addBillingPeriods(nov30Anchor, 'monthly', 3, 30)), parts(dateAtLaPaz(2027, 2, 28, 8, 30)));
assert.deepEqual(parts(addBillingPeriods(nov30Anchor, 'monthly', 6, 30)), parts(dateAtLaPaz(2027, 5, 30, 8, 30)));
assert.deepEqual(parts(addBillingPeriods(nov30Anchor, 'monthly', 12, 30)), parts(dateAtLaPaz(2027, 11, 30, 8, 30)));

for (const year of [2026, 2027, 2028]) {
  for (let month = 1; month <= 12; month += 1) {
    const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (const day of [1, 14, 15, 24, Math.min(28, maxDay), maxDay]) {
      const start = dateAtLaPaz(year, month, day, 12, 0);
      const endTwoMonths = addBillingPeriods(start, 'monthly', 2, billingAnchorDay(start));
      assert(endTwoMonths.getTime() - start.getTime() >= 59 * 86_400_000,
        `Two anchored monthly periods starting ${year}-${month}-${day} must span at least 59 days.`);
    }
  }
}

console.log('PASS billing policy: La Paz date arithmetic, prepayment bounds, early/grace/expired renewals and fail-closed missing dates');
