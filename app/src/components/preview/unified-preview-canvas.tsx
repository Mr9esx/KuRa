import { Canvas, type RootState } from "@react-three/fiber"
import type { ReactNode } from "react"
import type * as THREE from "three"
import { PREVIEW_LIGHT, PREVIEW_TONE } from "@/config/preview-rendering"

interface PreviewLightOverride {
  ambient?: number
  key?: number
  fill?: number
  keyPosition?: [number, number, number]
  fillPosition?: [number, number, number]
}

interface UnifiedPreviewCanvasProps {
  camera: {
    fov: number
    position: [number, number, number]
    near: number
    far: number
  }
  light?: PreviewLightOverride
  onPointerMissed?: (event: MouseEvent) => void
  onCreated?: (state: RootState) => void
  children: ReactNode
}

export function UnifiedPreviewCanvas({
  camera,
  light,
  onPointerMissed,
  onCreated,
  children,
}: UnifiedPreviewCanvasProps) {
  const mergedLight = {
    ambient: light?.ambient ?? PREVIEW_LIGHT.ambient,
    key: light?.key ?? PREVIEW_LIGHT.key,
    fill: light?.fill ?? PREVIEW_LIGHT.fill,
    keyPosition: light?.keyPosition ?? [...PREVIEW_LIGHT.keyPosition] as [number, number, number],
    fillPosition: light?.fillPosition ?? [...PREVIEW_LIGHT.fillPosition] as [number, number, number],
  }

  return (
    <Canvas
      camera={camera}
      gl={{ antialias: true, logarithmicDepthBuffer: true }}
      onCreated={(state) => {
        const gl = state.gl as THREE.WebGLRenderer
        gl.localClippingEnabled = true
        gl.toneMappingExposure = PREVIEW_TONE.exposure
        const canvas = gl.domElement
        canvas.classList.add("touch-none", "select-none")
        canvas.style.touchAction = "none"
        canvas.style.userSelect = "none"
        canvas.style.setProperty("-webkit-user-select", "none")
        canvas.style.setProperty("-webkit-touch-callout", "none")
        canvas.oncontextmenu = (event) => event.preventDefault()
        onCreated?.(state)
      }}
      onPointerMissed={onPointerMissed}
    >
      <ambientLight intensity={mergedLight.ambient} />
      <directionalLight position={mergedLight.keyPosition} intensity={mergedLight.key} />
      <directionalLight position={mergedLight.fillPosition} intensity={mergedLight.fill} />
      {children}
    </Canvas>
  )
}

