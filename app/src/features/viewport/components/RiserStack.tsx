import { useEffect, useMemo } from "react"
import * as THREE from "three"
import { useLoader } from "@react-three/fiber"
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js"
import type { Placement, RiserPiece } from "@/types/editor"
import { CELL_SIZE } from "@/config/catalog"
import { findRiserBySku } from "@/hooks/use-catalog"

const RISER_BRIGHTNESS_FACTOR = 0.75

interface RiserStackProps {
  placement: Placement
  worldX: number
  worldZ: number
  baseY: number
  color: string
  roughness: number
}

interface RiserPieceModelProps {
  piece: RiserPiece
  layerY: number
  layerHeight: number
  itemGridSize: [number, number]
  worldX: number
  worldZ: number
  color: string
  roughness: number
}

function darkenColor(hex: string, factor: number): string {
  const c = new THREE.Color(hex)
  c.multiplyScalar(factor)
  return `#${c.getHexString()}`
}

function RiserPieceModel({
  piece,
  layerY,
  layerHeight,
  itemGridSize,
  worldX,
  worldZ,
  color,
  roughness,
}: RiserPieceModelProps) {
  const catalog = findRiserBySku(piece.sku)
  const modelUrl = useMemo(() => {
    if (!catalog?.modelPath) return null
    const base = import.meta.env.BASE_URL
    return `${base}${catalog.modelPath.replace(/^\//, "")}`
  }, [catalog?.modelPath])

  const darkenedColor = useMemo(
    () => darkenColor(color, RISER_BRIGHTNESS_FACTOR),
    [color],
  )

  const pieceW = piece.gridSize[0] * CELL_SIZE
  const pieceD = piece.gridSize[1] * CELL_SIZE

  const offsetX =
    (piece.cell[0] + piece.gridSize[0] / 2 - itemGridSize[0] / 2) * CELL_SIZE
  const offsetZ =
    (piece.cell[1] + piece.gridSize[1] / 2 - itemGridSize[1] / 2) * CELL_SIZE

  const px = worldX + offsetX
  const pz = worldZ + offsetZ

  if (!modelUrl) {
    return (
      <mesh position={[px, layerY + layerHeight / 2, pz]}>
        <boxGeometry args={[pieceW, layerHeight, pieceD]} />
        <meshStandardMaterial
          color={darkenedColor}
          roughness={roughness}
          metalness={0}
        />
      </mesh>
    )
  }

  return (
    <RiserPiece3MF
      modelUrl={modelUrl}
      modelRotation={catalog?.modelRotation}
      pieceGridSize={piece.gridSize}
      layerHeight={layerHeight}
      px={px}
      py={layerY}
      pz={pz}
      color={darkenedColor}
      roughness={roughness}
    />
  )
}

interface RiserPiece3MFProps {
  modelUrl: string
  modelRotation?: [number, number, number]
  pieceGridSize: [number, number]
  layerHeight: number
  px: number
  py: number
  pz: number
  color: string
  roughness: number
}

function RiserPiece3MF({
  modelUrl,
  modelRotation,
  pieceGridSize,
  layerHeight,
  px,
  py,
  pz,
  color,
  roughness,
}: RiserPiece3MFProps) {
  const loaded = useLoader(ThreeMFLoader, modelUrl)
  const rotation = useMemo<[number, number, number]>(() => {
    const [rx, ry, rz] = modelRotation ?? [0, 0, 0]
    return [
      THREE.MathUtils.degToRad(rx),
      THREE.MathUtils.degToRad(ry),
      THREE.MathUtils.degToRad(rz),
    ]
  }, [modelRotation])

  const model = useMemo(() => {
    const cloned = loaded.clone(true)
    cloned.rotation.set(rotation[0], rotation[1], rotation[2])
    return cloned
  }, [loaded, rotation])

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness: 0,
      }),
    [color, roughness],
  )

  const { center, minY, size } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model)
    const c = new THREE.Vector3()
    const s = new THREE.Vector3()
    box.getCenter(c)
    box.getSize(s)
    return { center: c, minY: box.min.y, size: s }
  }, [model])

  const scale = useMemo<[number, number, number]>(() => {
    const targetW = pieceGridSize[0] * CELL_SIZE
    const targetD = pieceGridSize[1] * CELL_SIZE
    const targetH = layerHeight
    const sx = size.x > 0 ? targetW / size.x : Infinity
    const sy = size.y > 0 ? targetH / size.y : Infinity
    const sz = size.z > 0 ? targetD / size.z : Infinity
    const uniformScale = Math.min(sx, sy, sz)
    const safeScale =
      Number.isFinite(uniformScale) && uniformScale > 0 ? uniformScale : 1
    return [safeScale, safeScale, safeScale]
  }, [pieceGridSize, layerHeight, size.x, size.y, size.z])

  useEffect(() => {
    model.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      obj.material = material
      obj.castShadow = true
      obj.receiveShadow = true
    })
  }, [material, model])

  useEffect(() => {
    return () => material.dispose()
  }, [material])

  return (
    <group position={[px, py, pz]} scale={scale}>
      <primitive object={model} position={[-center.x, -minY, -center.z]} />
    </group>
  )
}

export function RiserStack({
  placement,
  worldX,
  worldZ,
  baseY,
  color,
  roughness,
}: RiserStackProps) {
  let currentY = 0

  return (
    <group position={[0, baseY, 0]}>
      {placement.risers.map((layer, layerIdx) => {
        const layerY = currentY
        currentY += layer.height

        return (
          <group key={layerIdx}>
            {layer.pieces.map((piece, pieceIdx) => (
              <RiserPieceModel
                key={pieceIdx}
                piece={piece}
                layerY={layerY}
                layerHeight={layer.height}
                itemGridSize={placement.gridSize}
                worldX={worldX}
                worldZ={worldZ}
                color={color}
                roughness={roughness}
              />
            ))}
          </group>
        )
      })}
    </group>
  )
}
