import * as THREE from 'three'
import {ref, markRaw, type Ref} from 'vue'

// ===== Types =====
export interface GridPosition {
  x: number
  y: number
  z: number
}
export interface Ship {
  id: string
  colorName: string
  colorHex: number
  mesh: THREE.Group
  ring: THREE.Mesh
  trailGroup: THREE.Group
  grid: GridPosition
  busy: boolean
  anim: any
}
export interface Dot {
  position: THREE.Vector3
  gridPosition: GridPosition
  instanceId: number
}
export interface Corner {
  name: string
  hex: number
  pos: [number, number, number]
}
// ===== Constants =====
export const GRID_SIZE: number = 16
export const CUBE_SIZE: number = 128
export const DOT_SIZE: number = 0.28
export const DOT_SPACING: number = CUBE_SIZE / (GRID_SIZE - 1)
const CORNER_CUBE_SIZE: number = DOT_SIZE * 4
const LINE_WIDTH: number = 2
export const ROTATE_MS: number = 300
export const FLY_MS: number = 800
const CENTER: GridPosition = {
  x: (GRID_SIZE - 1) / 2,
  y: (GRID_SIZE - 1) / 2,
  z: (GRID_SIZE - 1) / 2
}

// ===== Game state =====
export let camera: THREE.PerspectiveCamera | null = null
export let scene: THREE.Scene | null = null
export let renderer: THREE.WebGLRenderer | null = null
export let mainCube: THREE.Group | null = null
export const isVRMode: Ref = ref(false)
export let isMobileMode: Ref = ref(false)
export let cameraGroup: THREE.Group | null = null
export let autoRotate = ref(false)
export const clock: THREE.Clock = new THREE.Clock()

// Ray casting (PC only)
export const raycaster = new THREE.Raycaster()
export const mouse = new THREE.Vector2()

// Input
let moveForward: boolean = false
let moveBackward: boolean = false
let moveLeft: boolean = false
let moveRight: boolean = false
let moveUp: boolean = false
let moveDown: boolean = false

// Dots
export let dots: Dot[] = []
export let instancedDots: THREE.InstancedMesh | null = null

// Selection markers
export let sourceMarker: THREE.Mesh
export let targetMarker: THREE.Mesh

// Corner cubes (for ray cast)
export let cornerCubes: THREE.Mesh[] = []

// Ships
export const MAX_SHIPS: number = 8
export const ships = new Map < string, Ship > ()
export const usedColors = new Set < string > ()
export const occupancy = new Map < string, string > ()

// Corners
export const CORNERS: Corner[] = [{
  name: "Black",
  hex: 0x000000,
  pos: [0, 0, 0]
}, {
  name: "Red",
  hex: 0xff0000,
  pos: [GRID_SIZE - 1, 0, 0]
}, {
  name: "Green",
  hex: 0x00ff00,
  pos: [0, GRID_SIZE - 1, 0]
}, {
  name: "Blue",
  hex: 0x0000ff,
  pos: [0, 0, GRID_SIZE - 1]
}, {
  name: "Yellow",
  hex: 0xffff00,
  pos: [GRID_SIZE - 1, GRID_SIZE - 1, 0]
}, {
  name: "Magenta",
  hex: 0xff00ff,
  pos: [GRID_SIZE - 1, 0, GRID_SIZE - 1]
}, {
  name: "Cyan",
  hex: 0x00ffff,
  pos: [0, GRID_SIZE - 1, GRID_SIZE - 1]
}, {
  name: "White",
  hex: 0xffffff,
  pos: [GRID_SIZE - 1, GRID_SIZE - 1, GRID_SIZE - 1]
}, ]

// Autoplay
export const autoTimer = ref < number | null > (null)

