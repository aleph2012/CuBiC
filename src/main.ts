import { createApp } from 'vue'
import App from './App.vue'
import router from './router.ts'
import "@/styles/main.sass"

const cubicApp = createApp(App)

cubicApp
  .use(router)
  .mount('#app')
