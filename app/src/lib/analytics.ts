const API_BASE = import.meta.env.VITE_API_BASE || ""
const VISITOR_ID_KEY = "risu_visitor_id"
const SESSION_ID_KEY = "risu_session_id"
const USER_ID_KEY = "risu_user_id"

function safeGetStorage(kind: "local" | "session", key: string): string | null {
  try {
    const storage = kind === "local" ? window.localStorage : window.sessionStorage
    return storage.getItem(key)
  } catch {
    return null
  }
}

function safeSetStorage(kind: "local" | "session", key: string, value: string): void {
  try {
    const storage = kind === "local" ? window.localStorage : window.sessionStorage
    storage.setItem(key, value)
  } catch {
    // ignore storage errors
  }
}

function getOrCreateVisitorId(): string {
  const existing = safeGetStorage("local", VISITOR_ID_KEY)
  if (existing) return existing
  const next = crypto.randomUUID()
  safeSetStorage("local", VISITOR_ID_KEY, next)
  return next
}

function getOrCreateSessionId(): string {
  const existing = safeGetStorage("session", SESSION_ID_KEY)
  if (existing) return existing
  const next = crypto.randomUUID()
  safeSetStorage("session", SESSION_ID_KEY, next)
  return next
}

function getUserId(): string {
  return safeGetStorage("local", USER_ID_KEY) ?? ""
}

export function setAnalyticsUserId(userId: string | null): void {
  if (typeof window === "undefined") return
  if (!userId) {
    try {
      window.localStorage.removeItem(USER_ID_KEY)
    } catch {
      // ignore storage errors
    }
    return
  }
  safeSetStorage("local", USER_ID_KEY, userId)
}

function detectDeviceType(): "mobile" | "tablet" | "desktop" {
  const ua = navigator.userAgent.toLowerCase()
  if (/ipad|tablet|playbook|silk/.test(ua)) return "tablet"
  if (/mobi|android|iphone|ipod/.test(ua)) return "mobile"
  return "desktop"
}

function detectBrowser(): string {
  const ua = navigator.userAgent
  if (ua.includes("Edg/")) return "edge"
  if (ua.includes("Chrome/")) return "chrome"
  if (ua.includes("Safari/") && !ua.includes("Chrome/")) return "safari"
  if (ua.includes("Firefox/")) return "firefox"
  return "unknown"
}

function detectOS(): string {
  const ua = navigator.userAgent
  if (ua.includes("Windows")) return "windows"
  if (ua.includes("Mac OS X")) return "macos"
  if (ua.includes("Android")) return "android"
  if (ua.includes("iPhone") || ua.includes("iPad")) return "ios"
  if (ua.includes("Linux")) return "linux"
  return "unknown"
}

function buildPayload(eventName: string, properties?: Record<string, unknown>) {
  return {
    event_name: eventName,
    user_id: getUserId(),
    visitor_id: getOrCreateVisitorId(),
    session_id: getOrCreateSessionId(),
    page_path: window.location.pathname,
    page_url: window.location.href,
    referrer: document.referrer || "",
    device_type: detectDeviceType(),
    os: detectOS(),
    browser: detectBrowser(),
    occurred_at: new Date().toISOString(),
    properties: properties ?? {},
  }
}

export function trackEvent(eventName: string, properties?: Record<string, unknown>): void {
  if (typeof window === "undefined") return
  if (!eventName) return

  void fetch(`${API_BASE}/api/v1/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildPayload(eventName, properties)),
    keepalive: true,
  }).catch(() => {})
}

/**
 * Use sendBeacon for reliable delivery during page unload.
 * Falls back to keepalive fetch if sendBeacon is unavailable.
 */
function trackBeacon(eventName: string, properties?: Record<string, unknown>): void {
  if (typeof window === "undefined") return
  if (!eventName) return

  const body = JSON.stringify(buildPayload(eventName, properties))
  const url = `${API_BASE}/api/v1/track`

  if (navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([body], { type: "application/json" }))
  } else {
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {})
  }
}

let sessionTrackingStarted = false

/**
 * Track session duration: fires session_start immediately, then sends
 * session_end with visible duration via sendBeacon when the user leaves.
 * Uses visibilitychange to exclude time spent on other tabs.
 */
export function startSessionTracking(): void {
  if (typeof window === "undefined" || sessionTrackingStarted) return
  sessionTrackingStarted = true

  const loadTime = Date.now()
  let visibleMs = 0
  let lastVisibleAt = loadTime

  trackEvent("session_start", {
    screen_width: screen.width,
    screen_height: screen.height,
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    language: navigator.language,
    color_depth: screen.colorDepth,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      visibleMs += Date.now() - lastVisibleAt
    } else {
      lastVisibleAt = Date.now()
    }
  })

  let ended = false
  const sendEnd = () => {
    if (ended) return
    ended = true
    if (!document.hidden) {
      visibleMs += Date.now() - lastVisibleAt
    }
    trackBeacon("session_end", {
      duration_ms: visibleMs,
      total_duration_ms: Date.now() - loadTime,
    })
  }

  window.addEventListener("beforeunload", sendEnd)
  window.addEventListener("pagehide", sendEnd)
}
