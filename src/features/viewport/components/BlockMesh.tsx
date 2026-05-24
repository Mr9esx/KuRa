import { useEffect, useMemo } from "react"
import * as THREE from "three"
import { useLoader } from "@react-three/fiber"
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js"
import type { BlockCatalogItem } from "@/types/catalog"

const WALL_T = 4

interface BlockMeshProps {
  block: BlockCatalogItem
  color: string
  roughness: number
  onReady?: () => void
}

export function BlockMesh({ block, color, roughness, onReady }: BlockMeshProps) {
  const modelUrl = useMemo(() => {
    const base = import.meta.env.BASE_URL
    return `${base}${block.modelPath.replace(/^\//, "")}`
  }, [block.modelPath])
  const loaded = useLoader(ThreeMFLoader, modelUrl)
  const [innerW, innerD] = block.innerSize
  const outerW = innerW + WALL_T * 2
  const outerD = innerD + WALL_T * 2
  const targetH = block.height

  const rotation = useMemo<[number, number, number]>(() => {
    const [rx, ry, rz] = block.modelRotation ?? [0, 0, 0]
    return [
      THREE.MathUtils.degToRad(rx),
      THREE.MathUtils.degToRad(ry),
      THREE.MathUtils.degToRad(rz),
    ]
  }, [block.modelRotation])

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
    const s = new THREE.Vector3()
    box.getSize(s)
    const hookDepth = Math.max(0, block.modelBackHookDepth ?? 0)
    const effectiveMinZ = box.min.z + hookDepth
    const effectiveMaxZ = box.max.z
    const effectiveDepth = Math.max(1e-6, effectiveMaxZ - effectiveMinZ)
    const effectiveCenterZ = (effectiveMinZ + effectiveMaxZ) * 0.5
    const c = new THREE.Vector3(
      (box.min.x + box.max.x) * 0.5,
      (box.min.y + box.max.y) * 0.5,
      effectiveCenterZ,
    )
    return { center: c, minY: box.min.y, size: new THREE.Vector3(s.x, s.y, effectiveDepth) }
  }, [model, block.modelBackHookDepth])

  const scale = useMemo<[number, number, number]>(() => {
    const sx = size.x > 0 ? outerW / size.x : Infinity
    const sy = size.y > 0 ? targetH / size.y : Infinity
    const sz = size.z > 0 ? outerD / size.z : Infinity
    return [
      Number.isFinite(sx) && sx > 0 ? sx : 1,
      Number.isFinite(sy) && sy > 0 ? sy : 1,
      Number.isFinite(sz) && sz > 0 ? sz : 1,
    ]
  }, [outerW, targetH, outerD, size.x, size.y, size.z])

  useEffect(() => {
    model.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      obj.material = material
      obj.castShadow = true
      obj.receiveShadow = true
    })
  }, [material, model])

  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    onReady?.()
  }, [onReady])

  return (
    <group scale={scale}>
      <primitive object={model} position={[-center.x, -minY, -center.z]} />
    </group>
  )
}
