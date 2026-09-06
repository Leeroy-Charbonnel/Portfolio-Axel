import { computed } from "vue"
import { useRouter } from "vue-router"
import { authClient, type SessionUser } from "../lib/authClient"

export function useAuth() {
  const router  = useRouter()
  const session = authClient.useSession()

  const user            = computed(() => session.value.data?.user ?? null)
  const isAuthenticated = computed(() => !!session.value.data?.user)
  const role            = computed(() => (session.value.data?.user as SessionUser | undefined)?.role ?? null)
  const isPending       = computed(() => role.value === "pending")
  const isAdmin         = computed(() => role.value === "admin")

  async function signIn(email: string, password: string) {
    const { error } = await authClient.signIn.email({ email, password })
    if (error) throw new Error(error.message)
  }

  async function signUp(name: string, email: string, password: string) {
    const { error } = await authClient.signUp.email({ name, email, password })
    if (error) throw new Error(error.message)
  }

  async function signInWithGoogle() {
    //callbackURL must be absolute - relative paths resolve to BETTER_AUTH_URL
    //(the API server) instead of the frontend origin, causing "Cannot GET /"
    //after the OAuth roundtrip
    const callbackURL = typeof window !== "undefined" ? `${window.location.origin}/` : "/"
    const { error } = await (authClient as any).signIn.social({ provider: "google", callbackURL })
    if (error) throw new Error(error.message)
  }

  //absolute for the same reason as Google above: the link is verified by the api,
  //which resolves a relative path against its own origin and lands the browser
  //on "Cannot GET /"
  async function sendSignInLink(email: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL:      `${origin}/`,
      errorCallbackURL: `${origin}/login`,
    })
    if (error) throw new Error(error.message)
  }

  async function requestPasswordReset(email: string) {
    const { error } = await (authClient as any).requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    })
    if (error) throw new Error(error.message)
  }

  async function resetPassword(token: string, newPassword: string) {
    const { error } = await (authClient as any).resetPassword({ token, newPassword })
    if (error) throw new Error(error.message)
  }

  async function sendVerificationEmail(email: string) {
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/" })
    if (error) throw new Error(error.message)
  }

  async function signOut() {
    await authClient.signOut()
    router.push("/login")
  }

  return {
    session, user, isAuthenticated, role, isPending, isAdmin,
    signIn, signUp, signInWithGoogle, sendSignInLink, signOut,
    requestPasswordReset, resetPassword, sendVerificationEmail,
  }
}
