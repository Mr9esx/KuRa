import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import {
  createScene,
  renderModelToScene,
  applyCameraPose,
  applyLightSetup,
  exportImage,
  LIGHT_PRESETS,
  EDGE_PRESETS,
  DEFAULT_LIGHT_SETUP,
  DEFAULT_EDGE_SETUP,
  type SceneContext,
  type LightPresetId,
  type EdgePresetId,
  type EdgeRenderMode,
  type ExportFormat,
  type ModelRenderOptions,
  type CameraRenderOptions,
  type LightSetup,
} from './item-card-engine'

interface ItemCardRenderModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  modelPath: string
  onConfirm: (file: File) => void
}

function num2(v: number) {
  return Number(v.toFixed(2))
}

export function ItemCardRenderModal({
  open,
  onOpenChange,
  modelPath,
  onConfirm,
}: ItemCardRenderModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sceneRef = useRef<SceneContext | null>(null)
  const [status, setStatus] = useState('就绪')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const [exportWidth, setExportWidth] = useState(1024)
  const [exportHeight, setExportHeight] = useState(1024)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('png')
  const [exportQuality, setExportQuality] = useState(0.85)
  const [rotX, setRotX] = useState(0)
  const [rotY, setRotY] = useState(0)
  const [rotZ, setRotZ] = useState(0)
  const [povX, setPovX] = useState(0)
  const [povY, setPovY] = useState(0)
  const [fillRatio, setFillRatio] = useState(1)
  const [modelColorHex, setModelColorHex] = useState('#FFFFFF')
  const [compositionOffsetX, setCompositionOffsetX] = useState(0)
  const [compositionOffsetY, setCompositionOffsetY] = useState(0)

  const [lightPreset, setLightPreset] =
    useState<LightPresetId>('balanced')
  const [ambientI, setAmbientI] = useState(DEFAULT_LIGHT_SETUP.ambient)
  const [keyI, setKeyI] = useState(DEFAULT_LIGHT_SETUP.key)
  const [fillI, setFillI] = useState(DEFAULT_LIGHT_SETUP.fill)

  const [edgePreset, setEdgePreset] =
    useState<EdgePresetId>('productOutline')
  const [edgeMode, setEdgeMode] = useState<EdgeRenderMode>(
    DEFAULT_EDGE_SETUP.mode
  )
  const [edgeColorHex, setEdgeColorHex] = useState(DEFAULT_EDGE_SETUP.colorHex)
  const [edgeWidthPx, setEdgeWidthPx] = useState(DEFAULT_EDGE_SETUP.widthPx)
  const [hardEdgeThresholdDeg, setHardEdgeThresholdDeg] = useState(
    DEFAULT_EDGE_SETUP.hardEdgeThresholdDeg
  )

  const modelRenderOptions = useMemo<ModelRenderOptions>(
    () => ({
      modelRotationDeg: [rotX, rotY, rotZ],
      fillRatio,
      colorHex: modelColorHex,
      edgeMode,
      edgeColorHex,
      edgeWidthPx,
      hardEdgeThresholdDeg,
    }),
    [
      rotX, rotY, rotZ, fillRatio, modelColorHex,
      edgeMode, edgeColorHex, edgeWidthPx, hardEdgeThresholdDeg,
    ]
  )

  const cameraRenderOptions = useMemo<CameraRenderOptions>(
    () => ({
      povRotationDeg: [povX, povY, 0],
      compositionOffsetX,
      compositionOffsetY,
    }),
    [povX, povY, compositionOffsetX, compositionOffsetY]
  )

  const lightSetup = useMemo<LightSetup>(
    () => ({ ambient: ambientI, key: keyI, fill: fillI }),
    [ambientI, keyI, fillI]
  )

  // Scene init — wait for canvas to have non-zero size (Dialog animation)
  useEffect(() => {
    if (!open) return
    let disposed = false
    let ctx: SceneContext | null = null

    const tryInit = () => {
      const canvas = canvasRef.current
      if (!canvas || disposed) return
      if (canvas.clientWidth < 10 || canvas.clientHeight < 10) {
        requestAnimationFrame(tryInit)
        return
      }
      ctx = createScene(canvas)
      sceneRef.current = ctx
      setLoaded(false)
      setStatus('加载模型中…')

      const modelUrl = `/files/${modelPath}`
      renderModelToScene(ctx, modelUrl, modelRenderOptions, cameraRenderOptions)
        .then(() => {
          if (disposed) return
          setLoaded(true)
          setStatus('就绪')
        })
        .catch((e) => {
          if (!disposed) setStatus(`加载失败：${String(e)}`)
        })
    }

    requestAnimationFrame(tryInit)

    return () => {
      disposed = true
      ctx?.dispose()
      sceneRef.current = null
    }
    // only re-init when modal opens or model changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, modelPath])

  // Re-render on model option changes
  useEffect(() => {
    if (!open || !loaded || !sceneRef.current) return
    const ctx = sceneRef.current
    const modelUrl = `/files/${modelPath}`
    renderModelToScene(ctx, modelUrl, modelRenderOptions, cameraRenderOptions).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelRenderOptions])

  // Camera pose updates
  useEffect(() => {
    if (!sceneRef.current || !loaded) return
    applyCameraPose(sceneRef.current, cameraRenderOptions)
  }, [cameraRenderOptions, loaded])

  // Light updates
  useEffect(() => {
    if (!sceneRef.current || !loaded) return
    applyLightSetup(sceneRef.current, lightSetup)
    sceneRef.current.renderer.render(
      sceneRef.current.scene,
      sceneRef.current.camera
    )
  }, [lightSetup, loaded])

  // Light preset sync
  useEffect(() => {
    if (lightPreset === 'custom') return
    const p = LIGHT_PRESETS[lightPreset]
    setAmbientI(p.values.ambient)
    setKeyI(p.values.key)
    setFillI(p.values.fill)
  }, [lightPreset])

  // Edge preset sync
  useEffect(() => {
    if (edgePreset === 'custom') return
    const p = EDGE_PRESETS[edgePreset]
    setEdgeMode(p.mode)
    setEdgeColorHex(p.colorHex)
    setEdgeWidthPx(p.widthPx)
    setHardEdgeThresholdDeg(p.hardEdgeThresholdDeg)
  }, [edgePreset])

  // Drag to rotate POV
  const dragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startPovX: 0,
    startPovY: 0,
  })

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.button !== 0) return
      dragRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        startPovX: povX,
        startPovY: povY,
      }
      canvasRef.current?.setPointerCapture(e.pointerId)
    },
    [povX, povY]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!dragRef.current.active) return
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      setPovY(num2(dragRef.current.startPovY - dx * 0.18))
      setPovX(num2(dragRef.current.startPovX + dy * 0.18))
    },
    []
  )

  const handlePointerEnd = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!dragRef.current.active) return
      dragRef.current.active = false
      if (canvasRef.current?.hasPointerCapture(e.pointerId)) {
        canvasRef.current.releasePointerCapture(e.pointerId)
      }
    },
    []
  )

  const handleConfirm = useCallback(async () => {
    const ctx = sceneRef.current
    if (!ctx) return
    setBusy(true)
    setStatus('渲染中…')
    try {
      const blob = await exportImage(ctx, {
        width: exportWidth,
        height: exportHeight,
        format: exportFormat,
        quality: exportQuality,
      })
      const ext = exportFormat === 'jpeg' ? 'jpg' : exportFormat
      const mime =
        exportFormat === 'jpeg'
          ? 'image/jpeg'
          : exportFormat === 'webp'
            ? 'image/webp'
            : 'image/png'
      const sizeKB = (blob.size / 1024).toFixed(1)
      const file = new File([blob], `rendered-product.${ext}`, { type: mime })
      onConfirm(file)
      onOpenChange(false)
      toast.success(`渲染图片已注入（${sizeKB} KB），点击保存即可生效`)
    } catch (e) {
      setStatus(`渲染失败：${String(e)}`)
    } finally {
      setBusy(false)
    }
  }, [exportWidth, exportHeight, exportFormat, exportQuality, onConfirm, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className='!max-w-[98vw] !w-[98vw] h-[95vh] p-0 gap-0 flex flex-col'
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className='px-4 py-3 border-b shrink-0'>
          <DialogTitle>渲染产品图片</DialogTitle>
          <DialogDescription>
            调整渲染参数后，点击「确认使用」
          </DialogDescription>
        </DialogHeader>

        <div className='flex flex-1 min-h-0 overflow-hidden'>
          {/* Controls panel */}
          <div className='w-[280px] shrink-0 overflow-y-auto border-r p-3 space-y-3'>
            {/* Export size + format */}
            <div className='grid grid-cols-2 gap-2'>
              <div className='space-y-1'>
                <Label className='text-xs'>导出宽度</Label>
                <input
                  type='number'
                  min={64}
                  value={exportWidth}
                  onChange={(e) => setExportWidth(Number(e.target.value) || 1024)}
                  className='w-full rounded-md border bg-background px-2 py-1.5 text-xs'
                />
              </div>
              <div className='space-y-1'>
                <Label className='text-xs'>导出高度</Label>
                <input
                  type='number'
                  min={64}
                  value={exportHeight}
                  onChange={(e) => setExportHeight(Number(e.target.value) || 1024)}
                  className='w-full rounded-md border bg-background px-2 py-1.5 text-xs'
                />
              </div>
            </div>

            <div>
              <Label className='text-xs'>导出格式</Label>
              <Select
                value={exportFormat}
                onValueChange={(v) => setExportFormat(v as ExportFormat)}
              >
                <SelectTrigger className='mt-1 h-8 text-xs'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='png'>PNG（无损 / 透明背景）</SelectItem>
                  <SelectItem value='webp'>WebP（有损 / 体积小）</SelectItem>
                  <SelectItem value='jpeg'>JPEG（有损 / 兼容性好）</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {exportFormat !== 'png' && (
              <div>
                <Label className='text-[10px]'>
                  压缩质量（{Math.round(exportQuality * 100)}%）
                </Label>
                <Slider
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={[exportQuality]}
                  onValueChange={([v]) => setExportQuality(v!)}
                />
                <p className='mt-1 text-[10px] text-muted-foreground'>
                  {exportQuality >= 0.9
                    ? '高质量，文件较大'
                    : exportQuality >= 0.7
                      ? '推荐，质量与体积平衡'
                      : '高压缩，画质下降明显'}
                </p>
              </div>
            )}

            {/* Rotation */}
            <div>
              <Label className='text-xs'>模型旋转</Label>
              <div className='mt-1 grid grid-cols-3 gap-2'>
                {(['X', 'Y', 'Z'] as const).map((axis, i) => {
                  const val = [rotX, rotY, rotZ][i]!
                  const setter = [setRotX, setRotY, setRotZ][i]!
                  return (
                    <div key={axis} className='space-y-1'>
                      <span className='text-[10px] text-muted-foreground'>
                        {axis}
                      </span>
                      <input
                        type='number'
                        step={1}
                        value={val}
                        onChange={(e) => setter(Number(e.target.value) || 0)}
                        className='w-full rounded-md border bg-background px-2 py-1 text-xs'
                      />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Fill ratio */}
            <div>
              <Label className='text-xs'>
                模型占比（{fillRatio.toFixed(2)}x）
              </Label>
              <Slider
                min={0.4}
                max={1.6}
                step={0.05}
                value={[fillRatio]}
                onValueChange={([v]) => setFillRatio(v!)}
                className='mt-1'
              />
            </div>

            {/* Model color */}
            <div>
              <Label className='text-xs'>模型颜色</Label>
              <div className='mt-1 flex gap-2'>
                <input
                  type='text'
                  value={modelColorHex}
                  onChange={(e) => setModelColorHex(e.target.value.toUpperCase())}
                  className='flex-1 rounded-md border bg-background px-2 py-1 text-xs uppercase'
                />
                <input
                  type='color'
                  value={modelColorHex}
                  onChange={(e) => setModelColorHex(e.target.value.toUpperCase())}
                  className='h-8 w-8 shrink-0 cursor-pointer rounded border p-0.5'
                />
              </div>
            </div>

            {/* Light preset */}
            <div>
              <Label className='text-xs'>光照预设</Label>
              <Select
                value={lightPreset}
                onValueChange={(v) => setLightPreset(v as LightPresetId)}
              >
                <SelectTrigger className='mt-1 h-8 text-xs'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='balanced'>
                    {LIGHT_PRESETS.balanced.label}
                  </SelectItem>
                  <SelectItem value='highContrast'>
                    {LIGHT_PRESETS.highContrast.label}
                  </SelectItem>
                  <SelectItem value='softFill'>
                    {LIGHT_PRESETS.softFill.label}
                  </SelectItem>
                  <SelectItem value='custom'>自定义</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Light sliders */}
            <div className='space-y-2'>
              <div>
                <Label className='text-[10px]'>
                  环境光（{ambientI.toFixed(2)}）
                </Label>
                <Slider
                  min={0}
                  max={2.5}
                  step={0.05}
                  value={[ambientI]}
                  onValueChange={([v]) => {
                    setLightPreset('custom')
                    setAmbientI(v!)
                  }}
                />
              </div>
              <div>
                <Label className='text-[10px]'>
                  主光（{keyI.toFixed(2)}）
                </Label>
                <Slider
                  min={0}
                  max={2.5}
                  step={0.05}
                  value={[keyI]}
                  onValueChange={([v]) => {
                    setLightPreset('custom')
                    setKeyI(v!)
                  }}
                />
              </div>
              <div>
                <Label className='text-[10px]'>
                  补光（{fillI.toFixed(2)}）
                </Label>
                <Slider
                  min={0}
                  max={2.5}
                  step={0.05}
                  value={[fillI]}
                  onValueChange={([v]) => {
                    setLightPreset('custom')
                    setFillI(v!)
                  }}
                />
              </div>
            </div>

            {/* Edge preset */}
            <div>
              <Label className='text-xs'>描边预设</Label>
              <Select
                value={edgePreset}
                onValueChange={(v) => setEdgePreset(v as EdgePresetId)}
              >
                <SelectTrigger className='mt-1 h-8 text-xs'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='productOutline'>
                    {EDGE_PRESETS.productOutline.label}
                  </SelectItem>
                  <SelectItem value='structure'>
                    {EDGE_PRESETS.structure.label}
                  </SelectItem>
                  <SelectItem value='technical'>
                    {EDGE_PRESETS.technical.label}
                  </SelectItem>
                  <SelectItem value='custom'>自定义</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Edge mode */}
            <div>
              <Label className='text-xs'>描边模式</Label>
              <Select
                value={edgeMode}
                onValueChange={(v) => {
                  setEdgePreset('custom')
                  setEdgeMode(v as EdgeRenderMode)
                }}
              >
                <SelectTrigger className='mt-1 h-8 text-xs'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='none'>关闭</SelectItem>
                  <SelectItem value='hardEdges'>轮廓硬边</SelectItem>
                  <SelectItem value='wireframe'>框架线</SelectItem>
                  <SelectItem value='cad'>建模线</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {edgeMode === 'hardEdges' && (
              <div>
                <Label className='text-[10px]'>
                  硬边阈值（{hardEdgeThresholdDeg}°）
                </Label>
                <Slider
                  min={1}
                  max={180}
                  step={1}
                  value={[hardEdgeThresholdDeg]}
                  onValueChange={([v]) => {
                    setEdgePreset('custom')
                    setHardEdgeThresholdDeg(v!)
                  }}
                />
              </div>
            )}

            {/* Edge color + width */}
            <div>
              <Label className='text-xs'>边线颜色</Label>
              <div className='mt-1 flex gap-2'>
                <input
                  type='text'
                  value={edgeColorHex}
                  onChange={(e) => {
                    setEdgePreset('custom')
                    setEdgeColorHex(e.target.value.toUpperCase())
                  }}
                  className='flex-1 rounded-md border bg-background px-2 py-1 text-xs uppercase'
                />
                <input
                  type='color'
                  value={edgeColorHex}
                  onChange={(e) => {
                    setEdgePreset('custom')
                    setEdgeColorHex(e.target.value.toUpperCase())
                  }}
                  className='h-8 w-8 shrink-0 cursor-pointer rounded border p-0.5'
                />
              </div>
            </div>

            <div>
              <Label className='text-[10px]'>
                边线粗细（{edgeWidthPx.toFixed(1)}px）
              </Label>
              <Slider
                min={0.5}
                max={6}
                step={0.1}
                value={[edgeWidthPx]}
                onValueChange={([v]) => {
                  setEdgePreset('custom')
                  setEdgeWidthPx(v!)
                }}
              />
            </div>

            {/* Composition offset */}
            <div className='grid grid-cols-2 gap-2'>
              <div className='space-y-1'>
                <Label className='text-[10px]'>构图偏移 X</Label>
                <input
                  type='number'
                  step={0.05}
                  value={compositionOffsetX}
                  onChange={(e) =>
                    setCompositionOffsetX(Number(e.target.value) || 0)
                  }
                  className='w-full rounded-md border bg-background px-2 py-1 text-xs'
                />
              </div>
              <div className='space-y-1'>
                <Label className='text-[10px]'>构图偏移 Y</Label>
                <input
                  type='number'
                  step={0.05}
                  value={compositionOffsetY}
                  onChange={(e) =>
                    setCompositionOffsetY(Number(e.target.value) || 0)
                  }
                  className='w-full rounded-md border bg-background px-2 py-1 text-xs'
                />
              </div>
            </div>
          </div>

          {/* Preview canvas */}
          <div className='flex-1 flex flex-col min-w-0 bg-[#faf9f7] dark:bg-neutral-900'>
            <p className='px-3 py-2 text-xs text-muted-foreground'>
              拖动画布旋转视角 · {status}
            </p>
            <div className='flex-1 min-h-0 px-3 pb-3'>
              <canvas
                ref={canvasRef}
                className='h-full w-full touch-none cursor-grab rounded-lg active:cursor-grabbing'
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
              />
            </div>
          </div>
        </div>

        <DialogFooter className='px-4 py-3 border-t shrink-0'>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={busy || !loaded}>
            {busy && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            确认使用
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