// ===== Init / Modes =====
export function init(): void {
  scene = markRaw(new THREE.Scene())
  scene.background = new THREE.Color(0x000000)

  cameraGroup = markRaw(new THREE.Group())
  scene.add(cameraGroup)

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000)
  if (isVRMode) camera.position.set(0, 0, CUBE_SIZE * 0.75)
  else if (isMobileMode) camera.position.set(CUBE_SIZE * 0.75, CUBE_SIZE * 0.75, CUBE_SIZE * 0.75)
  else camera.position.set(CUBE_SIZE * 0.5, CUBE_SIZE * 0.5, CUBE_SIZE * 0.75)
  camera.lookAt(0, 0, 0)
  cameraGroup.add(camera)

  const viewport: HTMLMetaElement = document.querySelector('meta[name=viewport]') as HTMLMetaElement
  if (viewport) viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'

  if (renderer && renderer.domElement && renderer.domElement.parentNode) {
    renderer.domElement.parentNode.removeChild(renderer.domElement)
    renderer.dispose()
  }
  renderer = markRaw(new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance'
  }))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  document.body.appendChild(renderer.domElement)

  if (mainCube) {
    scene.remove(mainCube)
    mainCube.traverse((o: THREE.Object3D) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        if (mesh.geometry) mesh.geometry.dispose()
        if (mesh.material) {
          if (Array.isArray(mesh.material))
            mesh.material.forEach((m: THREE.Material) => m.dispose())
          else
            mesh.material.dispose()
        }
      }
    })
  }

  setupLights()

  mainCube = new THREE.Group()
  mainCube.add(createCornerCubes())
  mainCube.add(createDots())
  setupSelectionMarkers()
  scene.add(mainCube)

  window.addEventListener('resize', onWindowResize, false)
  if (!isMobileMode) {
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
  }
  clock.start()
}

function setupLights(): void {
  const ambient = new THREE.AmbientLight(0xffffff, 0.4)
  scene!.add(ambient)
  const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 0.7)
  scene!.add(hemi)
  const dir1 = new THREE.DirectionalLight(0xffffff, 0.9)
  dir1.position.set(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE)
  scene!.add(dir1)
  const dir2 = new THREE.DirectionalLight(0xffffff, 0.6)
  dir2.position.set(-CUBE_SIZE, -CUBE_SIZE, CUBE_SIZE)
  scene!.add(dir2)
  const dir3 = new THREE.DirectionalLight(0xffffff, 0.5)
  dir3.position.set(CUBE_SIZE, -CUBE_SIZE, -CUBE_SIZE)
  scene!.add(dir3)
}

// ===== Scene bits =====
export function gridToWorld(g: GridPosition): THREE.Vector3 {
  const cx = (GRID_SIZE - 1) / 2
  return new THREE.Vector3(
    (g.x - cx) * DOT_SPACING,
    (g.y - cx) * DOT_SPACING,
    (g.z - cx) * DOT_SPACING
  )
}

export function createCornerCubes(): THREE.Group {
  const group = new THREE.Group()
  cornerCubes = []
  CORNERS.forEach(({
    hex,
    pos
  }) => {
    const geo = new THREE.BoxGeometry(CORNER_CUBE_SIZE, CORNER_CUBE_SIZE, CORNER_CUBE_SIZE)
    const mat = new THREE.MeshStandardMaterial({
      color: hex,
      emissive: hex,
      emissiveIntensity: 0.55,
      side: THREE.DoubleSide
    })
    const cube = new THREE.Mesh(geo, mat)
    const grid = {
      x: pos[0],
      y: pos[1],
      z: pos[2]
    }
    cube.position.copy(gridToWorld(grid))
    cube.userData.gridPosition = grid
    cube.userData.isCorner = true
    if (hex === 0x000000) {
      const wire = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({
        color: 0xffffff,
        linewidth: LINE_WIDTH,
        side: THREE.DoubleSide
      }))
      cube.add(wire)
    }
    group.add(cube)
    cornerCubes.push(cube)
  })
  return group
}

