import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { products, type Product } from '@/lib/api-client'
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
import { ProductFormSheet } from './product-form-sheet'

export default function Products() {
  const [items, setItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)

  const fetchProducts = async (type?: string) => {
    setLoading(true)
    try {
      const data = await products.list(type === 'all' ? undefined : type)
      setItems(data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts(activeTab)
  }, [activeTab])

  const handleCreate = () => {
    setEditing(null)
    setSheetOpen(true)
  }

  const handleEdit = (item: Product) => {
    setEditing(item)
    setSheetOpen(true)
  }

  const handleDelete = async (sku: string) => {
    if (!confirm(`确认删除 ${sku}？`)) return
    await products.delete(sku)
    fetchProducts(activeTab)
  }

  return (
    <>
      <Header fixed>
        <div className='flex items-center justify-between w-full'>
          <h1 className='text-2xl font-bold'>产品管理</h1>
          <Button size='sm' onClick={handleCreate}>
            <Plus className='mr-1 h-4 w-4' /> 新增产品
          </Button>
        </div>
      </Header>
      <Main>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value='all'>全部</TabsTrigger>
            <TabsTrigger value='block'>框体</TabsTrigger>
            <TabsTrigger value='item'>物件</TabsTrigger>
            <TabsTrigger value='riser'>增高件</TabsTrigger>
          </TabsList>
          <TabsContent value={activeTab} className='mt-4'>
            {loading ? (
              <div className='py-8 text-center text-muted-foreground'>加载中...</div>
            ) : (
              <div className='rounded-md border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='w-16'>图片</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>名称</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>默认框体</TableHead>
                      <TableHead>排序</TableHead>
                      <TableHead className='text-right'>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          {item.image_path && (
                            <img
                              src={`/files/${item.image_path}`}
                              alt={item.sku_name}
                              className='h-10 w-10 rounded object-cover'
                            />
                          )}
                        </TableCell>
                        <TableCell className='font-mono text-sm'>{item.sku}</TableCell>
                        <TableCell>{item.display_name || item.sku_name}</TableCell>
                        <TableCell>
                          <Badge variant='outline'>{item.type}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.is_published ? 'default' : 'secondary'}>
                            {item.is_published ? '已发布' : '草稿'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {item.type === 'block' ? (
                            <Badge variant={item.is_default ? 'default' : 'outline'}>
                              {item.is_default ? '是' : '否'}
                            </Badge>
                          ) : (
                            <span className='text-muted-foreground'>-</span>
                          )}
                        </TableCell>
                        <TableCell>{item.sort_order}</TableCell>
                        <TableCell className='text-right space-x-1'>
                          <Button
                            variant='ghost'
                            size='icon'
                            onClick={() => handleEdit(item)}
                          >
                            <Pencil className='h-4 w-4' />
                          </Button>
                          <Button
                            variant='ghost'
                            size='icon'
                            onClick={() => handleDelete(item.sku)}
                          >
                            <Trash2 className='h-4 w-4' />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {items.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className='h-24 text-center'>
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

      <ProductFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        product={editing}
        onSuccess={() => fetchProducts(activeTab)}
      />
    </>
  )
}
