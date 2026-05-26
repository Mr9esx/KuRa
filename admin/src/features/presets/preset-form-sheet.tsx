import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import {
  presets,
  products as productsApi,
  upload,
  type Preset,
  type Product,
} from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { ImageIcon, Loader2, Plus, Trash2, Upload } from 'lucide-react'

interface PresetFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preset?: Preset | null
  onSuccess: () => void
}

interface PresetItemEntry {
  key: string
  product_sku: string
  cell_x: number
  cell_y: number
}

let nextKey = 0
function genKey() {
  return `pi-${++nextKey}`
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
  const [items, setItems] = useState<PresetItemEntry[]>([])
  const [saving, setSaving] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [blockProducts, setBlockProducts] = useState<Product[]>([])
  const [itemProducts, setItemProducts] = useState<Product[]>([])
  const [riserProducts, setRiserProducts] = useState<Product[]>([])

  const isEdit = !!preset

  const selectedBlock = blockProducts.find((b) => b.sku === form.block_sku)
  const gridCols = selectedBlock?.cell_cols ?? 0
  const gridRows = selectedBlock?.cell_rows ?? 0

  useEffect(() => {
    if (!open) return
    productsApi.list().then((list) => {
      setAllProducts(list)
      setBlockProducts(list.filter((p) => p.type === 'block'))
      setItemProducts(list.filter((p) => p.type === 'item'))
      setRiserProducts(list.filter((p) => p.type === 'riser'))
    })
  }, [open])

  useEffect(() => {
    if (preset) {
      setForm({
        preset_id: preset.preset_id,
        name: preset.name,
        description: preset.description || '',
        block_sku: preset.block_sku,
        is_published: preset.is_published,
      })
      setItems(
        (preset.items || []).map((it) => ({
          key: genKey(),
          product_sku: it.product_sku,
          cell_x: it.cell_x,
          cell_y: it.cell_y,
        }))
      )
      setImagePreview(preset.image ? `/files/${preset.image}` : null)
    } else {
      setForm({
        preset_id: '',
        name: '',
        description: '',
        block_sku: '',
        is_published: false,
      })
      setItems([])
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

  const addItem = useCallback(() => {
    setItems((prev) => [
      ...prev,
      { key: genKey(), product_sku: '', cell_x: 0, cell_y: 0 },
    ])
  }, [])

  const removeItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((it) => it.key !== key))
  }, [])

  const updateItem = useCallback(
    (key: string, field: keyof PresetItemEntry, value: string | number) => {
      setItems((prev) =>
        prev.map((it) => (it.key === key ? { ...it, [field]: value } : it))
      )
    },
    []
  )

  const detectConflicts = useCallback(() => {
    const conflicts: string[] = []
    for (let i = 0; i < items.length; i++) {
      const a = items[i]!
      const pa = productBysku(a.product_sku)
      if (!pa) continue
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j]!
        const pb = productBysku(b.product_sku)
        if (!pb) continue
        const overlapX =
          a.cell_x < b.cell_x + pb.grid_cols &&
          a.cell_x + pa.grid_cols > b.cell_x
        const overlapY =
          a.cell_y < b.cell_y + pb.grid_rows &&
          a.cell_y + pa.grid_rows > b.cell_y
        if (overlapX && overlapY) {
          conflicts.push(
            `${pa.sku_name}(${a.cell_x},${a.cell_y}) 与 ${pb.sku_name}(${b.cell_x},${b.cell_y}) 重叠`
          )
        }
      }
      if (gridCols > 0 && gridRows > 0) {
        if (
          a.cell_x + pa.grid_cols > gridCols ||
          a.cell_y + pa.grid_rows > gridRows
        ) {
          conflicts.push(
            `${pa.sku_name}(${a.cell_x},${a.cell_y}) 超出网格范围`
          )
        }
      }
    }
    return conflicts
  }, [items, allProducts, gridCols, gridRows])

  const handleSubmit = async () => {
    if (!form.preset_id || !form.name || !form.block_sku) {
      toast.error('方案ID、名称和框体SKU为必填项')
      return
    }

    const emptyItem = items.find((it) => !it.product_sku)
    if (emptyItem) {
      toast.error('物件列表中存在未选择产品的条目')
      return
    }

    const conflicts = detectConflicts()
    if (conflicts.length > 0) {
      toast.error(`物件布局冲突：${conflicts[0]}`, {
        description:
          conflicts.length > 1
            ? `还有 ${conflicts.length - 1} 个冲突`
            : undefined,
      })
      return
    }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        ...form,
        items: items.map((it) => ({
          product_sku: it.product_sku,
          cell_x: it.cell_x,
          cell_y: it.cell_y,
        })),
      }

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

  const availableProducts = [...itemProducts, ...riserProducts]

  const productBysku = (sku: string) => allProducts.find((p) => p.sku === sku)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className='sm:max-w-3xl max-h-[90vh] overflow-y-auto'
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑方案' : '新增方案'}</DialogTitle>
          <DialogDescription>
            {isEdit ? '修改预设方案信息和物件布局' : '创建新的预设方案'}
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-4 py-4'>
          {/* Image preview + upload */}
          <div className='space-y-3'>
            <Label>方案封面图</Label>
            <div className='flex gap-4'>
              <div className='flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted'>
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

          {/* Basic fields */}
          <div className='grid grid-cols-2 gap-4'>
            <div className='space-y-2'>
              <Label htmlFor='preset_id'>方案 ID *</Label>
              <Input
                id='preset_id'
                value={form.preset_id}
                onChange={(e) =>
                  setForm({ ...form, preset_id: e.target.value })
                }
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
          </div>

          <div className='space-y-2'>
            <Label htmlFor='preset-desc'>描述</Label>
            <Textarea
              id='preset-desc'
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder='方案描述'
              rows={2}
            />
          </div>

          {/* Block selector */}
          <div className='space-y-2'>
            <Label>框体 *</Label>
            <Select
              value={form.block_sku}
              onValueChange={(v) => setForm({ ...form, block_sku: v })}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='选择框体' />
              </SelectTrigger>
              <SelectContent className='max-h-[300px] w-[var(--radix-select-trigger-width)]'>
                {blockProducts.map((b) => (
                  <SelectItem key={b.sku} value={b.sku}>
                    <div className='flex items-center gap-2'>
                      {b.image_path ? (
                        <img
                          src={`/files/${b.image_path}`}
                          alt={b.sku_name}
                          className='h-8 w-8 shrink-0 rounded object-contain bg-muted'
                        />
                      ) : (
                        <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted'>
                          <ImageIcon className='h-4 w-4 text-muted-foreground' />
                        </div>
                      )}
                      <div className='min-w-0'>
                        <p className='truncate text-sm'>{b.sku_name}</p>
                        <p className='text-[10px] text-muted-foreground'>
                          {b.sku}
                          {b.cell_cols && b.cell_rows
                            ? ` · ${b.cell_cols}×${b.cell_rows} 格`
                            : ''}
                        </p>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedBlock && (
              <p className='text-xs text-muted-foreground'>
                网格：{gridCols}×{gridRows} · 尺寸：
                {selectedBlock.grid_cols}×{selectedBlock.grid_rows} ·
                高度：{selectedBlock.height}
              </p>
            )}
          </div>

          {/* Items editor */}
          <div className='space-y-3'>
            <div className='flex items-center justify-between'>
              <Label>物件布局（{items.length} 个）</Label>
              <Button type='button' variant='outline' size='sm' onClick={addItem}>
                <Plus className='mr-1 h-3.5 w-3.5' />
                添加物件
              </Button>
            </div>

            {items.length === 0 && (
              <p className='rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground'>
                暂未添加物件，点击上方按钮添加
              </p>
            )}

            {items.map((item, idx) => {
              const prod = productBysku(item.product_sku)
              return (
                <div
                  key={item.key}
                  className='flex items-start gap-2 rounded-md border p-2'
                >
                  <span className='mt-2 text-xs text-muted-foreground w-5 shrink-0'>
                    {idx + 1}
                  </span>

                  <div className='flex-1 space-y-2'>
                    <Select
                      value={item.product_sku}
                      onValueChange={(v) =>
                        updateItem(item.key, 'product_sku', v)
                      }
                    >
                      <SelectTrigger className='h-9 text-xs w-full'>
                        <SelectValue placeholder='选择物件/增高件' />
                      </SelectTrigger>
                      <SelectContent className='max-h-[320px] w-[var(--radix-select-trigger-width)]'>
                        {itemProducts.length > 0 && (
                          <>
                            <div className='px-2 py-1 text-[10px] font-medium text-muted-foreground'>
                              物件
                            </div>
                            {itemProducts.map((p) => (
                              <SelectItem key={p.sku} value={p.sku}>
                                <div className='flex items-center gap-2'>
                                  {p.image_path ? (
                                    <img
                                      src={`/files/${p.image_path}`}
                                      alt={p.sku_name}
                                      className='h-7 w-7 shrink-0 rounded object-contain bg-muted'
                                    />
                                  ) : (
                                    <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted'>
                                      <ImageIcon className='h-3.5 w-3.5 text-muted-foreground' />
                                    </div>
                                  )}
                                  <div className='min-w-0'>
                                    <p className='truncate text-xs'>
                                      {p.sku_name}
                                    </p>
                                    <p className='text-[10px] text-muted-foreground'>
                                      {p.grid_cols}×{p.grid_rows}
                                    </p>
                                  </div>
                                </div>
                              </SelectItem>
                            ))}
                          </>
                        )}
                        {riserProducts.length > 0 && (
                          <>
                            <div className='px-2 py-1 text-[10px] font-medium text-muted-foreground'>
                              增高件
                            </div>
                            {riserProducts.map((p) => (
                              <SelectItem key={p.sku} value={p.sku}>
                                <div className='flex items-center gap-2'>
                                  {p.image_path ? (
                                    <img
                                      src={`/files/${p.image_path}`}
                                      alt={p.sku_name}
                                      className='h-7 w-7 shrink-0 rounded object-contain bg-muted'
                                    />
                                  ) : (
                                    <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted'>
                                      <ImageIcon className='h-3.5 w-3.5 text-muted-foreground' />
                                    </div>
                                  )}
                                  <div className='min-w-0'>
                                    <p className='truncate text-xs'>
                                      {p.sku_name}
                                    </p>
                                    <p className='text-[10px] text-muted-foreground'>
                                      {p.grid_cols}×{p.grid_rows} · H
                                      {p.height}
                                    </p>
                                  </div>
                                </div>
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>

                    <div className='flex items-center gap-2'>
                      <div className='flex items-center gap-1'>
                        <span className='text-[10px] text-muted-foreground'>
                          列 X
                        </span>
                        <Input
                          type='number'
                          min={0}
                          max={gridCols > 0 ? gridCols - 1 : 99}
                          value={item.cell_x}
                          onChange={(e) =>
                            updateItem(
                              item.key,
                              'cell_x',
                              Number(e.target.value) || 0
                            )
                          }
                          className='h-7 w-16 text-xs'
                        />
                      </div>
                      <div className='flex items-center gap-1'>
                        <span className='text-[10px] text-muted-foreground'>
                          行 Y
                        </span>
                        <Input
                          type='number'
                          min={0}
                          max={gridRows > 0 ? gridRows - 1 : 99}
                          value={item.cell_y}
                          onChange={(e) =>
                            updateItem(
                              item.key,
                              'cell_y',
                              Number(e.target.value) || 0
                            )
                          }
                          className='h-7 w-16 text-xs'
                        />
                      </div>
                      {prod && (
                        <span className='text-[10px] text-muted-foreground'>
                          占 {prod.grid_cols}×{prod.grid_rows}
                          {prod.type === 'riser' ? ` · H${prod.height}` : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className='mt-1 h-7 w-7 shrink-0 text-destructive hover:text-destructive'
                    onClick={() => removeItem(item.key)}
                  >
                    <Trash2 className='h-3.5 w-3.5' />
                  </Button>
                </div>
              )
            })}

            {/* Visual grid preview */}
            {gridCols > 0 && gridRows > 0 && (
              <div className='space-y-1.5'>
                <Label className='text-xs text-muted-foreground'>
                  网格预览（{gridCols}×{gridRows}）
                </Label>
                <div
                  className='inline-grid gap-px rounded-md border bg-muted/50 p-1'
                  style={{
                    gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
                    width: Math.min(gridCols * 56, 500),
                  }}
                >
                  {Array.from({ length: gridRows }).map((_, y) =>
                    Array.from({ length: gridCols }).map((_, x) => {
                      const occupants = items.filter((it) => {
                        const p = productBysku(it.product_sku)
                        if (!p) return false
                        return (
                          x >= it.cell_x &&
                          x < it.cell_x + p.grid_cols &&
                          y >= it.cell_y &&
                          y < it.cell_y + p.grid_rows
                        )
                      })
                      const isOrigin = items.some(
                        (it) => it.cell_x === x && it.cell_y === y
                      )
                      const occupant = occupants[0]
                      const prod = occupant
                        ? productBysku(occupant.product_sku)
                        : null
                      const hasConflict = occupants.length > 1

                      return (
                        <div
                          key={`${x}-${y}`}
                          className={`flex h-12 items-center justify-center rounded text-[9px] leading-tight text-center ${
                            hasConflict
                              ? 'bg-destructive/20 text-destructive ring-1 ring-destructive/40'
                              : occupant
                                ? prod?.type === 'riser'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                  : 'bg-primary/10 text-primary'
                                : 'bg-background'
                          }`}
                          title={
                            hasConflict
                              ? `冲突：${occupants.map((o) => o.product_sku).join(', ')}`
                              : occupant
                                ? `${occupant.product_sku} (${x},${y})`
                                : `空 (${x},${y})`
                          }
                        >
                          {hasConflict ? (
                            '冲突!'
                          ) : isOrigin && prod ? (
                            <span className='truncate px-0.5'>
                              {prod.sku_name.slice(0, 6)}
                            </span>
                          ) : occupant ? (
                            '·'
                          ) : (
                            <span className='text-muted-foreground/40'>
                              {x},{y}
                            </span>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
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
  )
}
