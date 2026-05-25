import { create } from 'zustand'

const TOKEN_KEY = 'risu_admin_token'

interface AuthUser {
  id: number
  username: string
}

interface AuthState {
  auth: {
    user: AuthUser | null
    setUser: (user: AuthUser | null) => void
    accessToken: string
    setAccessToken: (accessToken: string) => void
    resetAccessToken: () => void
    reset: () => void
  }
}

export const useAuthStore = create<AuthState>()((set) => {
  const initToken = localStorage.getItem(TOKEN_KEY) || ''
  return {
    auth: {
      user: null,
      setUser: (user) =>
        set((state) => ({ ...state, auth: { ...state.auth, user } })),
      accessToken: initToken,
      setAccessToken: (accessToken) =>
        set((state) => {
          localStorage.setItem(TOKEN_KEY, accessToken)
          return { ...state, auth: { ...state.auth, accessToken } }
        }),
      resetAccessToken: () =>
        set((state) => {
          localStorage.removeItem(TOKEN_KEY)
          return { ...state, auth: { ...state.auth, accessToken: '' } }
        }),
      reset: () =>
        set((state) => {
          localStorage.removeItem(TOKEN_KEY)
          return {
            ...state,
            auth: { ...state.auth, user: null, accessToken: '' },
          }
        }),
    },
  }
})
