import { formatQrRecordDate } from '../qrRecordDate.ts'

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

assert(formatQrRecordDate('2026-10-21T18:35:00.000Z').text === '21/10/2026 · 14:35', 'ISO timestamps use Bolivia time')
assert(formatQrRecordDate('2026-10-21T22:05:00.000Z').text === '21/10/2026 · 18:05', 'verification has its own actual timestamp')
assert(formatQrRecordDate('2026-10-21').text === '21/10/2026', 'date-only values do not gain a time')
assert(formatQrRecordDate('2026-10-19T14:30:00').text === '19/10/2026', 'timezone-less historic values show date only')
assert(formatQrRecordDate(undefined, '2026-10-17').text === '17/10/2026', 'legacy dayKey remains readable')
assert(formatQrRecordDate(undefined).precision === 'none', 'missing dates remain explicit')
console.log('qrRecordDate: PASS')
