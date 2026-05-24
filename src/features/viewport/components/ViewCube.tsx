import { useState, useMemo, useCallback, useRef } from "react"
import * as THREE from "three"
import { GizmoHelper } from "@react-three/drei/core/GizmoHelper"
import { ThreeEvent } from "@react-three/fiber"

// Shared ref — the main scene registers a tween function here
export const cameraTweenRef: {
  current: ((dir: THREE.Vector3) => void) | null
} = { current: null }

const H = 0.5
const SCALE_MOBILE = 38
const SCALE_DESKTOP = 48
const MARGIN = 0.17
const FACE_SIZE = 1 - 2 * MARGIN
const HIGHLIGHT = "#4da6ff"

const MARGIN_MOBILE: [number, number] = [36, 36]
const MARGIN_DESKTOP: [number, number] = [48, 48]

const LABELS = ["右", "左", "上", "下", "前", "后"]

// ── Zone detection from intersection point ──

interface ZoneInfo {
  faceIdx: number
  zone: "face" | "edge" | "corner"
  direction: THREE.Vector3
  faceAxis: number
  faceSign: number
  borders: { axisIdx: number; sign: number }[]
  otherAxes: number[]
}

function detectZone(localPoint: THREE.Vector3, normal: THREE.Vector3): ZoneInfo {
  const faceAxis = Math.abs(normal.x) > 0.5 ? 0 : Math.abs(normal.y) > 0.5 ? 1 : 2
  const faceSign = normal.getComponent(faceAxis) > 0 ? 1 : -1
  const faceIdx = faceAxis * 2 + (faceSign < 0 ? 1 : 0)
  const otherAxes = [0, 1, 2].filter((a) => a !== faceAxis)

  const direction = normal.clone()
  const borders: { axisIdx: number; sign: number }[] = []

  for (let k = 0; k < 2; k++) {
    const v = localPoint.getComponent(otherAxes[k]!)
    if (v > H - MARGIN) {
      direction.setComponent(otherAxes[k]!, 1)
      borders.push({ axisIdx: k, sign: 1 })
    } else if (v < -H + MARGIN) {
      direction.setComponent(otherAxes[k]!, -1)
      borders.push({ axisIdx: k, sign: -1 })
    }
  }

  const zone = borders.length >= 2 ? "corner" : borders.length === 1 ? "edge" : "face"
  return { faceIdx, zone, direction: direction.normalize(), faceAxis, faceSign, borders, otherAxes }
}

// ── Face texture with subtle zone grid ──

