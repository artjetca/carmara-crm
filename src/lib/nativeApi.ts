import { Capacitor } from '@capacitor/core'

const NATIVE_API_ORIGIN = 'https://casmara-charo.netlify.app'
let nativeApiFetchInstalled = false

export function resolveNativeRequestInput(
  input: RequestInfo | URL,
  isNativePlatform = Capacitor.isNativePlatform(),
): RequestInfo | URL {
  if (!isNativePlatform || typeof input !== 'string' || !input.startsWith('/')) {
    return input
  }

  return `${NATIVE_API_ORIGIN}${input}`
}

export function installNativeApiFetch() {
  if (nativeApiFetchInstalled || !Capacitor.isNativePlatform()) return

  const webFetch = window.fetch.bind(window)
  window.fetch = (input, init) => webFetch(resolveNativeRequestInput(input, true), init)
  nativeApiFetchInstalled = true
}
