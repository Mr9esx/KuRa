import { createFileRoute, redirect } from '@tanstack/react-router'
import { auth } from '@/lib/api-client'
import { Setup } from '@/features/auth/setup'

export const Route = createFileRoute('/(auth)/setup')({
  beforeLoad: async () => {
    const { needs_setup } = await auth.setupStatus()
    if (!needs_setup) {
      throw redirect({ to: '/sign-in' })
    }
  },
  component: Setup,
})
