import { createFileRoute } from '@tanstack/react-router'
import Presets from '@/features/presets'

export const Route = createFileRoute('/_authenticated/presets/')({
  component: Presets,
})
