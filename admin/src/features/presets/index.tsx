import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { presets, type Preset } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { PresetFormSheet } from './preset-form-sheet'

export default function Presets() {
  const [items, setItems] = useState<Preset[]>([])
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Preset | null>(null)

  const fetchPresets = async () => {
    setLoading(true)
    try {
      const data = await presets.list()
      setItems(data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPresets()
  }, [])

  const handleCreate = () => {
    setEditing(null)
    setSheetOpen(true)
  }

  const handleEdit = (preset: Preset) => {
    setEditing(preset)
    setSheetOpen(true)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确认删除此预设方案？')) return
    await presets.delete(id)
    fetchPresets()
  }

  return (
    <>
      <Header sticky>
        <div className='flex items-center justify-between w-full'>
          <h1 className='text-2xl font-bold'>预设方案</h1>
          <Button size='sm' onClick={handleCreate}>
            <Plus className='mr-1 h-4 w-4' /> 新增方案
          </Button>
        </div>
      </Header>
      <Main>
        {loading ? (
          <div className='py-8 text-center text-muted-foreground'>加载中...</div>
        ) : (
          <div className='rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-16'>预览</TableHead>
                  <TableHead>方案ID</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead>框体</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className='text-right'>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((preset) => (
                  <TableRow key={preset.id}>
                    <TableCell>
                      {preset.image && (
                        <img
                          src={`/files/${preset.image}`}
                          alt={preset.name}
                          className='h-10 w-10 rounded object-cover'
                        />
                      )}
                    </TableCell>
                    <TableCell className='font-mono text-sm'>{preset.preset_id}</TableCell>
                    <TableCell className='font-medium'>{preset.name}</TableCell>
                    <TableCell className='text-muted-foreground max-w-[200px] truncate'>
                      {preset.description}
                    </TableCell>
                    <TableCell>{preset.block_sku}</TableCell>
                    <TableCell>
                      <Badge variant={preset.is_published ? 'default' : 'secondary'}>
                        {preset.is_published ? '已发布' : '草稿'}
                      </Badge>
                    </TableCell>
                    <TableCell className='text-right space-x-1'>
                      <Button
                        variant='ghost'
                        size='icon'
                        onClick={() => handleEdit(preset)}
                      >
                        <Pencil className='h-4 w-4' />
                      </Button>
                      <Button
                        variant='ghost'
                        size='icon'
                        onClick={() => handleDelete(preset.id)}
                      >
                        <Trash2 className='h-4 w-4' />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className='h-24 text-center'>
                      暂无数据
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Main>

      <PresetFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        preset={editing}
        onSuccess={fetchPresets}
      />
    </>
  )
}
