import { createFileRoute, redirect } from '@tanstack/react-router'
import { auth } from '@/lib/api-client'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    const { needs_setup } = await auth.setupStatus()
    if (needs_setup) {
      throw redirect({ to: '/setup' })
    }

    const token = localStorage.getItem('risu_admin_token')
    if (!token) {
      throw redirect({
        to: '/sign-in',
        search: { redirect: window.location.pathname },
      })
    }
  },
  component: AuthenticatedLayout,
})
