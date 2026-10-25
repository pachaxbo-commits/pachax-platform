(() => {
  const attempts = []
  const allowed = (value) => {
    try { return new URL(value, window.location.href).origin === window.location.origin }
    catch { return false }
  }
  const record = (kind, value) => {
    attempts.push({ kind, url: String(value), at: new Date().toISOString() })
    return attempts[attempts.length - 1]
  }
  const cspViolations = []
  const isolation = { attempts, record, allowed, printCalls: 0, cspViolations }
  window.__PACHAX_DEMO_ISOLATION__ = isolation
  document.addEventListener('securitypolicyviolation', (event) => {
    cspViolations.push({ directive: event.violatedDirective, blockedURI: event.blockedURI, sourceFile: event.sourceFile, lineNumber: event.lineNumber, columnNumber: event.columnNumber })
  })

  // Printing belongs to the tenant production experience and cannot be certified by this
  // static synthetic demo. Prevent the browser's native print preview from opening a page
  // context, then release the existing ticket UI through the component's normal afterprint
  // restoration path.
  window.print = () => {
    isolation.printCalls += 1
    window.setTimeout(() => window.dispatchEvent(new Event('afterprint')), 1300)
  }

  const nativeFetch = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const value = typeof input === 'string' || input instanceof URL ? String(input) : input.url
    if (!allowed(value)) {
      record('fetch', value)
      return Promise.reject(new TypeError('External network is disabled in this demo.'))
    }
    return nativeFetch(input, init)
  }

  const nativeOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    if (!allowed(url)) {
      record('xhr', url)
      throw new DOMException('External network is disabled in this demo.', 'SecurityError')
    }
    return nativeOpen.call(this, method, url, ...rest)
  }

  window.open = (url) => {
    record('window.open', url || 'about:blank')
    return null
  }

  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (link && !allowed(link.href)) {
      record('navigation', link.href)
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }, true)

  if (navigator.sendBeacon) {
    navigator.sendBeacon = (url) => {
      if (!allowed(url)) { record('beacon', url); return false }
      return false
    }
  }

  for (const name of ['WebSocket', 'EventSource']) {
    const Native = window[name]
    window[name] = class extends Native {
      constructor(url, ...args) {
        record(name, url)
        throw new DOMException('Persistent external connections are disabled in this demo.', 'SecurityError')
      }
    }
  }
})()