function makeFaceTex(label: string): THREE.CanvasTexture {
  const s = 256
  const c = document.createElement("canvas")
  c.width = s
  c.height = s
  const ctx = c.getContext("2d")!

  ctx.fillStyle = "#f2f2f2"
  ctx.fillRect(0, 0, s, s)

  const m = Math.round(s * MARGIN)
  ctx.strokeStyle = "#dcdcdc"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(m, 0); ctx.lineTo(m, s)
  ctx.moveTo(s - m, 0); ctx.lineTo(s - m, s)
  ctx.moveTo(0, m); ctx.lineTo(s, m)
  ctx.moveTo(0, s - m); ctx.lineTo(s, s - m)
  ctx.stroke()

  ctx.fillStyle = "#666"
  ctx.font = `600 ${s * 0.3}px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(label, s / 2, s / 2 + 2)

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// ── Overlay (highlight) geometry on the cube surface ──

interface OverlayDef {
  position: [number, number, number]
  rotation: [number, number, number]
  size: [number, number]
}

function computeOverlays(z: ZoneInfo): OverlayDef[] {
  const raw = [0, 0, 0]
  raw[z.faceAxis] = z.faceSign
  for (const b of z.borders) raw[z.otherAxes[b.axisIdx]!] = b.sign

  const out: OverlayDef[] = []

  for (let axis = 0; axis < 3; axis++) {
    const fSign = raw[axis]!
    if (fSign === 0) continue

    const others = [0, 1, 2].filter((a) => a !== axis)
    const pos: [number, number, number] = [0, 0, 0]
    pos[axis] = fSign * (H + 0.002)

    let sU = FACE_SIZE
    let sV = FACE_SIZE

    for (let k = 0; k < 2; k++) {
      if (raw[others[k]!]! !== 0) {
        pos[others[k]!] = raw[others[k]!]! * (H - MARGIN / 2)
        if (k === 0) sU = MARGIN; else sV = MARGIN
      }
    }

    let rotation: [number, number, number]
    let size: [number, number]

    if (axis === 2) {
      rotation = fSign < 0 ? [0, Math.PI, 0] : [0, 0, 0]
      size = [sU, sV]
    } else if (axis === 0) {
      rotation = [0, (fSign * Math.PI) / 2, 0]
      size = [sV, sU]
    } else {
      rotation = [(-fSign * Math.PI) / 2, 0, 0]
      size = [sU, sV]
    }

    out.push({ position: pos, rotation, size })
  }

  return out
}

// ── Edge outline ──

const edgesGeo = /* @__PURE__ */ new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1))
const noRaycast = () => {}

// ── Cube body with face textures ──

function CubeBody() {
  const textures = useMemo(() => LABELS.map(makeFaceTex), [])

  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      {textures.map((tex, i) => (
        <meshBasicMaterial key={i} attach={`material-${i}`} map={tex} toneMapped={false} />
      ))}
    </mesh>
  )
}

// ── Inner content (must be inside GizmoHelper for rotation sync) ──

function ViewCubeInner({ mobile }: { mobile?: boolean }) {
  const hitRef = useRef<THREE.Mesh>(null)
  const rootRef = useRef<THREE.Group>(null)
  const [hover, setHover] = useState<ZoneInfo | null>(null)
  const lastClickTime = useRef(0)

  const getCameraLookDir = useCallback(() => {
    const gizmoGroup = rootRef.current?.parent
    if (!gizmoGroup) return null
    return new THREE.Vector3(0, 0, -1).applyQuaternion(
      gizmoGroup.quaternion.clone().invert(),
    )
  }, [])

  const onPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      if (!e.face || !hitRef.current) return
      const local = hitRef.current.worldToLocal(e.point.clone())
      setHover(detectZone(local, e.face.normal))
      document.body.style.cursor = "pointer"
    },
    [],
  )

  const onPointerLeave = useCallback(() => {
    setHover(null)
    document.body.style.cursor = ""
  }, [])

  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      if (!e.face || !hitRef.current || !cameraTweenRef.current) return

      const now = Date.now()
      if (now - lastClickTime.current < 600) return

      const local = hitRef.current.worldToLocal(e.point.clone())
      const z = detectZone(local, e.face.normal)
      const dir = z.direction

      const lookDir = getCameraLookDir()
      if (lookDir && lookDir.dot(dir) > 0.95) return

      lastClickTime.current = now
      cameraTweenRef.current(dir)
    },
    [getCameraLookDir],
  )

  const overlays = hover ? computeOverlays(hover) : []

  return (
    <group ref={rootRef} scale={mobile ? SCALE_MOBILE : SCALE_DESKTOP}>
      <CubeBody />

      <lineSegments geometry={edgesGeo}>
        <lineBasicMaterial color="#bbb" toneMapped={false} />
      </lineSegments>

      {/* Invisible hit zone covering the whole cube */}
      <mesh
        ref={hitRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
      >
        <boxGeometry args={[1.002, 1.002, 1.002]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {/* Hover highlight overlays — one per involved face */}
      {overlays.map((o, i) => (
        <mesh key={i} position={o.position} rotation={o.rotation} raycast={noRaycast}>
          <planeGeometry args={o.size} />
          <meshBasicMaterial
            color={HIGHLIGHT}
            transparent
            opacity={0.28}
            depthWrite={false}
            toneMapped={false}
            polygonOffset
            polygonOffsetFactor={-4}
          />
        </mesh>
      ))}
    </group>
  )
}

// ── Exported component ──

export function ViewCube({ mobile }: { mobile?: boolean }) {
  return (
    <GizmoHelper alignment="bottom-right" margin={mobile ? MARGIN_MOBILE : MARGIN_DESKTOP}>
      <ViewCubeInner mobile={mobile} />
    </GizmoHelper>
  )
}
