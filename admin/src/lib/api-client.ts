const API_BASE = '/api/v1'

function adminSignInPath(): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  return `${base}sign-in`
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('risu_admin_token')
  const headers: Record<string, string> = {
    ...((options?.headers as Record<string, string>) || {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (!(options?.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })

  if (res.status === 401) {
    localStorage.removeItem('risu_admin_token')
    window.location.href = adminSignInPath()
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

export const auth = {
  login: (username: string, password: string) =>
    api.post<{ token: string; user: { id: number; username: string } }>(
      '/auth/login',
      { username, password }
    ),
  setupStatus: () =>
    api.get<{ needs_setup: boolean }>('/auth/setup/status'),
  setup: (username: string, password: string) =>
    api.post<{ success: boolean; user: { id: number; username: string } }>(
      '/auth/setup',
      { username, password }
    ),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put<{ success: boolean }>('/admin/me/password', {
      current_password: currentPassword,
      new_password: newPassword,
    }),
}

export interface StatsOverview {
  products: {
    total: number
    blocks: number
    items: number
    risers: number
    published: number
    unpublished: number
  }
  categories: {
    total: number
    block_categories: number
    item_categories: number
  }
  presets: {
    total: number
    published: number
    unpublished: number
  }
}

export interface AnalyticsEventItem {
  id: number
  event_name: string
  page_path: string
  page_url: string
  device_type: string
  os: string
  browser: string
  ip: string
  country: string
  region: string
  city: string
  occurred_at: string
}

export interface AnalyticsEventsResponse {
  events: AnalyticsEventItem[]
  total: number
  page: number
  limit: number
}

export const stats = {
  overview: () => api.get<StatsOverview>('/admin/stats'),
}

export interface Product {
  id: number
  sku: string
  sku_name: string
  display_name: string
  desc: string
  type: string
  grid_cols: number
  grid_rows: number
  height: number
  inner_width: number | null
  inner_depth: number | null
  cell_cols: number | null
  cell_rows: number | null
  model_back_hook_depth: number | null
  image_path: string
  model_path: string
  model_rotation_x: number
  model_rotation_y: number
  model_rotation_z: number
  sort_order: number
  is_default: boolean
  is_published: boolean
  created_at: string
  updated_at: string
}

export interface Category {
  id: number
  name: string
  type: string
  sort_order: number
  products: { product_sku: string; sort_order: number }[]
}

export interface Preset {
  id: number
  preset_id: string
  name: string
  description: string
  image: string
  block_sku: string
  is_published: boolean
  items: { product_sku: string; cell_x: number; cell_y: number }[]
}

export interface AnalyticsTrendPoint {
  date: string
  events: number
  visitors: number
  sessions: number
}

export interface AnalyticsNamedCount {
  name: string
  count: number
}

export interface AnalyticsRecentEvent {
  id: number
  event_name: string
  page_path: string
  device_type: string
  city: string
  ip: string
  occurred_at: string
}

export interface AnalyticsGeoHotspot {
  country: string
  region: string
  city: string
  lat: number | null
  lng: number | null
  count: number
}

export interface AnalyticsOverviewResponse {
  days: number
  summary: {
    events: number
    unique_users: number
    unique_visitors: number
    sessions: number
    avg_events_per_session: number
    last_24h_events: number
    last_24h_active_visitors: number
  }
  trend: AnalyticsTrendPoint[]
  top_pages: AnalyticsNamedCount[]
  top_events: AnalyticsNamedCount[]
  devices: AnalyticsNamedCount[]
  geo_hotspots: AnalyticsGeoHotspot[]
  recent_events: AnalyticsRecentEvent[]
}

export interface ReleaseRecord {
  id: number
  release_id: string
  branch: string
  before_sha: string
  after_sha: string
  artifact_path: string
  diff_summary: string
  status: 'deployed' | 'rolled_back' | 'failed' | string
  deployed_at: string
  rolled_back_at?: string | null
  created_at: string
  updated_at: string
}

export interface ReleaseRollbackRecord {
  id: number
  from_release_id: string
  to_release_id: string
  operator: string
  reason: string
  created_at: string
}

export interface PublishPreview {
  files_to_copy: string[]
  files_to_delete: string[]
  generated_at: string
  diff_summary: string
}

export interface PublishSummary {
  files_copied: number
  files_deleted: number
  published_at: string
  files_to_copy?: string[]
  files_to_delete?: string[]
  diff_summary?: string
}

export const products = {
  list: (type?: string) =>
    api.get<Product[]>(`/admin/products${type ? `?type=${type}` : ''}`),
  get: (sku: string) => api.get<Product>(`/admin/products/${sku}`),
  create: (data: Partial<Product>) => api.post<Product>('/admin/products', data),
  update: (sku: string, data: Partial<Product>) =>
    api.put<Product>(`/admin/products/${sku}`, data),
  delete: (sku: string) => api.delete(`/admin/products/${sku}`),
}

export const categories = {
  list: (type?: string) =>
    api.get<Category[]>(`/admin/categories${type ? `?type=${type}` : ''}`),
  get: (id: number) => api.get<Category>(`/admin/categories/${id}`),
  create: (data: Partial<Category>) =>
    api.post<Category>('/admin/categories', data),
  update: (id: number, data: Record<string, unknown>) =>
    api.put<Category>(`/admin/categories/${id}`, data),
  delete: (id: number) => api.delete(`/admin/categories/${id}`),
}

export const presets = {
  list: () => api.get<Preset[]>('/admin/presets'),
  get: (id: number) => api.get<Preset>(`/admin/presets/${id}`),
  create: (data: Partial<Preset>) => api.post<Preset>('/admin/presets', data),
  update: (id: number, data: Partial<Preset>) =>
    api.put<Preset>(`/admin/presets/${id}`, data),
  delete: (id: number) => api.delete(`/admin/presets/${id}`),
}

export const upload = {
  model: (file: File, subdir: string) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('subdir', subdir)
    return api.post<{ path: string; filename: string }>('/admin/upload/model', fd)
  },
  image: (file: File | Blob, filename: string, subdir: string) => {
    const fd = new FormData()
    fd.append('file', file instanceof File ? file : new File([file], filename))
    fd.append('subdir', subdir)
    return api.post<{ path: string; filename: string }>('/admin/upload/image', fd)
  },
}

export const publish = {
  preview: () =>
    api.get<{ success: boolean; preview: PublishPreview }>('/admin/publish/preview'),
  execute: () =>
    api.post<{ success: boolean; summary: PublishSummary; release?: ReleaseRecord | null }>('/admin/publish', {
      confirm: true,
    }),
}

export const release = {
  list: (limit = 50) => api.get<ReleaseRecord[]>(`/admin/releases?limit=${limit}`),
  get: (releaseID: string) =>
    api.get<ReleaseRecord>(`/admin/releases/${encodeURIComponent(releaseID)}`),
  rollback: (payload: {
    from_release_id: string
    to_release_id: string
    operator?: string
    reason?: string
  }) => api.post<ReleaseRollbackRecord>('/admin/releases/rollbacks', payload),
  listRollbacks: (limit = 50) =>
    api.get<ReleaseRollbackRecord[]>(`/admin/releases/rollbacks?limit=${limit}`),
}

export const analytics = {
  overview: (days = 30) =>
    api.get<AnalyticsOverviewResponse>(`/admin/analytics/overview?days=${days}`),
  listEvents: (params: { page?: number; limit?: number; event_name?: string; device_type?: string } = {}) => {
    const q = new URLSearchParams()
    if (params.page) q.set('page', String(params.page))
    if (params.limit) q.set('limit', String(params.limit))
    if (params.event_name) q.set('event_name', params.event_name)
    if (params.device_type) q.set('device_type', params.device_type)
    return api.get<AnalyticsEventsResponse>(`/admin/analytics/events?${q.toString()}`)
  },
}
