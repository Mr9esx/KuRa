import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { products, upload, type Product } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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
import { ImageIcon, Loader2, Upload, Wand2 } from 'lucide-react'
import { ItemCardRenderModal } from './item-card-render-modal'

interface ProductFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product?: Product | null
  onSuccess: () => void
}

const EMPTY_FORM = {
  sku: '',
  sku_name: '',
  display_name: '',
  desc: '',
  type: 'item' as string,
  grid_cols: 1,
  grid_rows: 1,
  height: 0,
  sort_order: 0,
  is_default: false,
  is_published: false,
}

export function ProductFormSheet({
  open,
  onOpenChange,
  product,
  onSuccess,
}: ProductFormSheetProps) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [modelFile, setModelFile] = useState<File | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [renderModalOpen, setRenderModalOpen] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const isEdit = !!product

  useEffect(() => {
    if (product) {
      setForm({
        sku: product.sku,
        sku_name: product.sku_name,
        display_name: product.display_name || '',
        desc: product.desc || '',
        type: product.type,
        grid_cols: product.grid_cols,
        grid_rows: product.grid_rows,
        height: product.height,
        sort_order: product.sort_order,
        is_default: product.is_default,
        is_published: product.is_published,
      })
      setImagePreview(
        product.image_path ? `/files/${product.image_path}` : null
      )
    } else {
      setForm(EMPTY_FORM)
      setImagePreview(null)
    }
    setModelFile(null)
    setImageFile(null)
  }, [product, open])

  const handleImageFileChange = useCallback(
    (file: File | null) => {
      setImageFile(file)
      if (file) {
        const url = URL.createObjectURL(file)
        setImagePreview(url)
      } else if (product?.image_path) {
        setImagePreview(`/files/${product.image_path}`)
      } else {
        setImagePreview(null)
      }
    },
    [product]
  )

  const handleRenderConfirm = useCallback(
    (file: File) => {
      handleImageFileChange(file)
    },
    [handleImageFileChange]
  )

  const modelPathForRender =
    product?.model_path || (modelFile ? '' : '')

  const handleSubmit = async () => {
    if (!form.sku || !form.sku_name) {
      toast.error('SKU 和名称为必填项')
      return
    }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = { ...form }
      if (form.type !== 'block') {
        payload.is_default = false
      }

      if (modelFile) {
        const res = await upload.model(modelFile, form.type)
        payload.model_path = res.path
      }

      if (imageFile) {
        const res = await upload.image(imageFile, imageFile.name, form.type)
        payload.image_path = res.path
      }

      if (isEdit) {
        await products.update(product!.sku, payload)
        toast.success('产品已更新')
      } else {
        await products.create(payload)
        toast.success('产品已创建')
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
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className='sm:max-w-2xl max-h-[85vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>{isEdit ? '编辑产品' : '新增产品'}</DialogTitle>
            <DialogDescription>
              {isEdit ? '修改产品信息后保存' : '填写产品基本信息'}
            </DialogDescription>
          </DialogHeader>

          <div className='grid gap-4 py-4'>
            {/* Image preview + actions */}
            <div className='space-y-3'>
              <Label>产品图片</Label>
              <div className='flex gap-4'>
                <div className='flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted'>
                  {imagePreview ? (
                    <img
                      src={imagePreview}
                      alt='产品图片'
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
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    disabled={!product?.model_path}
                    onClick={() => setRenderModalOpen(true)}
                  >
                    <Wand2 className='mr-2 h-4 w-4' />
                    渲染生成
                  </Button>
                  {!product?.model_path && (
                    <p className='text-xs text-muted-foreground'>
                      需先上传 3D 模型才可渲染
                    </p>
                  )}
                  {imageFile && (
                    <p className='text-xs text-muted-foreground'>
                      已选择：{imageFile.name}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className='grid grid-cols-2 gap-4'>
              <div className='space-y-2'>
                <Label htmlFor='sku'>SKU *</Label>
                <Input
                  id='sku'
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  disabled={isEdit}
                  placeholder='例: SH-001'
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='type'>类型 *</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm({ ...form, type: v })}
                >
                  <SelectTrigger id='type'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='block'>框体</SelectItem>
                    <SelectItem value='item'>物件</SelectItem>
                    <SelectItem value='riser'>增高件</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className='grid grid-cols-2 gap-4'>
              <div className='space-y-2'>
                <Label htmlFor='sku_name'>SKU 名称 *</Label>
                <Input
                  id='sku_name'
                  value={form.sku_name}
                  onChange={(e) =>
                    setForm({ ...form, sku_name: e.target.value })
                  }
                  placeholder='内部名称'
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='display_name'>显示名称</Label>
                <Input
                  id='display_name'
                  value={form.display_name}
                  onChange={(e) =>
                    setForm({ ...form, display_name: e.target.value })
                  }
                  placeholder='前端展示名称（可选）'
                />
              </div>
            </div>

            <div className='space-y-2'>
              <Label htmlFor='desc'>描述</Label>
              <Textarea
                id='desc'
                value={form.desc}
                onChange={(e) => setForm({ ...form, desc: e.target.value })}
                placeholder='产品描述'
                rows={3}
              />
            </div>

            <div className='grid grid-cols-4 gap-4'>
              <div className='space-y-2'>
                <Label htmlFor='grid_cols'>列数</Label>
                <Input
                  id='grid_cols'
                  type='number'
                  value={form.grid_cols}
                  onChange={(e) =>
                    setForm({ ...form, grid_cols: Number(e.target.value) })
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='grid_rows'>行数</Label>
                <Input
                  id='grid_rows'
                  type='number'
                  value={form.grid_rows}
                  onChange={(e) =>
                    setForm({ ...form, grid_rows: Number(e.target.value) })
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='height'>高度</Label>
                <Input
                  id='height'
                  type='number'
                  value={form.height}
                  onChange={(e) =>
                    setForm({ ...form, height: Number(e.target.value) })
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='sort_order'>排序</Label>
                <Input
                  id='sort_order'
                  type='number'
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm({ ...form, sort_order: Number(e.target.value) })
                  }
                />
              </div>
            </div>

            {form.type === 'block' && (
              <div className='flex items-center justify-between rounded-md border p-3'>
                <div className='space-y-1'>
                  <Label htmlFor='is_default'>默认框体</Label>
                  <p className='text-xs text-muted-foreground'>
                    仅允许一个默认框体，设置后会自动取消其他框体默认状态。
                  </p>
                </div>
                <Switch
                  id='is_default'
                  checked={form.is_default}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, is_default: checked })
                  }
                />
              </div>
            )}

            <div className='space-y-2'>
              <Label htmlFor='model'>3D 模型文件 (.3mf)</Label>
              <Input
                id='model'
                type='file'
                accept='.3mf'
                onChange={(e) => setModelFile(e.target.files?.[0] || null)}
              />
              {product?.model_path && !modelFile && (
                <p className='text-xs text-muted-foreground'>
                  当前模型：{product.model_path}
                </p>
              )}
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

      {product?.model_path && (
        <ItemCardRenderModal
          open={renderModalOpen}
          onOpenChange={setRenderModalOpen}
          modelPath={product.model_path}
          onConfirm={handleRenderConfirm}
        />
      )}
    </>
  )
}
