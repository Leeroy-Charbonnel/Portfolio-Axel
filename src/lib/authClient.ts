import { createAuthClient } from "better-auth/vue"
import { magicLinkClient } from "better-auth/client/plugins"

//SHARED authClient - paths are relative so every project's API works
//role and additional user fields are typed as `any` here to keep this dep-free for projects
export const authClient = createAuthClient({ plugins: [magicLinkClient()] })

export type SessionUser = typeof authClient.$Infer.Session.user & { role?: string }
