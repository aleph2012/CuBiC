<template>
  <ReturnButton />
  <div id="error" v-if="errorMessage">{{ errorMessage }}</div>
</template>

<script setup lang="ts">
  import { onMounted, onUnmounted, ref } from 'vue'
  import * as THREE from 'three'
  import {
    init,
    camera,
    scene,
    renderer,
    isMobileMode,
    isVRMode,
    autoRotate,
    updateAutoRotation,
    CUBE_SIZE,
  } from '@/core/game'
  import { OrbitControls } from 'three-stdlib'
  import ReturnButton from '@/components/ReturnButton.vue'

  let controls: OrbitControls | null = null
  let animationFrameId: number | null = null
  const errorMessage = ref<string | null>(null)
  const urlParams = new URLSearchParams(window.location.search)
  const startAutoRotate = urlParams.get('autoRotate') === 'true'

  const animate = () => {
    animationFrameId = requestAnimationFrame(animate)
    controls?.update()
    updateAutoRotation()
    renderer?.render(scene!, camera!)
  }

  onMounted(() => {
    isMobileMode.value = true
    isVRMode.value = false
    autoRotate.value = startAutoRotate
    init()

    controls = new OrbitControls(camera!, renderer!.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.maxDistance = CUBE_SIZE * 2
    controls.minDistance = 0.1
    controls.enablePan = false
    controls.rotateSpeed = 0.5
    controls.enableZoom = true
    controls.zoomSpeed = 1.0
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }

    camera!.position.set(CUBE_SIZE * 0.75, CUBE_SIZE * 0.75, CUBE_SIZE * 0.75)
    camera!.lookAt(0, 0, 0)
    controls.update()

    animate()
  })

  onUnmounted(() => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId)
    if (controls) controls.dispose()
  })
</script>
