import { computed, ref } from "vue"
import { authClient, type SessionUser } from "../lib/authClient"

//SHARED admin state - one session lookup per app load, cached in module scope.
//editMode is a simple toggle the admin flips from the gear dropdown.
//No localStorage: session lives in the better-auth cookie, editMode is
//session-only by design (so a refresh exits edit mode cleanly).

const session  = ref<SessionUser | null>(null)
const editMode = ref(false)
const loaded   = ref(false)

let inFlight: Promise<void> | null = null

async function refreshSession() {
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const { data } = await authClient.getSession()
      session.value = (data?.user ?? null) as SessionUser | null
    } catch (e) {
      console.warn("[useAdmin] getSession failed:", e)
      session.value = null
    } finally {
      loaded.value = true
      inFlight = null
    }
  })()
  return inFlight
}

if (typeof window !== "undefined") {
  void refreshSession()
}

export function useAdmin() {
  const isAdmin    = computed(() => session.value?.role === "admin")
  const isLoggedIn = computed(() => session.value !== null)

  function toggleEdit() {
    if (!isAdmin.value) return
    editMode.value = !editMode.value
  }

  async function signOut() {
    await authClient.signOut()
    session.value = null
    editMode.value = false
  }

  return {
    session,
    isAdmin,
    isLoggedIn,
    editMode,
    loaded,
    toggleEdit,
    signOut,
    refresh: refreshSession,
  }
}
