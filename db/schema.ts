import { pgTable, serial, text, timestamp, boolean, unique, primaryKey } from "drizzle-orm/pg-core"

//TRANSLATIONS TABLE - source of truth for every translatable string in the app.
//id is a human-readable key (LBL_LOGOUT, SETTING_ACCENT_DESC, etc.), lang is fr/en,
//value is the displayed text. Composite primary key (id, lang). Public read,
//admin-only write.
export const translations = pgTable("translations", {
  id:    text("id").notNull(),
  lang:  text("lang").notNull(),
  value: text("value").notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.id, t.lang] }),
}))

//SETTINGS TABLE - common shape across all projects (see vue-shared-ui SettingsPage)
//type drives the UI input: bool | string | number | color | select | list | json
//options (JSON-encoded) is used by:
//  - "select": [{ label, value }] or [string] - dropdown choices
//  - "list":   not required (value itself is a JSON array)
//  - other:    ignored
export const settings = pgTable("settings", {
  id:          serial("id").primaryKey(),
  userId:      text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  key:         text("key").notNull(),
  value:       text("value").notNull().default(""),
  description: text("description").notNull().default(""),
  type:        text("type").notNull().default("string"),
  group:       text("group").notNull().default("general"),
  options:     text("options").notNull().default(""),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniqUserKey: unique().on(t.userId, t.key),
}))

//AUTH TABLES (required by better-auth)
export const user = pgTable("user", {
  id:            text("id").primaryKey(),
  name:          text("name").notNull(),
  email:         text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image:         text("image"),
  role:          text("role").notNull().default("user"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
})

export const session = pgTable("session", {
  id:        text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token:     text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId:    text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id:                    text("id").primaryKey(),
  accountId:             text("account_id").notNull(),
  providerId:            text("provider_id").notNull(),
  userId:                text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken:           text("access_token"),
  refreshToken:          text("refresh_token"),
  idToken:               text("id_token"),
  accessTokenExpiresAt:  timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope:                 text("scope"),
  password:              text("password"),
  createdAt:             timestamp("created_at").notNull().defaultNow(),
  updatedAt:             timestamp("updated_at").notNull().defaultNow(),
})

export const verification = pgTable("verification", {
  id:         text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value:      text("value").notNull(),
  expiresAt:  timestamp("expires_at").notNull(),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
  updatedAt:  timestamp("updated_at").notNull().defaultNow(),
})
