import { createApp } from "vue"
//structural variables before style.css, so the project palette can override them
//structural variables first, so style.css below can override them
import "./tokens.css"
import "./auth-card.css"
import "./style.css"
import App from "./App.vue"
import router from "./router/index"

createApp(App).use(router).mount("#app")
