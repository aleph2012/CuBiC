<template>
  <div id="pcHud">
    <h2>Spaceships</h2>
    <div class="row">
      <label>Spawn color:</label>
      <select id="spawnColor" v-model="selectedSpawnColor">
        <option v-for="color in spawnColors" :key="color.name" :value="color.name" :disabled="color.disabled">
          {{ color.name }}
        </option>
      </select>
      <button
        id="addShipBtn"
        @click="addShipFromUI"
      >
        <Icon icon="solar:add-circle-line-duotone" />
        Add Ship
      </button>
    </div>

    <div class="row">
      <label>Selected ship:</label>
      <select id="shipList" v-model="selectedShipId">
        <option v-for="ship in shipsList" :key="ship.id" :value="ship.id">
          {{ ship.name }}
        </option>
      </select>

      <button
        id="centerBtn"
        title="Center camera on ship"
        @click="centerCameraOnSelected"
        :disabled="!selectedShipId"
      >
        <Icon icon="solar:minimize-square-2-line-duotone" />
        Center
      </button>

      <button
        id="followBtn"
        title="Toggle follow"
        @click="toggleFollowSelected"
        :disabled="!selectedShipId"
      >
        <Icon :icon="followShipId === selectedShipId ? 'solar:map-arrow-square-line-duotone' : 'solar:map-arrow-right-outline'" />
        Follow: {{ followShipId === selectedShipId ? 'On' : 'Off' }}
      </button>
    </div>

    <div class="row">
      <div class="pill">
        <span class="chip" :style="{ 'background-color': selectedShip ? `#${selectedShip.colorHex.toString(16).padStart(6, '0')}` : 'transparent' }"></span>
        <span id="selMeta" class="muted">{{ selectedShip ? `${selectedShip.colorName} @ (${selectedShip.grid.x},${selectedShip.grid.y},${selectedShip.grid.z})` : 'No ship selected' }}</span>
      </div>
    </div>

    <div class="row">
      <button
        id="flyBtn"
        @click="flySelected"
        :disabled="!canFly"
      >
        <Icon icon="solar:arrow-to-top-left-line-duotone" />
        Fly 1 hop
      </button>

      <button
        id="removeShipBtn"
        @click="removeSelectedShip"
        :disabled="!selectedShipId"
      >
        <Icon icon="solar:trash-bin-minimalistic-line-duotone" />
        Remove Ship
      </button>

      <button
        id="clearTrailsBtn"
        @click="clearAllTrails"
        :disabled="ships.size === 0"
      >
        <Icon icon="solar:trash-bin-minimalistic-line-duotone" />
        Clear Trails
      </button>
    </div>

    <div class="row">
      <span class="muted">Click current node, then a valid adjacent node, then Fly. Click current node again to cancel.</span>
    </div>
  </div>

  <button
    id="autoPlayBtnFloating"
    @click="toggleAutoPlay"
  >
    <Icon :icon="autoPlayActive ? 'solar:rocket-2-line-duotone' : 'solar:rocket-line-duotone'" />
    Auto Play: {{ autoPlayActive ? 'On' : 'Off' }}
  </button>

  <ReturnButton />

  <div id="error" v-if="errorMessage">{{ errorMessage }}</div>
</template>

