import { Resend } from "resend"
import { createAppAuth, type AuthMode, type SendEmailArgs } from "vue-shared-ui/server"
import { db } from "./db/index"
import * as schema from "./db/schema"

const apiKey = process.env.RESEND_API_KEY
const from   = process.env.EMAIL_FROM ?? "onboarding@resend.dev"

//Fail LOUDLY at boot when the auth secret is missing - passing undefined
//through would let better-auth run with a broken signing key (rule #4).
const authSecret = process.env.BETTER_AUTH_SECRET
if (!authSecret) {
  throw new Error("BETTER_AUTH_SECRET is not set - refusing to boot with an unsigned session store")
}

let resend: Resend | null = null
async function sendEmail(args: SendEmailArgs) {
  if (!apiKey) {
    //dev mode: no Resend key configured - emails are logged by createAppAuth fallback
    //but we still want to log here for visibility
    console.warn(`[email] RESEND_API_KEY missing - would send to=${args.to} subject="${args.subject}"`)
    return
  }
  if (!resend) resend = new Resend(apiKey)
  const { error } = await resend.emails.send({ from, to: args.to, subject: args.subject, html: args.html })
  if (error) throw new Error(`email send failed: ${error.message}`)
}

export const auth = createAppAuth({
  db,
  schema: {
    user:         schema.user,
    session:      schema.session,
    account:      schema.account,
    verification: schema.verification,
  },
  sendEmail:          apiKey ? sendEmail : undefined,
  appName:            process.env.APP_NAME       ?? "App",
  authMode:          (process.env.VITE_AUTH_MODE ?? "open") as AuthMode,
  baseURL:            process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
  publicAppUrl:       process.env.PUBLIC_APP_URL  ?? "http://localhost:5173",
  secret:             authSecret,
  googleClientId:     process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  allowedOrigins:     process.env.ALLOWED_ORIGINS?.split(",") ?? ["http://localhost:5173"],
})
