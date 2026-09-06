import { betterAuth } from "better-auth"
import { createAuthMiddleware, APIError } from "better-auth/api"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { count, eq, ne } from "drizzle-orm"
import { ALLOWED_ORIGINS, BETTER_AUTH_SECRET, BETTER_AUTH_URL, PUBLIC_APP_URL } from "./env"
import { db } from "./db/index"
import * as schema from "./db/schema"
import { mailLang, resetPasswordMessage, sendMail } from "./server/email"

//THIS SITE HAS EXACTLY ONE ACCOUNT: Axel's, and it is an admin.
//
//There is no registration form, no invite, and no role granted through the app.
//The sequence is: deploy, open /login once, create the single account, then set
//its role to admin directly in the database. From the moment that account
//exists, /sign-up/email answers 400 to everyone, and the next boot deletes any
//other account created before the promotion.
//
//This replaces createAppAuth from the shared package, which is where the hole
//was: it declared the role field without input: false, so better-auth accepted
//role: "admin" straight from the sign-up body, and it handed admin to whoever
//registered first on a fresh deployment.
//
//Every value below is validated in env.ts, which refuses to start without it.
//No default here can quietly stand in for a missing deployment variable.

export const ADMIN_ROLE = "admin"

//Registration is allowed only while the table is empty. Counted on every attempt
//rather than cached: the count is one query, and a cached flag would still say
//"empty" to the second of two simultaneous sign-ups.
async function accountCount(): Promise<number> {
  const rows = await db.select({ value: count() }).from(schema.user)
  return rows[0]?.value ?? 0
}

//Called at boot from server.ts. Promotion happens with an UPDATE in the
//database, so this is the first moment the app can see it. It deletes accounts,
//so it does nothing until an admin actually exists.
export async function enforceSingleAccount(): Promise<number> {
  const admins = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.role, ADMIN_ROLE))
    .limit(1)

  if (admins.length === 0) return 0

  //sessions, accounts and settings carry a cascade on the foreign key
  const removed = await db
    .delete(schema.user)
    .where(ne(schema.user.role, ADMIN_ROLE))
    .returning({ id: schema.user.id })

  return removed.length
}

export const auth = betterAuth({
  baseURL: BETTER_AUTH_URL,
  secret:  BETTER_AUTH_SECRET,

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user:         schema.user,
      session:      schema.session,
      account:      schema.account,
      verification: schema.verification,
    },
  }),

  emailAndPassword: {
    enabled:           true,
    minPasswordLength: 8,
    //no address enumeration to worry about: there is one account and its owner
    //knows perfectly well that it exists
    autoSignIn: true,
    revokeSessionsOnPasswordReset: true,
    //the only letter this site sends. Without it a forgotten password means
    //editing the database by hand.
    sendResetPassword: async ({ user, token }, request) => {
      const link = `${PUBLIC_APP_URL}/reset-password?token=${encodeURIComponent(token)}`
      await sendMail(user.email, resetPasswordMessage(link, mailLang(request?.headers)))
    },
  },

  //no verification mail, no google, no magic link: one account, created once, by
  //the person who owns the database

  user: {
    additionalFields: {
      role: {
        type:         "string",
        defaultValue: "user",
        //THE LINE THE SHARED PACKAGE WAS MISSING. better-auth takes any
        //additional field as input unless this says otherwise, and /update-user
        //forwards it: without it, a sign-up body carrying role: "admin" was
        //believed.
        input: false,
      },
    },
  },

  hooks: {
    //THE REGISTRATION DOOR, CLOSED FOR GOOD ONCE IT HAS BEEN USED. In front of
    //the endpoint rather than in a database hook, so the refusal costs no write.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return
      if (await accountCount() > 0) {
        throw new APIError("BAD_REQUEST", { message: "registration is closed" })
      }
    }),
  },

  databaseHooks: {
    user: {
      create: {
        before: async (userData: any) => {
          //There is deliberately no path to "admin" here. Signing up can never
          //grant it, not even to the first account.
          return { data: { ...userData, role: "user" } }
        },
      },
    },
  },

  trustedOrigins: ALLOWED_ORIGINS,
})
