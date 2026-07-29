import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveNativeRequestInput } from './nativeApi'

test('native app routes relative API calls through the production Netlify origin', () => {
  assert.equal(
    resolveNativeRequestInput('/api/customers', true),
    'https://casmara-charo.netlify.app/api/customers',
  )
  assert.equal(
    resolveNativeRequestInput('/.netlify/functions/route-time', true),
    'https://casmara-charo.netlify.app/.netlify/functions/route-time',
  )
})

test('web builds and absolute URLs keep their original request target', () => {
  assert.equal(resolveNativeRequestInput('/api/customers', false), '/api/customers')
  assert.equal(
    resolveNativeRequestInput('https://example.com/data', true),
    'https://example.com/data',
  )
})