<script setup lang="ts">
  import { ref, onMounted, onUnmounted, computed } from 'vue'
  import * as THREE from 'three'
  import { OrbitControls } from "three-stdlib"
  import {
    init,
    scene,
    camera,
    renderer,
    mainCube,
    isMobileMode,
    isVRMode,
    autoRotate,
    clock,
    raycaster,
    mouse,
    cornerCubes,
    instancedDots,
    ships,
    usedColors,
    MAX_SHIPS,
    CORNERS,
    occupancy,
    gridToWorld,
    gridKey,
    equalsGrid,
    inBounds,
    createShip,
    addTrailSegment,
    tickShipAnimations,
    clearAllShipsAndTrails,
    setupSelectionMarkers,
    sourceMarker,
    targetMarker,
    CUBE_SIZE,
    autoTimer,
    ensureAllShips,
    autoPlayStep
  } from '@/core/game'
  import ReturnButton from '@/components/ReturnButton.vue'
  import {Icon} from '@iconify/vue'

  let controls: OrbitControls | null = null
  let animationFrameId: number | null = null

  const selectedSpawnColor = ref<string>('')
  const selectedShipId = ref<string | null>(null)
  const followShipId = ref<string | null>(null)
  const moveSource = ref<{ x: number, y: number, z: number } | null>(null)
  const moveTarget = ref<{ x: number, y: number, z: number } | null>(null)
  const errorMessage = ref<string | null>(null)
  const urlParams = new URLSearchParams(window.location.search)
  const startAutoRotate = urlParams.get('autoRotate') === 'true' // returns boolean

  const spawnColors = computed(() => {
    return CORNERS.map(c => ({
      name: c.name,
      disabled: usedColors.has(c.name)
    }))
  })

  const shipsList = computed(() => {
    const list: { id: string, name: string }[] = []
    ships.forEach(s => {
      list.push({
        id: s.id,
        name: `${s.colorName} (${s.grid.x},${s.grid.y},${s.grid.z})`
      })
    })
    return list
  })

  const selectedShip = computed(() => {
    if (selectedShipId.value && ships.has(selectedShipId.value)) {
      return ships.get(selectedShipId.value)
    }
    return null
  })

  const canFly = computed(() => {
    const s = selectedShip.value
    return !!s && !s.busy && !!moveSource.value && !!moveTarget.value
  })

  const autoPlayActive = computed(() => !!autoTimer.value)
  const clearMoveSelection = () => {
    moveSource.value = null
    moveTarget.value = null
    if (sourceMarker) sourceMarker.visible = false
    if (targetMarker) targetMarker.visible = false
  }

  const onPointerDown = (e: PointerEvent) => {
    if (isMobileMode.value || isVRMode.value) return
    if (!selectedShipId.value || !ships.has(selectedShipId.value)) return
    const ship = ships.get(selectedShipId.value)!
    if (ship.busy) return
    if (!renderer) return

    const rect = renderer.domElement.getBoundingClientRect()
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

    raycaster.setFromCamera(mouse, camera!)

    let hit: THREE.Intersection | null = null
    let hitGrid: { x: number, y: number, z: number } | null = null

    if (instancedDots) {
      const hitsDots = raycaster.intersectObject(instancedDots, true)
      if (hitsDots.length) {
        hit = hitsDots[0]
        const id = hit.instanceId
        if (id !== undefined && id !== null) {
          const dot = instancedDots.userData.dots[id]
          if (dot) { hitGrid = { ...dot.gridPosition } }
        }
      }
    }

    const hitsCubes = raycaster.intersectObjects(cornerCubes, true)
    if (hitsCubes.length) {
      const cubeHit = hitsCubes[0]
      if (!hit || cubeHit.distance < hit.distance) {
        hit = cubeHit
        hitGrid = { ...cubeHit.object.userData.gridPosition }
      }
    }

    if (!hit || !hitGrid) return
    const g = hitGrid

    if (!moveSource.value && equalsGrid(g, ship.grid)) {
      moveSource.value = { ...ship.grid }
      if (sourceMarker) {
        sourceMarker.visible = true
        sourceMarker.position.copy(gridToWorld(moveSource.value))
      }
      return
    }

    if (moveSource.value && equalsGrid(g, moveSource.value)) {
      clearMoveSelection()
      return
    }

    if (moveSource.value) {
      const dx = g.x - moveSource.value.x, dy = g.y - moveSource.value.y, dz = g.z - moveSource.value.z
      const manhattan = Math.abs(dx) + Math.abs(dy) + Math.abs(dz)
      const inLine = (manhattan === 1)
      const inBoundsOk = inBounds(g)
      const free = !occupancy.has(gridKey(g))
      if (inLine && inBoundsOk && free) {
        moveTarget.value = { x: g.x, y: g.y, z: g.z }
        if (targetMarker) {
          targetMarker.visible = true
          targetMarker.position.copy(gridToWorld(moveTarget.value))
        }
      }
    }
  }

  const addShipFromUI = () => {
    if (ships.size >= MAX_SHIPS) { showError('Max 8 ships.')
      return
    }
    const colorName = selectedSpawnColor.value
    if (!colorName) { showError('Pick a color.')
      return
    }
    if (usedColors.has(colorName)) { showError('That color is already used.')
      return
    }
    const corner = CORNERS.find(c => c.name === colorName)
    if (!corner) { showError('Invalid color.')
      return
    }
    const grid = { x: corner.pos[0], y: corner.pos[1], z: corner.pos[2] }
    if (occupancy.has(gridKey(grid))) { showError('Corner occupied.')
      return
    }
    const id = `ship-${colorName.toLowerCase()}`
    const ship = createShip(id, colorName, corner.hex, grid)
    ships.set(id, ship)
    usedColors.add(colorName)
    occupancy.set(gridKey(grid), id)
    selectedShipId.value = id
    clearMoveSelection()
    centerCameraOnSelected()
  }

  const centerCameraOnSelected = () => {
    if (!selectedShipId.value || !ships.has(selectedShipId.value) || !controls) return
    const s = ships.get(selectedShipId.value)!
    const target = s.mesh.getWorldPosition(new THREE.Vector3())
    controls.target.copy(target)
    const offset = new THREE.Vector3(CUBE_SIZE * .3, CUBE_SIZE * .3, CUBE_SIZE * .3)
    camera!.position.copy(target.clone().add(offset))
  }

  const toggleFollowSelected = () => {
    followShipId.value = (followShipId.value === selectedShipId.value) ? null : selectedShipId.value
  }

  const flySelected = () => {
    if (!selectedShipId.value || !ships.has(selectedShipId.value)) return
    const s = ships.get(selectedShipId.value)!
    if (s.busy) return
    if (!moveSource.value || !moveTarget.value) return
    if (!equalsGrid(s.grid, moveSource.value)) { showError("Source changed; reselect.")
      clearMoveSelection()
      return
    }
    if (!inBounds(moveTarget.value) || occupancy.has(gridKey(moveTarget.value))) { showError("Invalid target.")
      return
    }

    occupancy.delete(gridKey(s.grid))
    occupancy.set(gridKey(moveTarget.value), s.id)

    const fromP = gridToWorld(s.grid), toP = gridToWorld(moveTarget.value)
    addTrailSegment(s, fromP, toP)

    const dir = new THREE.Vector3(moveTarget.value.x - s.grid.x, moveTarget.value.y - s.grid.y, moveTarget.value.z - s.grid.z).normalize()
    const fromQ = s.mesh.quaternion.clone()
    const toQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)

    s.busy = true
    s.anim = { type: 'rotate-then-fly', phase: 0, t: 0, fromQ, toQ, fromP, toP, toGrid: { ...moveTarget.value }, ease: easeInOutCubic }
    clearMoveSelection()
  }

  const clearAllTrails = () => {
    ships.forEach((s) => {
      while (s.trailGroup.children.length) {
        const ch = s.trailGroup.children.pop() as THREE.Mesh | undefined
        if (ch) {
          if (ch.geometry) ch.geometry.dispose()
          s.trailGroup.remove(ch)
        }
      }
    })
  }

  const removeSelectedShip = () => {
    if (!selectedShipId.value || !ships.has(selectedShipId.value)) return
    const s = ships.get(selectedShipId.value)!
    occupancy.delete(gridKey(s.grid))
    mainCube?.remove(s.mesh)
    s.mesh.traverse(o => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        if (mesh.geometry) mesh.geometry.dispose()
        if (mesh.material) {
          if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose())
          else mesh.material.dispose()
        }
      }
    })
    while (s.trailGroup.children.length) {
      const ch = s.trailGroup.children.pop() as THREE.Mesh | undefined
      if (ch) {
        if (ch.geometry) ch.geometry.dispose()
        s.trailGroup.remove(ch)
      }
    }
    mainCube?.remove(s.trailGroup)
    ships.delete(s.id)
    usedColors.delete(s.colorName)
    if (followShipId.value === s.id) followShipId.value = null
    selectedShipId.value = ships.size ? Array.from(ships.keys())[0] : null
    clearMoveSelection()
  }

  const toggleAutoPlay = () => {
    if (autoTimer.value) {
      clearInterval(autoTimer.value)
      autoTimer.value = null
    } else {
      ensureAllShips()
      autoTimer.value = setInterval(autoPlayStep, 2000)
    }
  }

  const showError = (message: string) => {
    errorMessage.value = message
    setTimeout(() => errorMessage.value = null, 3000)
  }

  function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  }

  const animate = () => {
    animationFrameId = requestAnimationFrame(animate)
    const dt = clock.getDelta()
    controls?.update()
    tickShipAnimations(dt)
    renderer?.render(scene!, camera!)
  }

  const enableHudDrag = () => {
    const pcHudEl = document.getElementById('pcHud')
    const handle = pcHudEl?.querySelector('h2')
    if (!handle || !pcHudEl) return
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0
    handle.addEventListener('pointerdown', (e: PointerEvent) => {
      dragging = true
      sx = e.clientX
      sy = e.clientY
      const rect = pcHudEl.getBoundingClientRect()
      ox = rect.left
      oy = rect.top
      pcHudEl.setPointerCapture(e.pointerId)
    })
    window.addEventListener('pointermove', (e: PointerEvent) => {
      if (!dragging) return
      const nx = ox + (e.clientX - sx)
      const ny = oy + (e.clientY - sy)
      pcHudEl.style.left = Math.max(0, Math.min(window.innerWidth - pcHudEl.offsetWidth, nx)) + 'px'
      pcHudEl.style.top = Math.max(0, Math.min(window.innerHeight - pcHudEl.offsetHeight, ny)) + 'px'
      pcHudEl.style.right = 'auto'
      pcHudEl.style.position = 'fixed'
    })
    window.addEventListener('pointerup', (e: PointerEvent) => {
      if (!dragging) return
      dragging = false
      try { pcHudEl.releasePointerCapture(e.pointerId) } catch (_) { }
    })
  }

  onMounted(() => {
    isMobileMode.value = false
    isVRMode.value = false
    autoRotate.value = startAutoRotate
    init()

    controls = new OrbitControls(camera!, renderer!.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.maxDistance = CUBE_SIZE * 2
    controls.minDistance = 0.1
    controls.enablePan = true
    controls.panSpeed = 1.0
    controls.rotateSpeed = 0.5

    clearAllShipsAndTrails()
    setupSelectionMarkers()
    window.addEventListener('pointerdown', onPointerDown)
    enableHudDrag()
    animate()
  })

  onUnmounted(() => {
    window.removeEventListener('pointerdown', onPointerDown)
    if (animationFrameId) cancelAnimationFrame(animationFrameId)
    if (controls) controls.dispose()
  })
</script>

<style scoped lang="sass">
  #pcHud
    display: flex
    flex-direction: column
    position: fixed
    top: 5rem
    left: 1rem
    background: var(--innerBackgroundColor)
    border: 0.1rem solid var(--borderColor)
    border-radius: 2rem
    padding: 1rem
    z-index: 150
    max-width: 23.75rem
    backdrop-filter: blur(0.5rem)
    gap: 0.5rem

    & h2
      margin: 0 0 0.5rem 0
      cursor: move

    & .row
      display: flex
      gap: 0.5rem
      flex-wrap: wrap
      align-items: center
      background: var(--innerBackgroundColor)
      padding: 0.65rem 0.85rem
      border-radius: 1rem

      & button
        padding: 0.5rem
        margin: 0

    & label
      font-size: 0.8125rem
      opacity: .9

    & select
      padding: 0.375rem
      border-radius: 0.75rem
      border: 0.1rem solid var(--prominentBorderColor)
      background: var(--innerBackgroundColor)
      color: var(--textColor)

    & .muted
      opacity: .7
      font-size: 0.75rem

  .pill
    display: inline-flex
    align-items: center
    gap: 0.375rem
    padding: 0.25rem
    border-radius: 100rem
    background: var(--innerBackgroundColor)
    border: 0.1rem solid var(--borderColor)
    font-size: 0.75rem

  .chip
    width: 0.625rem
    height: 0.625rem
    border-radius: 50%
    display: inline-block
    border: 0.1rem solid var(--prominentBorderColor)
</style>
