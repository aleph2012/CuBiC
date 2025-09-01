import {createRouter, createWebHistory, type Router} from 'vue-router'
import MenuView from '@/views/MenuView.vue'
import PCView from '@/views/PCView.vue'
import MobileView from '@/views/MobileView.vue'
import VRView from '@/views/VRView.vue'

const router: Router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: MenuView },
    { path: '/pc', component: PCView },
    { path: '/mobile', component: MobileView },
    { path: '/vr', component: VRView }
  ],
})

export default router
