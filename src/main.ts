import { createApp } from "vue"
//IMPORT vue-shared-ui structural variables BEFORE project style.css so projects can override
import "vue-shared-ui/styles"
import "./style.css"
import App from "./App.vue"
import router from "./router/index"

createApp(App).use(router).mount("#app")
