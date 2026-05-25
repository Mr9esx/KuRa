const API_BASE = '/api/v1'

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
    window.location.href = '/sign-in'
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
  execute: () =>
    api.post<{ success: boolean; summary: { files_copied: number; files_deleted: number; published_at: string } }>(
      '/admin/publish'
    ),
}
