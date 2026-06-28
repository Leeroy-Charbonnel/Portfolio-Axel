import { createRouter, createWebHistory } from "vue-router"
import HomePage              from "../pages/HomePage.vue"
import SettingsPage          from "../pages/SettingsPage.vue"
import ModelEditorPage       from "../pages/ModelEditorPage.vue"
import ProjectDetailPage     from "../pages/ProjectDetailPage.vue"
import {
  LoginPage,
  PendingPage,
  BannedPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  authClient,
  type SessionUser,
} from "vue-shared-ui"

const AUTH_MODE = import.meta.env.VITE_AUTH_MODE ?? "public"

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    //Portfolio public landing page - single-page scroll layout
    { path: "/",                component: HomePage },

    //Settings page kept available so the user can tweak accent_color / theme
    //even in public mode. Drop the route if you don't want users on /settings.
    { path: "/settings",        component: SettingsPage },

    //Three.js model editor - per-project edit page. Replaces the Sketchfab
    //iframe with a local viewer when a .glb has been uploaded.
    { path: "/edit-3d/:id(\\d+)", component: ModelEditorPage },

    //Project detail page - serves BOTH the public read-only render and
    //the bento-grid editor. Flipping useAdmin().editMode swaps the page
    //between view and edit modes (no separate /edit-detail route).
    { path: "/project/:id(\\d+)", component: ProjectDetailPage },

    //Legacy /edit-detail/:id from before the merge - redirect any
    //existing bookmarks to the unified /project/:id route.
    { path: "/edit-detail/:id(\\d+)", redirect: (to) => `/project/${to.params.id}` },

    //Auth pages from vue-shared-ui. Only reachable if AUTH_MODE != "public".
    { path: "/login",           component: LoginPage },
    { path: "/forgot-password", component: ForgotPasswordPage },
    { path: "/reset-password",  component: ResetPasswordPage },
    { path: "/pending",         component: PendingPage },
    { path: "/banned",          component: BannedPage },
  ],
})

//AUTH GUARD - identical pattern to the template
router.beforeEach(async (to) => {
  if (AUTH_MODE === "public") return true
  if (!to.meta.requiresAuth) return true

  const { data: session } = await authClient.getSession()
  if (!session?.user) return "/login"

  if ((session.user as SessionUser).role === "banned") {
    if (to.path !== "/banned") return "/banned"
    return true
  }

  if (AUTH_MODE === "restricted" && (session.user as SessionUser).role === "pending") {
    if (to.path !== "/pending") return "/pending"
  }

  return true
})

export default router