export function createDots(): THREE.Group {
  const dotGroup = new THREE.Group()
  const segments: number = isVRMode ? 4 : 6
  const geo = new THREE.SphereGeometry(DOT_SIZE, segments, segments)
  const mat = new THREE.MeshStandardMaterial({
    color: 0x8a8a8a,
    emissive: 0x3a3a3a,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    flatShading: isVRMode.value
  })
  const inst = new THREE.InstancedMesh(geo, mat, GRID_SIZE * GRID_SIZE * GRID_SIZE)
  instancedDots = inst
  inst.userData.dots = []
  let idx: number = 0
  const mtx = new THREE.Matrix4()
  for (let x: number = 0; x < GRID_SIZE; x++)
    for (let y: number = 0; y < GRID_SIZE; y++)
      for (let z: number = 0; z < GRID_SIZE; z++) {
        const isCorner: boolean = (x === 0 || x === GRID_SIZE - 1) && (y === 0 || y === GRID_SIZE - 1) && (z === 0 || z === GRID_SIZE - 1)
        if (isCorner) continue
        const grid: GridPosition = {
          x,
          y,
          z
        }
        const p = gridToWorld(grid)
        mtx.setPosition(p.x, p.y, p.z)
        inst.setMatrixAt(idx, mtx)
        const dot: Dot = {
          position: p.clone(),
          gridPosition: grid,
          instanceId: idx
        }
        dots.push(dot)
        inst.userData.dots.push(dot)
        idx++
      }
  inst.count = idx
  dotGroup.add(inst)
  return dotGroup
}

export function setupSelectionMarkers(): void {
  const srcGeo = new THREE.TorusGeometry(DOT_SIZE * 1.6, DOT_SIZE * 0.2, 8, 24)
  const srcMat = new THREE.MeshBasicMaterial({
    color: 0xffaa00
  })
  sourceMarker = new THREE.Mesh(srcGeo, srcMat)
  sourceMarker.rotation.x = Math.PI / 2
  sourceMarker.visible = false
  mainCube!.add(sourceMarker)

  const tgtGeo = new THREE.TorusGeometry(DOT_SIZE * 1.8, DOT_SIZE * 0.18, 8, 24)
  const tgtMat = new THREE.MeshBasicMaterial({
    color: 0xffffff
  })
  targetMarker = new THREE.Mesh(tgtGeo, tgtMat)
  targetMarker.rotation.x = Math.PI / 2
  targetMarker.visible = false
  mainCube!.add(targetMarker)
}

export function updateAutoRotation(): void {
  if (!autoRotate || !mainCube) return
  const S = 0.001
  const t = Date.now() * S
  mainCube.rotation.x += Math.sin(t) * S
  mainCube.rotation.y += Math.cos(t * 1.3) * S
  mainCube.rotation.z += Math.sin(t * 0.7) * S
}

// ===== Controls & camera =====
function handleKeyDown(e: KeyboardEvent): void {
  switch (e.code) {
    case 'KeyW':
      moveForward = true
      break
    case 'KeyS':
      moveBackward = true
      break
    case 'KeyA':
      moveLeft = true
      break
    case 'KeyD':
      moveRight = true
      break
    case 'Space':
      moveUp = true
      break
    case 'ShiftLeft':
      moveDown = true
      break
  }
}

function handleKeyUp(e: KeyboardEvent): void {
  switch (e.code) {
    case 'KeyW':
      moveForward = false
      break
    case 'KeyS':
      moveBackward = false
      break
    case 'KeyA':
      moveLeft = false
      break
    case 'KeyD':
      moveRight = false
      break
    case 'Space':
      moveUp = false
      break
    case 'ShiftLeft':
      moveDown = false
      break
  }
}

function onWindowResize(): void {
  if (!camera || !renderer) return
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
}

