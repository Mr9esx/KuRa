import { createFileRoute } from '@tanstack/react-router'
import Categories from '@/features/categories'

export const Route = createFileRoute('/_authenticated/categories/')({
  component: Categories,
})
