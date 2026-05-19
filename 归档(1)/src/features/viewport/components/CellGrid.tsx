import { useCallback, useMemo } from "react"
import * as THREE from "three"
import type { ThreeEvent } from "@react-three/fiber"
import type { BlockCatalogItem } from "@/types/catalog"
import { CELL_SIZE } from "@/config/catalog"

interface CellGridProps {
  block: BlockCatalogItem
  onCellHover: (cell: [number, number] | null) => void
  onCellClick: (col: number, row: number) => void
}

export function CellGrid({ block, onCellHover, onCellClick }: CellGridProps) {
  const [innerW, innerD] = block.innerSize
  const [cols, rows] = block.cellGrid

  const linePositions = useMemo(() => {
    const pts: number[] = []
    const halfW = innerW / 2
    const halfD = innerD / 2
    const y = 0.3

    for (let c = 0; c <= cols; c++) {
      const x = c * CELL_SIZE - halfW
      pts.push(x, y, -halfD, x, y, halfD)
    }
    for (let r = 0; r <= rows; r++) {
      const z = r * CELL_SIZE - halfD
      pts.push(-halfW, y, z, halfW, y, z)
    }
    return new Float32Array(pts)
  }, [innerW, innerD, cols, rows])

  const toCell = useCallback(
    (point: THREE.Vector3): [number, number] | null => {
      const col = Math.floor((point.x + innerW / 2) / CELL_SIZE)
      const row = Math.floor((point.z + innerD / 2) / CELL_SIZE)
      if (col < 0 || col >= cols || row < 0 || row >= rows) return null
      return [col, row]
    },
    [innerW, innerD, cols, rows],
  )

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      onCellHover(toCell(e.point))
    },
    [toCell, onCellHover],
  )

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      const cell = toCell(e.point)
      if (cell) onCellClick(cell[0], cell[1])
    },
    [toCell, onCellClick],
  )

  return (
    <group>
      {/* Grid lines */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={linePositions.length / 3}
            array={linePositions}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#aaa" transparent opacity={0.35} />
      </lineSegments>

      {/* Invisible interaction plane */}
      <mesh
        position={[0, 0.2, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => onCellHover(null)}
        onClick={handleClick}
      >
        <planeGeometry args={[innerW, innerD]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  )
}
