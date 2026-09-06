//THE VARIABLES WITHOUT WHICH THIS PROCESS MUST NOT SERVE, CHECKED BEFORE
//ANYTHING ELSE IS IMPORTED. Every one of them used to have a fallback that hid
//its absence: a localhost origin in a production email, a session signed with a
//key printed in better-auth's own source, a restricted app quietly running open.
//The deployment that forgets one is supposed to fail at start, loudly and by
//name, not three screens later in front of a user.
const REQUIRED: Record<string, string> = {
  DATABASE_URL:       "db/index.ts opens the pool on it; nothing reads or writes without it",
  BETTER_AUTH_SECRET: "auth.ts signs sessions with it; missing, better-auth falls back to the constant \"better-auth-secret-1234...\" shipped in the library, and every cookie is signed with a key anyone can read",
  BETTER_AUTH_URL:    "better-auth builds its callbacks on it, and defaults to http://localhost:3001 - the google round-trip would come back to the container",
  PUBLIC_APP_URL:     "the address written into verification and reset links; defaults to http://localhost:5173, so production emails would point at a laptop",
  ALLOWED_ORIGINS:    "cors and trustedOrigins default to http://localhost:5173, so the real front end would be refused",
  APP_NAME:           "every letter is signed with it, and server/email.ts refuses to load without it",
  EMAIL_FROM:         "the sender every letter goes out under; server/email.ts refuses to load without it, and refuses the Resend sandbox sender, which delivers to nobody but the account owner",
}

//OPTIONAL ON PURPOSE, and each already says so where it is read: RESEND_API_KEY
//(server/email.ts warns and logs the links instead), GOOGLE_CLIENT_ID and
//GOOGLE_CLIENT_SECRET (no google provider), PORT, NODE_ENV.
//PROD_DATABASE_URL is checked by drizzle.config.prod.ts, which is the only file
//that reads it.
//VITE_AUTH_MODE is gone with the auth modes: this site has one account and one
//role, so there is nothing left for it to switch between.

const missing = Object.keys(REQUIRED).filter(name => !process.env[name]?.trim())

if (missing.length > 0) {
  console.error(
    `[env] refusing to start: ${missing.length} required environment variable(s) missing\n` +
    missing.map(name => `  ${name} - ${REQUIRED[name]}`).join("\n"),
  )
  process.exit(1)
}

export const DATABASE_URL       = process.env.DATABASE_URL!
export const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET!
export const BETTER_AUTH_URL    = process.env.BETTER_AUTH_URL!
export const PUBLIC_APP_URL     = process.env.PUBLIC_APP_URL!
export const ALLOWED_ORIGINS    = process.env.ALLOWED_ORIGINS!.split(",").map(o => o.trim())
