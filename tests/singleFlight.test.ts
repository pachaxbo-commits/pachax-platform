import assert from 'node:assert/strict'
import test from 'node:test'
import { createSingleFlight } from '../src/services/singleFlight.ts'

test('overlapping catalogue refreshes share one request and allow a later refresh', async () => {
  let calls = 0
  let release: ((value: string) => void) | undefined
  const refresh = createSingleFlight(() => {
    calls += 1
    return new Promise<string>((resolve) => { release = resolve })
  })

  const first = refresh()
  const second = refresh()
  const third = refresh()
  assert.equal(calls, 1)
  release?.('published snapshot')
  assert.deepEqual(await Promise.all([first, second, third]), [
    'published snapshot', 'published snapshot', 'published snapshot',
  ])

  const later = refresh()
  assert.equal(calls, 2)
  release?.('new revision')
  assert.equal(await later, 'new revision')
})

test('a failed request releases the shared slot for retry', async () => {
  let calls = 0
  const refresh = createSingleFlight(async () => {
    calls += 1
    if (calls === 1) throw new Error('temporary unavailable')
    return 'recovered'
  })

  await assert.rejects(refresh(), /temporary unavailable/)
  assert.equal(await refresh(), 'recovered')
  assert.equal(calls, 2)
})
