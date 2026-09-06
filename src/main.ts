import { createApp } from "vue"
//IMPORT vue-shared-ui structural variables BEFORE project style.css so projects can override
//structural variables first, so style.css below can override them
import "./tokens.css"
import "./auth-card.css"
import "./style.css"
import App from "./App.vue"
import router from "./router/index"

createApp(App).use(router).mount("#app")
