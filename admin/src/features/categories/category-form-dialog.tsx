import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { categories, type Category } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'

interface CategoryFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: Category | null
  onSuccess: () => void
}

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
  onSuccess,
}: CategoryFormDialogProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState('item')
  const [sortOrder, setSortOrder] = useState(0)
  const [saving, setSaving] = useState(false)

  const isEdit = !!category

  useEffect(() => {
    if (category) {
      setName(category.name)
      setType(category.type)
      setSortOrder(category.sort_order)
    } else {
      setName('')
      setType('item')
      setSortOrder(0)
    }
  }, [category, open])

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('分类名称不能为空')
      return
    }

    setSaving(true)
    try {
      if (isEdit) {
        await categories.update(category!.id, { name, type, sort_order: sortOrder })
        toast.success('分类已更新')
      } else {
        await categories.create({ name, type, sort_order: sortOrder })
        toast.success('分类已创建')
      }
      onOpenChange(false)
      onSuccess()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑分类' : '新增分类'}</DialogTitle>
          <DialogDescription>
            {isEdit ? '修改分类信息' : '创建新的产品分类'}
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-4 py-4'>
          <div className='space-y-2'>
            <Label htmlFor='cat-name'>分类名称 *</Label>
            <Input
              id='cat-name'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='例: 书桌收纳'
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='cat-type'>分类类型</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id='cat-type'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='item'>物件分类</SelectItem>
                <SelectItem value='block'>框体分类</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='cat-sort'>排序</Label>
            <Input
              id='cat-sort'
              type='number'
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {isEdit ? '保存' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
