import { defineConfig } from "drizzle-kit";

//PRODUCTION config, reached only by the :prod scripts. Everything else uses
//drizzle.config.ts and the dev database. There is no flag that switches this -
//a flag can be left set and forgotten; a command name cannot.
if (!process.env.PROD_DATABASE_URL) {
  throw new Error("PROD_DATABASE_URL is not set - refusing to fall back to the dev database")
}

export default defineConfig({
  schema:    "./db/schema.ts",
  out:       "./drizzle",
  dialect:   "postgresql",
  dbCredentials: {
    url: process.env.PROD_DATABASE_URL,
  },
});
