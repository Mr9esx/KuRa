import { useMemo } from "react"
import * as THREE from "three"
import type { BlockCatalogItem } from "@/types/catalog"

const WALL_T = 4
const FLOOR_T = 4
const FRONT_H = 12
const BACK_H = 72

interface BlockMeshProps {
  block: BlockCatalogItem
  color: string
  roughness: number
}

export function BlockMesh({ block, color, roughness }: BlockMeshProps) {
  const [innerW, innerD] = block.innerSize
  const outerW = innerW + WALL_T * 2
  const outerD = innerD + WALL_T * 2

  const { leftWallGeo, rightWallGeo } = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(0, -FLOOR_T)
    shape.lineTo(outerD, -FLOOR_T)
    shape.lineTo(outerD, FRONT_H - FLOOR_T)
    shape.lineTo(0, BACK_H - FLOOR_T)
    shape.closePath()

    const opts: THREE.ExtrudeGeometryOptions = {
      depth: WALL_T,
      bevelEnabled: false,
    }

    const left = new THREE.ExtrudeGeometry(shape, opts)
    left.rotateY(-Math.PI / 2)
    left.translate(-innerW / 2, 0, -outerD / 2)

    const right = new THREE.ExtrudeGeometry(shape, opts)
    right.rotateY(-Math.PI / 2)
    right.translate(innerW / 2 + WALL_T, 0, -outerD / 2)

    return { leftWallGeo: left, rightWallGeo: right }
  }, [innerW, innerD, outerD])

  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 }),
    [color, roughness],
  )

  return (
    <group>
      {/* Floor */}
      <mesh position={[0, -FLOOR_T / 2, 0]} material={mat}>
        <boxGeometry args={[outerW, FLOOR_T, outerD]} />
      </mesh>

      {/* Back wall (tall, negative Z) */}
      <mesh
        position={[0, (BACK_H - FLOOR_T) / 2, -(innerD / 2 + WALL_T / 2)]}
        material={mat}
      >
        <boxGeometry args={[outerW, BACK_H - FLOOR_T, WALL_T]} />
      </mesh>

      {/* Front wall (short, positive Z, facing camera) */}
      <mesh
        position={[0, (FRONT_H - FLOOR_T) / 2, innerD / 2 + WALL_T / 2]}
        material={mat}
      >
        <boxGeometry args={[outerW, FRONT_H - FLOOR_T, WALL_T]} />
      </mesh>

      {/* Side walls */}
      <mesh geometry={leftWallGeo} material={mat} />
      <mesh geometry={rightWallGeo} material={mat} />
    </group>
  )
}
