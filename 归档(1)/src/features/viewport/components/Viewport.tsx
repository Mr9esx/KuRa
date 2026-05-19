import { useRef, useEffect } from "react"
import * as THREE from "three"
import { Canvas, useThree, useFrame } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import { useEditorStore } from "@/stores/editor-store"
import { getMaterialColor } from "@/config/materials"
import { findItemBySku } from "@/hooks/use-catalog"
import { BlockMesh } from "./BlockMesh"
import { CellGrid } from "./CellGrid"
import { PlacedItems } from "./PlacedItems"
import { GhostPreview } from "./GhostPreview"
import { ViewCube, cameraTweenRef } from "./ViewCube"

function CameraAnimator() {
  const camera = useThree((s) => s.camera)
  const defaultControls = useThree((s) => s.controls) as any
  const invalidate = useThree((s) => s.invalidate)
  const animRef = useRef(false)

  useEffect(() => {
    const _dummy = new THREE.Object3D()

    cameraTweenRef.current = (direction: THREE.Vector3) => {
      if (animRef.current) return
      const controls = defaultControls
      const focusPoint: THREE.Vector3 = controls?.target?.clone() ?? new THREE.Vector3()
      const radius = camera.position.distanceTo(focusPoint)

      const q1 = camera.quaternion.clone()

      // Custom up vector to avoid gimbal lock at poles
      const up = new THREE.Vector3()
      if (Math.abs(direction.y) > 0.9 && Math.abs(direction.x) < 0.3 && Math.abs(direction.z) < 0.3) {
        up.set(0, 0, direction.y > 0 ? -1 : 1)
      } else {
        up.set(0, 1, 0)
      }

      // Match GizmoHelper convention: dummy at origin looks TOWARDS direction
      // This gives camera position = focusPoint - direction * radius
      _dummy.position.set(0, 0, 0)
      _dummy.up.copy(up)
      _dummy.lookAt(direction)
      const q2 = _dummy.quaternion.clone()

      if (q1.dot(q2) < 0) q2.set(-q2.x, -q2.y, -q2.z, -q2.w)
      if (q1.angleTo(q2) < 0.02) return

      animRef.current = true
      if (controls) controls.enabled = false
      const defaultUp = camera.up.clone()
      const start = performance.now()
      const duration = 500

      const tick = () => {
        const t = Math.min((performance.now() - start) / duration, 1)
        const ease = 1 - Math.pow(1 - t, 3)
        const q = q1.clone().slerp(q2, ease)

        camera.position.set(0, 0, 1).applyQuaternion(q).multiplyScalar(radius).add(focusPoint)
        camera.up.set(0, 1, 0).applyQuaternion(q).normalize()
        camera.quaternion.copy(q)
        invalidate()

        if (t < 1) {
          requestAnimationFrame(tick)
        } else {
          camera.up.copy(defaultUp)
          if (controls) {
            controls.enabled = true
            controls.update()
          }
          invalidate()
          animRef.current = false
        }
      }

      tick()
    }

    return () => {
      cameraTweenRef.current = null
    }
  }, [camera, defaultControls, invalidate])

  return null
}

function Scene() {
  const block = useEditorStore((s) => s.block)
  const placements = useEditorStore((s) => s.placements)
  const selectedSku = useEditorStore((s) => s.selectedCatalogSku)
  const hoveredCell = useEditorStore((s) => s.hoveredCell)
  const colorId = useEditorStore((s) => s.materialColorId)

  const setHoveredCell = useEditorStore((s) => s.setHoveredCell)
  const placeItem = useEditorStore((s) => s.placeItem)

  const mat = getMaterialColor(colorId)
  const selectedItem = selectedSku
    ? findItemBySku(selectedSku)
    : undefined

  const deg = (d: number) => (d * Math.PI) / 180

  return (
    <>
      <CameraAnimator />

      <ambientLight intensity={0.65} />
      <directionalLight position={[200, 400, 150]} intensity={0.85} />
      <directionalLight position={[-100, 200, -200]} intensity={0.3} />

      <OrbitControls
        makeDefault
        minPolarAngle={deg(10)}
        maxPolarAngle={deg(80)}
        minDistance={150}
        maxDistance={800}
        target={[0, 20, 0]}
      />

      {/* Ground reference */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -4.5, 0]}>
        <planeGeometry args={[500, 500]} />
        <meshStandardMaterial color="#f0eeeb" roughness={1} />
      </mesh>

      <BlockMesh block={block} color={mat.hex} roughness={mat.roughness} />
      <CellGrid
        block={block}
        onCellHover={setHoveredCell}
        onCellClick={placeItem}
      />
      <PlacedItems
        block={block}
        placements={placements}
        color={mat.hex}
        roughness={mat.roughness}
      />

      <ViewCube />

      {hoveredCell && selectedItem && (
        <GhostPreview
          block={block}
          cell={hoveredCell}
          item={selectedItem}
          placements={placements}
        />
      )}
    </>
  )
}

const fpsRef: { current: HTMLSpanElement | null } = { current: null }

function FpsTracker() {
  const frames = useRef(0)
  const lastTime = useRef(performance.now())

  useFrame(() => {
    frames.current++
    const now = performance.now()
    if (now - lastTime.current >= 1000) {
      if (fpsRef.current) {
        fpsRef.current.textContent = `FPS: ${frames.current}`
      }
      frames.current = 0
      lastTime.current = now
    }
  })

  return null
}

export function Viewport() {
  return (
    <div className="relative h-full w-full bg-[#faf9f7]">
      <Canvas
        frameloop="demand"
        camera={{ fov: 45, position: [280, 250, 280], near: 1, far: 2000 }}
        gl={{ antialias: true }}
      >
        <Scene />
        <FpsTracker />
      </Canvas>
      <ViewportHUD />
      <span
        ref={(el) => { fpsRef.current = el }}
        className="pointer-events-none absolute right-3 bottom-3 text-xs text-muted-foreground"
      >
        FPS: --
      </span>
    </div>
  )
}

function ViewportHUD() {
  const block = useEditorStore((s) => s.block)
  const placements = useEditorStore((s) => s.placements)

  const totalCells = block.cellGrid[0] * block.cellGrid[1]
  const usedCells = placements.reduce(
    (sum, p) => sum + p.gridSize[0] * p.gridSize[1],
    0,
  )

  return (
    <div className="pointer-events-none absolute top-3 left-3">
      <div className="rounded-lg bg-white/80 px-3 py-2 text-xs backdrop-blur-sm">
        <div className="font-medium text-foreground">{block.name}</div>
        <div className="text-muted-foreground">
          {block.innerSize[0]}×{block.innerSize[1]}mm · Cell {usedCells}/
          {totalCells}
        </div>
      </div>
    </div>
  )
}
