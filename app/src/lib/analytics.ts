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

export function trackEvent(eventName: string, properties?: Record<string, unknown>): void {
  if (typeof window === "undefined") return
  if (!eventName) return

  const payload = {
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

  void fetch(`${API_BASE}/api/v1/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // ignore analytics failures
  })
}
