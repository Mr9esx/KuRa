import { z } from 'zod'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { auth } from '@/lib/api-client'
import { SignIn } from '@/features/auth/sign-in'

const searchSchema = z.object({
  redirect: z.string().optional(),
})

export const Route = createFileRoute('/(auth)/sign-in')({
  beforeLoad: async () => {
    const { needs_setup } = await auth.setupStatus()
    if (needs_setup) {
      throw redirect({ to: '/setup' })
    }
  },
  component: SignIn,
  validateSearch: searchSchema,
})