// ===== Ships =====
export function createShip(id: string, colorName: string, colorHex: number, grid: GridPosition): Ship {
  const group = new THREE.Group()
  group.name = id
  const worldPos = gridToWorld(grid)
  group.position.copy(worldPos)
  const bodyRadius = DOT_SIZE * 0.7,
    bodyLen = DOT_SIZE * 4.2,
    tipLen = DOT_SIZE * 1.8
  const bodyGeo = new THREE.CylinderGeometry(bodyRadius * 0.75, bodyRadius, bodyLen, 12)
  const bodyMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: 0.4,
    metalness: 0.2,
    roughness: 0.6
  })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.rotation.x = Math.PI / 2
  group.add(body)
  const noseGeo = new THREE.ConeGeometry(bodyRadius * 0.75, tipLen, 12)
  const noseMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: 0.55,
    metalness: 0.1,
    roughness: 0.4
  })
  const nose = new THREE.Mesh(noseGeo, noseMat)
  nose.rotation.x = Math.PI / 2
  nose.position.z = bodyLen / 2 + tipLen / 2
  group.add(nose)
  if (colorHex === 0x000000) {
    const edges = new THREE.EdgesGeometry(new THREE.CapsuleGeometry(bodyRadius, bodyLen, 2, 8))
    const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
      color: 0xffffff
    }))
    group.add(outline)
  }
  const navLight = new THREE.PointLight(colorHex === 0x000000 ? 0xffffff : colorHex, 0.8, DOT_SPACING * 1.5, 2)
  navLight.position.set(0, 0, bodyLen / 2 + tipLen / 2 + 0.1)
  group.add(navLight)
  const toCenter = new THREE.Vector3().sub(worldPos).normalize()
  const forward = new THREE.Vector3(0, 0, 1)
  const q = new THREE.Quaternion().setFromUnitVectors(forward, toCenter)
  group.setRotationFromQuaternion(q)
  const ringGeo = new THREE.TorusGeometry(DOT_SIZE * 1.2, DOT_SIZE * 0.15, 8, 24)
  const ringMat = new THREE.MeshBasicMaterial({
    color: colorHex === 0x000000 ? 0xffffff : colorHex
  })
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.rotation.x = Math.PI / 2
  group.add(ring)
  const trailGroup = new THREE.Group()
  mainCube!.add(trailGroup)
  mainCube!.add(group)
  return {
    id,
    colorName,
    colorHex,
    mesh: group,
    ring,
    trailGroup,
    grid: { ...grid
    },
    busy: false,
    anim: null
  }
}

export function addTrailSegment(s: Ship, p0: THREE.Vector3, p1: THREE.Vector3): void {
  const pos = new Float32Array([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z])
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const m = new THREE.LineBasicMaterial({
    color: s.colorHex === 0x000000 ? 0xffffff : s.colorHex,
    transparent: true,
    opacity: .9
  })
  const line = new THREE.Line(g, m)
  line.frustumCulled = false
  s.trailGroup.add(line)
}

export function tickShipAnimations(dt: number = 1 / 60): void {
  ships.forEach((s) => {
    if (!s.anim) return
    if (s.anim.type === 'rotate-then-fly') {
      if (s.anim.phase === 0) {
        const dur = ROTATE_MS / 1000
        s.anim.t = Math.min(1, s.anim.t + dt / dur)
        const t = s.anim.ease(s.anim.t)
        s.mesh.quaternion.slerpQuaternions(s.anim.fromQ, s.anim.toQ, t)
        if (s.anim.t >= 1) {
          s.anim.phase = 1
          s.anim.t = 0
        }
      } else if (s.anim.phase === 1) {
        const dur = FLY_MS / 1000
        s.anim.t = Math.min(1, s.anim.t + dt / dur)
        const t = s.anim.ease(s.anim.t)
        const p = new THREE.Vector3().lerpVectors(s.anim.fromP, s.anim.toP, t)
        s.mesh.position.copy(p)
        if (s.anim.t >= 1) {
          s.grid = { ...s.anim.toGrid
          }
          s.anim = null
          s.busy = false
        }
      }
    }
  })
}

export function clearAllShipsAndTrails(): void {
  ships.forEach((s) => {
    if (s.mesh) mainCube?.remove(s.mesh)
    if (s.trailGroup) {
      while (s.trailGroup.children.length) {
        const ch = s.trailGroup.children.pop() as THREE.Mesh | undefined
        if (ch) {
          if (ch.geometry) ch.geometry.dispose()
          if (ch.material) (ch.material as THREE.Material).dispose()
        }
      }
      mainCube?.remove(s.trailGroup)
    }
  })
  ships.clear()
  usedColors.clear()
  occupancy.clear()
}

