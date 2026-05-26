import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { auth } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

const passwordFormSchema = z
  .object({
    currentPassword: z.string().min(1, '请输入当前密码'),
    newPassword: z.string().min(6, '新密码至少6个字符'),
    confirmPassword: z.string().min(1, '请确认新密码'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword'],
  })

type PasswordFormValues = z.infer<typeof passwordFormSchema>

export function AccountForm() {
  const [status, setStatus] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  async function onSubmit(data: PasswordFormValues) {
    setStatus(null)
    try {
      await auth.changePassword(data.currentPassword, data.newPassword)
      setStatus({ type: 'success', message: '密码修改成功' })
      form.reset()
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : '修改失败，请重试'
      setStatus({ type: 'error', message })
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
        <FormField
          control={form.control}
          name='currentPassword'
          render={({ field }) => (
            <FormItem>
              <FormLabel>当前密码</FormLabel>
              <FormControl>
                <Input type='password' placeholder='输入当前密码' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='newPassword'
          render={({ field }) => (
            <FormItem>
              <FormLabel>新密码</FormLabel>
              <FormControl>
                <Input type='password' placeholder='输入新密码' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='confirmPassword'
          render={({ field }) => (
            <FormItem>
              <FormLabel>确认新密码</FormLabel>
              <FormControl>
                <Input type='password' placeholder='再次输入新密码' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {status && (
          <p
            className={
              status.type === 'success' ? 'text-green-600' : 'text-destructive'
            }
          >
            {status.message}
          </p>
        )}

        <Button type='submit' disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? '提交中...' : '修改密码'}
        </Button>
      </form>
    </Form>
  )
}
