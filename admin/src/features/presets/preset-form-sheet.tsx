import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { presets, type Preset } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'

interface PresetFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preset?: Preset | null
  onSuccess: () => void
}

export function PresetFormSheet({
  open,
  onOpenChange,
  preset,
  onSuccess,
}: PresetFormSheetProps) {
  const [form, setForm] = useState({
    preset_id: '',
    name: '',
    description: '',
    block_sku: '',
    is_published: false,
  })
  const [saving, setSaving] = useState(false)

  const isEdit = !!preset

  useEffect(() => {
    if (preset) {
      setForm({
        preset_id: preset.preset_id,
        name: preset.name,
        description: preset.description || '',
        block_sku: preset.block_sku,
        is_published: preset.is_published,
      })
    } else {
      setForm({
        preset_id: '',
        name: '',
        description: '',
        block_sku: '',
        is_published: false,
      })
    }
  }, [preset, open])

  const handleSubmit = async () => {
    if (!form.preset_id || !form.name || !form.block_sku) {
      toast.error('方案ID、名称和框体SKU为必填项')
      return
    }

    setSaving(true)
    try {
      if (isEdit) {
        await presets.update(preset!.id, form)
        toast.success('方案已更新')
      } else {
        await presets.create(form)
        toast.success('方案已创建')
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
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑方案' : '新增方案'}</DialogTitle>
          <DialogDescription>
            {isEdit ? '修改预设方案信息' : '创建新的预设方案'}
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-4 py-4'>
          <div className='space-y-2'>
            <Label htmlFor='preset_id'>方案 ID *</Label>
            <Input
              id='preset_id'
              value={form.preset_id}
              onChange={(e) => setForm({ ...form, preset_id: e.target.value })}
              disabled={isEdit}
              placeholder='例: preset-desk-01'
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='preset-name'>方案名称 *</Label>
            <Input
              id='preset-name'
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder='例: 桌面收纳套装'
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='preset-desc'>描述</Label>
            <Textarea
              id='preset-desc'
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder='方案描述'
              rows={3}
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='block_sku'>框体 SKU *</Label>
            <Input
              id='block_sku'
              value={form.block_sku}
              onChange={(e) => setForm({ ...form, block_sku: e.target.value })}
              placeholder='关联的框体产品 SKU'
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
