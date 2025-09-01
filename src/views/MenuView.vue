<script setup lang="ts">
  import {ref, watch} from 'vue'
  import router from '@/router.ts'
  import {Icon} from '@iconify/vue'

  const autoRotate = ref(false)
  const errorMessage = ref<string | null>(null)
  const params = ref("")

  function startPC(): void {
    router.push(`/pc${params.value}`)
  }
  function startMobile(): void {
    router.push(`/mobile${params.value}`)
  }
  function startVR(): void {
    router.push(`/vr${params.value}`)
  }

  watch(autoRotate, () => {
    if (autoRotate.value) {
      params.value = "?autoRotate=true"
    } else {
      params.value = ""
    }
  })
</script>

<template>
  <div id="menu">
    <div id="menuInterior">
      <div id="menuTitle">
        <div class="cubicTitle">
          <img src="@/assets/Cubic-Logo.svg" alt="Cubic Logo">
          <h1>CuBiC</h1>
        </div>
        <h3>3D Space Battle Map (16x16x16)</h3>
      </div>

      <p id="modeSelect">Choose mode:</p>
      <button
        id="pcButton"
        @click="startPC"
      >
        <Icon icon="solar:monitor-line-duotone" />
        PC Mode
      </button>

      <button
        id="mobileButton"
        @click="startMobile"
      >
        <Icon icon="solar:smartphone-2-line-duotone" />
        Mobile Mode
      </button>

      <button
        id="vrButton"
        @click="startVR"
      >
        <Icon icon="solar:glasses-line-duotone" />
        VR Mode
      </button>

      <div id="version">v4.0.1-vue</div>

      <div id="autoRotateDiv">
        <input type="checkbox" id="autoRotate" v-model="autoRotate" />
        <label for="autoRotate">Start with Auto-Rotation</label>
      </div>

      <a
        href="https://transcension.mintlify.app/cubic/welcome"
        target="_blank"
        id="docsLink"
      >
        Docs
      </a>
    </div>
  </div>
  <div id="error" v-if="errorMessage">{{ errorMessage }}</div>
</template>

<style scoped lang="sass">
  #menu
    display: flex
    align-items: center
    justify-content: center
    width: 100vw
    height: 100vh

    #menuInterior
      display: flex
      flex-direction: column

      #menuTitle
        margin: 1rem 0

        .cubicTitle
          display: flex
          align-items: center
          gap: 0.25rem

          img
            width: 3rem
            height: 3rem

        *
          margin: 0
        h3
          opacity: 0.4

      #modeSelect
        margin: 0
        opacity: 0.4

  #version
    position: absolute
    bottom: 0.625rem
    right: 0.625rem
    font-size: 0.75rem
    opacity: 0.5

  #docsLink
    margin-top: 1rem
</style>
