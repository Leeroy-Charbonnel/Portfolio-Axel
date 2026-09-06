import { createAuthClient } from "better-auth/vue"

//SHARED authClient - paths are relative so every project's API works
//role and additional user fields are typed as `any` here to keep this dep-free for projects
//no plugins: auth.ts declares none. The magic-link client used to be loaded
//here against a server that has no magic-link endpoint.
export const authClient = createAuthClient()

export type SessionUser = typeof authClient.$Infer.Session.user & { role?: string }
