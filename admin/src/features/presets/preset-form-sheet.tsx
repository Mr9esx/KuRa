import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { presets, upload, type Preset } from '@/lib/api-client'
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
import { ImageIcon, Loader2, Upload } from 'lucide-react'

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
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

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
      setImagePreview(preset.image ? `/files/${preset.image}` : null)
    } else {
      setForm({
        preset_id: '',
        name: '',
        description: '',
        block_sku: '',
        is_published: false,
      })
      setImagePreview(null)
    }
    setImageFile(null)
  }, [preset, open])

  const handleImageFileChange = useCallback(
    (file: File | null) => {
      setImageFile(file)
      if (file) {
        setImagePreview(URL.createObjectURL(file))
      } else if (preset?.image) {
        setImagePreview(`/files/${preset.image}`)
      } else {
        setImagePreview(null)
      }
    },
    [preset]
  )

  const handleSubmit = async () => {
    if (!form.preset_id || !form.name || !form.block_sku) {
      toast.error('方案ID、名称和框体SKU为必填项')
      return
    }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = { ...form }

      if (imageFile) {
        const res = await upload.image(imageFile, imageFile.name, 'presets')
        payload.image = res.path
      }

      if (isEdit) {
        await presets.update(preset!.id, payload)
        toast.success('方案已更新')
      } else {
        await presets.create(payload)
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
      <DialogContent className='sm:max-w-lg max-h-[85vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑方案' : '新增方案'}</DialogTitle>
          <DialogDescription>
            {isEdit ? '修改预设方案信息' : '创建新的预设方案'}
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-4 py-4'>
          {/* Image preview + upload */}
          <div className='space-y-3'>
            <Label>方案封面图</Label>
            <div className='flex gap-4'>
              <div className='flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted'>
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt='方案封面'
                    className='h-full w-full object-contain'
                  />
                ) : (
                  <ImageIcon className='h-8 w-8 text-muted-foreground' />
                )}
              </div>
              <div className='flex flex-col gap-2'>
                <input
                  ref={imageInputRef}
                  type='file'
                  accept='image/*'
                  className='hidden'
                  onChange={(e) =>
                    handleImageFileChange(e.target.files?.[0] || null)
                  }
                />
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => imageInputRef.current?.click()}
                >
                  <Upload className='mr-2 h-4 w-4' />
                  上传图片
                </Button>
                {imageFile && (
                  <p className='text-xs text-muted-foreground'>
                    已选择：{imageFile.name}
                  </p>
                )}
              </div>
            </div>
          </div>

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
