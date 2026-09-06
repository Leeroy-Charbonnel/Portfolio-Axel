import { createRouter, createWebHistory } from "vue-router"
import HomePage              from "../pages/HomePage.vue"
import SettingsPage          from "../pages/SettingsPage.vue"
import ModelEditorPage       from "../pages/ModelEditorPage.vue"
import ProjectDetailPage     from "../pages/ProjectDetailPage.vue"
import LoginPage          from "../pages/LoginPage.vue"
import ForgotPasswordPage from "../pages/ForgotPasswordPage.vue"
import ResetPasswordPage  from "../pages/ResetPasswordPage.vue"
import { authClient, type SessionUser } from "../lib/authClient"

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    //Portfolio public landing page - single-page scroll layout
    { path: "/",                component: HomePage },

    //ADMIN ONLY. The API already refuses every write from a non-admin; the flag
    //stops the screen from drawing at all, which the previous guard did not do:
    //no route carried a meta flag, so it returned true on its second line every
    //time and these pages opened for anyone who typed the address.
    { path: "/settings",        component: SettingsPage, meta: { requiresAdmin: true } },

    //Three.js model editor - per-model edit page. model_3d rows use uuid
    //primary keys since the uuid migration, so the param accepts hex+dashes
    //(the old \d+ constraint silently 404'd every model after the migration).
    { path: "/edit-3d/:id([0-9a-fA-F-]+)", component: ModelEditorPage, meta: { requiresAdmin: true } },

    //Project detail page - serves BOTH the public read-only render and
    //the bento-grid editor. Flipping useAdmin().editMode swaps the page
    //between view and edit modes (no separate /edit-detail route).
    { path: "/project/:id(\\d+)", component: ProjectDetailPage },

    //Legacy /edit-detail/:id from before the merge - redirect any
    //existing bookmarks to the unified /project/:id route.
    { path: "/edit-detail/:id(\\d+)", redirect: (to) => `/project/${to.params.id}` },

    //Auth pages, now in this repo: the template is copied, never linked.
    //Nothing in the interface links to /login - it is reached by typing it.
    { path: "/login",           component: LoginPage },
    { path: "/forgot-password", component: ForgotPasswordPage },
    { path: "/reset-password",  component: ResetPasswordPage },
  ],
})

//AUTH GUARD
//This site has one account and it is the admin, so there is a single question to
//ask: is the visitor that account? No auth mode to read, no pending state, no
//banned state - a role other than "admin" can do nothing here, and the boot
//deletes those accounts anyway.
//
//"/" and "/project/:id" stay public: the detail page serves the read-only render
//to everyone and only turns into an editor when useAdmin().editMode is on, which
//needs the session the API checks on every write.
router.beforeEach(async (to) => {
  if (!to.meta.requiresAdmin) return true

  const { data: session } = await authClient.getSession()
  //back to the portfolio rather than to /login: someone who guessed an editor
  //address is not someone to hand a sign-in form to
  if (!session?.user) return "/"

  return (session.user as SessionUser).role === "admin" ? true : "/"
})

export default router
