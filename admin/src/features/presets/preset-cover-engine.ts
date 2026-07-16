import * as THREE from 'three'
import {
  createScene,
  applyLightSetup,
  applyCameraPose,
  exportImage,
  type SceneContext,
  type CameraRenderOptions,
  type LightSetup,
  type ExportOptions,
} from '../products/item-card-engine'

export {
  createScene,
  applyLightSetup,
  applyCameraPose,
  exportImage,
  LIGHT_PRESETS,
  DEFAULT_LIGHT_SETUP,
  type SceneContext,
  type CameraRenderOptions,
  type LightSetup,
  type LightPresetId,
  type ExportFormat,
  type ExportOptions,
} from '../products/item-card-engine'

const CELL_SIZE = 40
const WALL_T = 4
const BLOCK_FLOOR_THICKNESS = 4
const PREVIEW_SURFACE = { roughness: 0.9, metalness: 0 }

export interface PresetCoverBlock {
  modelPath: string
  innerWidth: number
  innerDepth: number
  height: number
  modelBackHookDepth: number
  modelRotation: [number, number, number]
}

export interface PresetCoverItem {
  modelPath: string
  cellX: number
  cellY: number
  gridCols: number
  gridRows: number
  height: number
  type: 'item' | 'riser'
  modelRotation: [number, number, number]
}

export interface PresetCoverRenderOptions {
  fillRatio: number
  colorHex: string
  sceneRotationDeg: [number, number, number]
}

function cellToWorld(
  col: number,
  row: number,
  innerWidth: number,
  innerDepth: number,
  gridWidth: number,
  gridDepth: number
): [number, number] {
  const x = (col + gridWidth / 2) * CELL_SIZE - innerWidth / 2
  const z = (row + gridDepth / 2) * CELL_SIZE - innerDepth / 2
  return [x, z]
}

function applyTint(root: THREE.Object3D, colorHex: string) {
  const tint = new THREE.Color(colorHex)
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    obj.castShadow = false
    obj.receiveShadow = false
    const buildMat = () =>
      new THREE.MeshStandardMaterial({
        color: tint,
        roughness: PREVIEW_SURFACE.roughness,
        metalness: PREVIEW_SURFACE.metalness,
      })
    if (Array.isArray(obj.material)) {
      obj.material.forEach((m) => m.dispose())
      obj.material = obj.material.map(() => buildMat())
    } else if (obj.material) {
      obj.material.dispose()
      obj.material = buildMat()
    }
  })
}

function disposeObjectResources(root: THREE.Object3D) {
  root.traverse((obj) => {
    const d = obj as THREE.Object3D & {
      geometry?: { dispose?: () => void }
      material?: THREE.Material | THREE.Material[]
    }
    d.geometry?.dispose?.()
    if (Array.isArray(d.material)) d.material.forEach((m) => m.dispose())
    else d.material?.dispose()
  })
}

function degToRadRotation(
  deg: [number, number, number]
): [number, number, number] {
  return [
    THREE.MathUtils.degToRad(deg[0]),
    THREE.MathUtils.degToRad(deg[1]),
    THREE.MathUtils.degToRad(deg[2]),
  ]
}

function buildBlockGroup(
  loaded: THREE.Object3D,
  block: PresetCoverBlock,
  colorHex: string
): THREE.Group {
  const model = loaded.clone(true)
  const [rx, ry, rz] = degToRadRotation(block.modelRotation)
  model.rotation.set(rx, ry, rz)

  const box = new THREE.Box3().setFromObject(model)
  const size = new THREE.Vector3()
  box.getSize(size)
  const hookDepth = Math.max(0, block.modelBackHookDepth)
  const effectiveMinZ = box.min.z + hookDepth
  const effectiveMaxZ = box.max.z
  const effectiveDepth = Math.max(1e-6, effectiveMaxZ - effectiveMinZ)
  const center = new THREE.Vector3(
    (box.min.x + box.max.x) * 0.5,
    (box.min.y + box.max.y) * 0.5,
    (effectiveMinZ + effectiveMaxZ) * 0.5
  )

  const outerW = block.innerWidth + WALL_T * 2
  const outerD = block.innerDepth + WALL_T * 2
  const sx = size.x > 0 ? outerW / size.x : 1
  const sy = size.y > 0 ? block.height / size.y : 1
  const sz = effectiveDepth > 0 ? outerD / effectiveDepth : 1

  applyTint(model, colorHex)

  const group = new THREE.Group()
  group.scale.set(
    Number.isFinite(sx) && sx > 0 ? sx : 1,
    Number.isFinite(sy) && sy > 0 ? sy : 1,
    Number.isFinite(sz) && sz > 0 ? sz : 1
  )
  model.position.set(-center.x, -box.min.y, -center.z)
  group.add(model)
  return group
}

