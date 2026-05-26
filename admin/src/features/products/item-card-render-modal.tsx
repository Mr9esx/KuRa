import { useEffect, useRef, useCallback, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface ItemCardRenderModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  modelPath: string
  onConfirm: (file: File) => void
}

const APP_ORIGIN = import.meta.env.VITE_APP_URL as string | undefined

function buildIframeSrc(modelPath: string) {
  const base = APP_ORIGIN || ''
  const encoded = encodeURIComponent(modelPath)
  return `${base}/tools/item-card?embed=1&model=${encoded}`
}

export function ItemCardRenderModal({
  open,
  onOpenChange,
  modelPath,
  onConfirm,
}: ItemCardRenderModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [loading, setLoading] = useState(true)

  const handleMessage = useCallback(
    (e: MessageEvent) => {
      if (e.data?.type !== 'item-card-result') return
      const { base64 } = e.data as { base64: string }
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      const blob = new Blob([bytes], { type: 'image/png' })
      const file = new File([blob], 'rendered-product.png', {
        type: 'image/png',
      })
      onConfirm(file)
      onOpenChange(false)
    },
    [onConfirm, onOpenChange]
  )

  useEffect(() => {
    if (!open) return
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [open, handleMessage])

  useEffect(() => {
    if (open) setLoading(true)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-[95vw] h-[90vh] p-0 gap-0'>
        <DialogHeader className='px-4 py-3 border-b'>
          <DialogTitle>渲染产品图片</DialogTitle>
          <DialogDescription>
            调整渲染参数后，点击「确认使用此图片」将图片注入到产品表单
          </DialogDescription>
        </DialogHeader>
        <div className='relative flex-1 min-h-0'>
          {loading && (
            <div className='absolute inset-0 z-10 flex items-center justify-center bg-muted'>
              <p className='text-sm text-muted-foreground'>加载渲染工具中…</p>
            </div>
          )}
          {open && (
            <iframe
              ref={iframeRef}
              src={buildIframeSrc(modelPath)}
              className='h-full w-full border-0'
              onLoad={() => setLoading(false)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
