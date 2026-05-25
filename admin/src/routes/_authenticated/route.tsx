import { createFileRoute, redirect } from '@tanstack/react-router'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: () => {
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
