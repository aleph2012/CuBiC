<script setup lang="ts">
  import router from '@/router.ts'
  import {Icon} from '@iconify/vue'

  const returnToMenu = () => {
    router.push('/')
  }
</script>

<template>
  <button
    id="returnButton"
    @click="returnToMenu"
  >
    <Icon icon="solar:arrow-left-line-duotone" width="24" height="24" />
    Return to Menu
  </button>
</template>

<style scoped lang="sass">
  #returnButton
    position: absolute
    top: 1.25rem
    left: 1.25rem
    z-index: 100
</style>