// ===== Autoplay =====
export function ensureAllShips(): void {
  CORNERS.forEach(c => addShipByCorner(c))
}

function addShipByCorner(corner: Corner): void {
  if (ships.size >= MAX_SHIPS) return
  const colorName = corner.name
  if (usedColors.has(colorName)) return
  const grid: GridPosition = {
    x: corner.pos[0],
    y: corner.pos[1],
    z: corner.pos[2]
  }
  if (occupancy.has(gridKey(grid))) return
  const id = `ship-${colorName.toLowerCase()}`
  const ship = createShip(id, colorName, corner.hex, grid)
  ships.set(id, ship)
  usedColors.add(colorName)
  occupancy.set(gridKey(grid), id)
}

export function autoPlayStep(): void {
  ships.forEach((s) => {
    if (s.busy) return
    const t = pickBiasedNeighbor(s.grid)
    if (!t) return
    flyShipDirect(s, t)
  })
}

function getFreeNeighbors(g: GridPosition): GridPosition[] {
  const D: GridPosition[] = [{
    x: 1,
    y: 0,
    z: 0
  }, {
    x: -1,
    y: 0,
    z: 0
  }, {
    x: 0,
    y: 1,
    z: 0
  }, {
    x: 0,
    y: -1,
    z: 0
  }, {
    x: 0,
    y: 0,
    z: 1
  }, {
    x: 0,
    y: 0,
    z: -1
  }]
  const arr: GridPosition[] = []
  for (const d of D) {
    const n = {
      x: g.x + d.x,
      y: g.y + d.y,
      z: g.z + d.z
    }
    if (!inBounds(n)) continue
    if (occupancy.has(gridKey(n))) continue
    arr.push(n)
  }
  return arr
}

function dist2ToCenter(g: GridPosition): number {
  const dx = g.x - CENTER.x,
    dy = g.y - CENTER.y,
    dz = g.z - CENTER.z
  return dx * dx + dy * dy + dz * dz
}

function pickBiasedNeighbor(g: GridPosition): GridPosition | null {
  const cands = getFreeNeighbors(g)
  if (!cands.length) return null
  cands.sort((a, b) => dist2ToCenter(a) - dist2ToCenter(b))
  if (Math.random() < 0.75) return cands[0]
  return cands[Math.floor(Math.random() * cands.length)]
}

function flyShipDirect(s: Ship, target: GridPosition): void {
  if (s.busy) return
  if (!inBounds(target) || occupancy.has(gridKey(target))) return
  occupancy.delete(gridKey(s.grid))
  occupancy.set(gridKey(target), s.id)
  const fromP = gridToWorld(s.grid),
    toP = gridToWorld(target)
  addTrailSegment(s, fromP, toP)
  const dir = new THREE.Vector3(
    target.x - s.grid.x,
    target.y - s.grid.y,
    target.z - s.grid.z
  ).normalize()
  const fromQ = s.mesh.quaternion.clone()
  const toQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)
  s.busy = true
  s.anim = {
    type: 'rotate-then-fly',
    phase: 0,
    t: 0,
    fromQ,
    toQ,
    fromP,
    toP,
    toGrid: { ...target
    },
    ease: easeInOutCubic
  }
}

// ===== Helpers =====
export const gridKey = (g: GridPosition): string => `${g.x},${g.y},${g.z}`
export const inBounds = (g: GridPosition): boolean => g.x >= 0 && g.x < GRID_SIZE && g.y >= 0 && g.y < GRID_SIZE && g.z >= 0 && g.z < GRID_SIZE
export const equalsGrid = (a: GridPosition, b: GridPosition): boolean => a.x === b.x && a.y === b.y && a.z === b.z
export const easeInOutCubic = (t: number): number => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
