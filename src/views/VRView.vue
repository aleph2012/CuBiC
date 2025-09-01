<template>
  <ReturnButton />
  <div id="error" v-if="errorMessage">{{ errorMessage }}</div>
</template>

<script setup lang="ts">
  import { onMounted, onUnmounted, ref } from 'vue'
  import { VRButton } from 'three/examples/jsm/webxr/VRButton'
  import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory'
  import * as THREE from 'three'
  import {
    init,
    scene,
    camera,
    renderer,
    cameraGroup,
    isVRMode,
    isMobileMode,
    autoRotate,
    updateAutoRotation,
    setupSelectionMarkers,
    createCornerCubes,
    createDots,
    CUBE_SIZE
  } from '@/core/game'
  import router from '@/router.ts'
  import ReturnButton from '@/components/ReturnButton.vue'

  const errorMessage = ref<string | null>(null)
  let controller1: THREE.Group | null = null
  let controller2: THREE.Group | null = null
  let controllerGrip1: THREE.Group | null = null
  let controllerGrip2: THREE.Group | null = null
  const urlParams = new URLSearchParams(window.location.search)
  const startAutoRotate = urlParams.get('autoRotate') === 'true'

  const vrState = {
    isGrabbing1: false,
    isGrabbing2: false,
    lastPosition1: new THREE.Vector3(),
    lastPosition2: new THREE.Vector3()
  }
  const vrMovementActive = { left: false, right: false }
  let vrMainCube: THREE.Group = new THREE.Group

  const setupVRControllers = () => {
    if (!renderer || !cameraGroup) return

    controller1 = renderer.xr.getController(0)
    controller2 = renderer.xr.getController(1)
    cameraGroup.add(controller1)
    cameraGroup.add(controller2)

    const factory = new XRControllerModelFactory()
    controllerGrip1 = renderer.xr.getControllerGrip(0)
    controllerGrip1.add(factory.createControllerModel(controllerGrip1))
    cameraGroup.add(controllerGrip1)

    controllerGrip2 = renderer.xr.getControllerGrip(1)
    controllerGrip2.add(factory.createControllerModel(controllerGrip2))
    cameraGroup.add(controllerGrip2)

    controller1.addEventListener('selectstart' as any, onVRGrabStart)
    controller1.addEventListener('selectend' as any, onVRGrabEnd)
    controller2.addEventListener('selectstart' as any, onVRGrabStart)
    controller2.addEventListener('selectend' as any, onVRGrabEnd)
    controller1.addEventListener('squeezestart' as any, () => vrMovementActive.left = true)
    controller1.addEventListener('squeezeend' as any, () => vrMovementActive.left = false)
    controller2.addEventListener('squeezestart' as any, () => vrMovementActive.right = true)
    controller2.addEventListener('squeezeend' as any, () => vrMovementActive.right = false)

    if (controller1) controller1.userData.raycaster = new THREE.Raycaster()
    if (controller2) controller2.userData.raycaster = new THREE.Raycaster()
  }

  const onVRGrabStart = (e: THREE.Event) => {
    const c = e.target
    if (c === controller1) { vrState.isGrabbing1 = true; controller1?.getWorldPosition(vrState.lastPosition1) }
    else { vrState.isGrabbing2 = true; controller2?.getWorldPosition(vrState.lastPosition2) }
  }

  const onVRGrabEnd = (e: THREE.Event) => {
    const c = e.target
    if (c === controller1) vrState.isGrabbing1 = false
    else vrState.isGrabbing2 = false
  }

  const updateVRInteraction = () => {
    if (vrState.isGrabbing1 && vrState.isGrabbing2) {
      if (!controller1 || !controller2) return
      const p1 = new THREE.Vector3(), p2 = new THREE.Vector3()
      controller1.getWorldPosition(p1)
      controller2.getWorldPosition(p2)
      if (vrState.lastPosition1.length() > 0 && vrState.lastPosition2.length() > 0) {
        const prev = vrState.lastPosition2.clone().sub(vrState.lastPosition1)
        const curr = p2.clone().sub(p1)
        const q = new THREE.Quaternion()
        q.setFromUnitVectors(prev.normalize(), curr.normalize())
        vrMainCube!.quaternion.multiplyQuaternions(q, vrMainCube!.quaternion)
      }
      vrState.lastPosition1.copy(p1)
      vrState.lastPosition2.copy(p2)
    }
  }

  const updateVRMovement = () => {
    if (!isVRMode.value || !cameraGroup || !camera) return
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    if (vrMovementActive.right) cameraGroup.position.addScaledVector(dir, 2.0)
    if (vrMovementActive.left) cameraGroup.position.addScaledVector(dir, -2.0)
  }

  const returnToMenu = () => {
    router.push('/')
  }

  onMounted(() => {
    isVRMode.value = true
    isMobileMode.value = false
    autoRotate.value = startAutoRotate
    init()
    setupVRControllers()

    if (!vrMainCube) {
      vrMainCube = new THREE.Group()
      vrMainCube.position.set(0, 0, -CUBE_SIZE * 0.75)
      vrMainCube.scale.setScalar(1.0)
      vrMainCube.add(createCornerCubes())
      vrMainCube.add(createDots())
      setupSelectionMarkers()
      scene!.add(vrMainCube)
    }

    document.body.appendChild(VRButton.createButton(renderer!))
    renderer!.xr.enabled = true
    renderer!.xr.setFramebufferScaleFactor(0.8)
    renderer!.setPixelRatio(1)
    renderer!.xr.setReferenceSpaceType('local-floor')
    renderer!.toneMapping = THREE.NoToneMapping
    renderer!.outputColorSpace = THREE.LinearSRGBColorSpace

    renderer!.setAnimationLoop(() => {
      updateVRInteraction()
      updateVRMovement()
      updateAutoRotation()
      renderer!.render(scene!, camera!)
    })
  })

  onUnmounted(() => {
    if (renderer) renderer.setAnimationLoop(null)
    if (controller1) controller1.removeEventListener('selectstart' as any, onVRGrabStart)
    if (controller1) controller1.removeEventListener('selectend' as any, onVRGrabEnd)
    if (controller2) controller2.removeEventListener('selectstart' as any, onVRGrabStart)
    if (controller2) controller2.removeEventListener('selectend' as any, onVRGrabEnd)
  })
</script>
