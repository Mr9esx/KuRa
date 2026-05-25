import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { categories, type Category } from '@/lib/api-client'
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { CategoryFormDialog } from './category-form-dialog'

export default function Categories() {
  const [items, setItems] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)

  const fetchCategories = async (type?: string) => {
    setLoading(true)
    try {
      const data = await categories.list(type === 'all' ? undefined : type)
      setItems(data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCategories(activeTab)
  }, [activeTab])

  const handleCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const handleEdit = (cat: Category) => {
    setEditing(cat)
    setDialogOpen(true)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确认删除此分类？')) return
    await categories.delete(id)
    fetchCategories(activeTab)
  }

  return (
    <>
      <Header fixed>
        <div className='flex items-center justify-between w-full'>
          <h1 className='text-2xl font-bold'>分类管理</h1>
          <Button size='sm' onClick={handleCreate}>
            <Plus className='mr-1 h-4 w-4' /> 新增分类
          </Button>
        </div>
      </Header>
      <Main>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value='all'>全部</TabsTrigger>
            <TabsTrigger value='item'>物件分类</TabsTrigger>
            <TabsTrigger value='block'>框体分类</TabsTrigger>
          </TabsList>
          <TabsContent value={activeTab} className='mt-4'>
            {loading ? (
              <div className='py-8 text-center text-muted-foreground'>加载中...</div>
            ) : (
              <div className='rounded-md border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>产品数</TableHead>
                      <TableHead>排序</TableHead>
                      <TableHead className='text-right'>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((cat) => (
                      <TableRow key={cat.id}>
                        <TableCell className='font-medium'>{cat.name}</TableCell>
                        <TableCell>
                          <Badge variant='outline'>{cat.type}</Badge>
                        </TableCell>
                        <TableCell>{cat.products?.length || 0}</TableCell>
                        <TableCell>{cat.sort_order}</TableCell>
                        <TableCell className='text-right space-x-1'>
                          <Button
                            variant='ghost'
                            size='icon'
                            onClick={() => handleEdit(cat)}
                          >
                            <Pencil className='h-4 w-4' />
                          </Button>
                          <Button
                            variant='ghost'
                            size='icon'
                            onClick={() => handleDelete(cat.id)}
                          >
                            <Trash2 className='h-4 w-4' />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {items.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className='h-24 text-center'>
                          暂无数据
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </Main>

      <CategoryFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={editing}
        onSuccess={() => fetchCategories(activeTab)}
      />
    </>
  )
}