function buildItemGroup(
  loaded: THREE.Object3D,
  item: PresetCoverItem,
  worldX: number,
  worldZ: number,
  yOffset: number,
  colorHex: string
): THREE.Group {
  const model = loaded.clone(true)
  const [rx, ry, rz] = degToRadRotation(item.modelRotation)
  model.rotation.set(rx, ry, rz)

  const box = new THREE.Box3().setFromObject(model)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const targetW = item.gridCols * CELL_SIZE
  const targetD = item.gridRows * CELL_SIZE
  const sx = size.x > 0 ? targetW / size.x : 1
  const sy = size.y > 0 ? item.height / size.y : 1
  const sz = size.z > 0 ? targetD / size.z : 1

  applyTint(model, colorHex)

  const group = new THREE.Group()
  group.position.set(worldX, yOffset, worldZ)
  group.scale.set(
    Number.isFinite(sx) ? sx : 1,
    Number.isFinite(sy) ? sy : 1,
    Number.isFinite(sz) ? sz : 1
  )
  model.position.set(-center.x, -box.min.y, -center.z)
  group.add(model)
  return group
}

function getRiserHeightAtCell(
  col: number,
  row: number,
  items: PresetCoverItem[]
): number {
  let total = 0
  for (const item of items) {
    if (item.type !== 'riser') continue
    const inCol = col >= item.cellX && col < item.cellX + item.gridCols
    const inRow = row >= item.cellY && row < item.cellY + item.gridRows
    if (inCol && inRow) total += item.height
  }
  return total
}

export async function renderPresetToScene(
  ctx: SceneContext,
  block: PresetCoverBlock,
  items: PresetCoverItem[],
  options: PresetCoverRenderOptions,
  cameraOptions: CameraRenderOptions
) {
  const blockUrl = `/files/${block.modelPath}`
  const uniqueItemPaths = [...new Set(items.map((it) => it.modelPath))]
  const [blockLoaded, ...itemLoadedList] = await Promise.all([
    ctx.loader.loadAsync(blockUrl),
    ...uniqueItemPaths.map((path) =>
      ctx.loader.loadAsync(`/files/${path}`)
    ),
  ])
  const loadedByPath = new Map<string, THREE.Object3D>()
  uniqueItemPaths.forEach((path, i) => {
    loadedByPath.set(path, itemLoadedList[i]!)
  })

  disposeObjectResources(ctx.modelRoot)
  ctx.modelRoot.clear()

  const assembly = new THREE.Group()
  assembly.add(buildBlockGroup(blockLoaded, block, options.colorHex))

  const innerW = block.innerWidth
  const innerD = block.innerDepth

  for (const item of items) {
    const loaded = loadedByPath.get(item.modelPath)
    if (!loaded) continue
    const [rawWx, rawWz] = cellToWorld(
      item.cellX,
      item.cellY,
      innerW,
      innerD,
      item.gridCols,
      item.gridRows
    )
    const w = item.gridCols * CELL_SIZE
    const d = item.gridRows * CELL_SIZE
    const minX = -innerW / 2 + w / 2
    const maxX = innerW / 2 - w / 2
    const minZ = -innerD / 2 + d / 2
    const maxZ = innerD / 2 - d / 2
    const wx = minX <= maxX ? THREE.MathUtils.clamp(rawWx, minX, maxX) : rawWx
    const wz = minZ <= maxZ ? THREE.MathUtils.clamp(rawWz, minZ, maxZ) : rawWz
    const riserBoost =
      item.type === 'riser'
        ? 0
        : getRiserHeightAtCell(item.cellX, item.cellY, items)
    const yOffset = BLOCK_FLOOR_THICKNESS + riserBoost
    assembly.add(
      buildItemGroup(loaded, item, wx, wz, yOffset, options.colorHex)
    )
  }

  const [srx, sry, srz] = degToRadRotation(options.sceneRotationDeg)
  assembly.rotation.set(srx, sry, srz)

  ctx.modelRoot.add(assembly)

  const rawBox = new THREE.Box3().setFromObject(assembly)
  const rawCenter = rawBox.getCenter(new THREE.Vector3())
  const rawSize = rawBox.getSize(new THREE.Vector3())
  const maxEdge = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1
  const targetMaxEdge = 140 * options.fillRatio
  const scale = targetMaxEdge / maxEdge

  assembly.scale.setScalar(scale)
  assembly.position.sub(rawCenter.multiplyScalar(scale))

  const scaledBox = new THREE.Box3().setFromObject(assembly)
  assembly.position.y -= scaledBox.min.y

  const centeredBox = new THREE.Box3().setFromObject(assembly)
  const finalCenter = centeredBox.getCenter(new THREE.Vector3())
  assembly.position.x -= finalCenter.x
  assembly.position.z -= finalCenter.z

  applyCameraPose(ctx, cameraOptions)
}
