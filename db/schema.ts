import { pgTable, serial, text, integer, jsonb, uuid, timestamp, boolean, unique, primaryKey } from "drizzle-orm/pg-core"

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

//PORTFOLIO TABLES ------------------------------------------------------------

//FILE - generic storage table. Each row points to a binary file on disk
//under storage/files/{stored_filename}. URL served at /media/{stored_filename}.
//Images and videos both live here; the 'kind' column lets the admin filter.
export const file = pgTable("file", {
  id:               uuid("id").primaryKey().defaultRandom(),
  originalFilename: text("original_filename").notNull(),
  storedFilename:   text("stored_filename").notNull().unique(),
  mimeType:         text("mime_type").notNull(),
  sizeBytes:        integer("size_bytes").notNull(),
  kind:             text("kind").notNull().default("other"),
  uploadedBy:       text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
})

//SOFTWARE - logos shown next to a main project (Blender, Substance, etc.)
export const software = pgTable("software", {
  id:         serial("id").primaryKey(),
  key:        text("key").notNull().unique(),
  logoFileId: uuid("logo_file_id").notNull().references(() => file.id, { onDelete: "restrict" }),
  url:        text("url").notNull(),
  sortOrder:  integer("sort_order").notNull().default(0),
})

//MAIN_PROJECT - the 3 featured projects with Sketchfab embeds + wireframe toggle.
//Bilingual fields (title, description) stored as jsonb { en, fr } for easy
//editing from a future admin UI. wireframe_parameters keeps its nested shape
//rather than expanding into 4 columns - admin form will edit the JSON directly.
export const mainProject = pgTable("main_project", {
  id:                   serial("id").primaryKey(),
  modelId:              text("model_id").notNull().default(""),
  title:                jsonb("title").$type<{ en: string; fr: string }>().notNull(),
  description:          jsonb("description").$type<{ en: string; fr: string }>().notNull(),
  //LAYOUT controls how the viewer + thumbnails are arranged.
  //thumbs-left   : 3 vertical thumbnails on the left, viewer on the right
  //thumbs-right  : 3 vertical thumbnails on the right, viewer on the left
  //thumbs-bottom : viewer full-width, 3 thumbnails in a row below
  //viewer-only   : just the viewer, no thumbnail strip
  //existing rows default to thumbs-left; admins can pick another via the UI.
  layout:               text("layout").notNull().default("thumbs-left"),
  mainImageFileId:      uuid("main_image_file_id").references(() => file.id, { onDelete: "set null" }),
  mainWireframeFileId:  uuid("main_wireframe_file_id").references(() => file.id, { onDelete: "set null" }),
  //3D MODEL - when set, the portfolio renders this project via the local
  //Three.js viewer instead of the Sketchfab iframe. The .glb file lives
  //in storage like every other binary; viewer_settings is the editor
  //snapshot (materials / lights / HDR / wireframe picks) the viewer
  //applies at load.
  glbFileId:            uuid("glb_file_id").references(() => file.id, { onDelete: "set null" }),
  viewerSettings:       jsonb("viewer_settings"),
  thumbnails:           jsonb("thumbnails").$type<{
                          fileId:          string
                          wireframeFileId: string | null
                          description:     { en: string; fr: string }
                        }[]>().notNull().default([]),
  videoFileId:          uuid("video_file_id").references(() => file.id, { onDelete: "set null" }),
  wireframeParameters:  jsonb("wireframe_parameters").$type<{
                          wireframeColor?:             string
                          whiteMaterialColor:          string
                          lightsOverwrite:             { index: number; intensity?: number; color: string }[]
                          emissiveMaterialsOverwrite:  string[]
                        }>().notNull(),
  //DETAIL PAGE - bento-style grid of content blocks for the per-project
  //detail page (text, image, video, carousel, etc.). 3-col grid on
  //desktop, 1-col stack on mobile (forced). Authored via the page
  //editor; the public detail page route renders the same data.
  //Mobile layout is independent: mobileY orders blocks vertically and
  //mobileH sets the row span. No mobileX/mobileW because mobile is
  //single column - every block fills the width. Both are optional;
  //when absent, view rendering falls back to desktop y / h.
  detailPage:           jsonb("detail_page").$type<{
                          blocks: Array<{
                            id:       string
                            type:     "text" | "image"
                            x:        number   //grid col start (0..2)
                            y:        number   //grid row start
                            w:        number   //col span (1..3)
                            h:        number   //row span (>=1)
                            mobileY?: number   //mobile row start (single col)
                            mobileH?: number   //mobile row span
                            content:  Record<string, unknown>
                          }>
                        }>().notNull().default({ blocks: [] }),
  stats:                jsonb("stats").$type<{ vertices: number; edges: number; faces?: number; triangles?: number }>().notNull(),
  sortOrder:            integer("sort_order").notNull().default(0),
  createdAt:            timestamp("created_at").notNull().defaultNow(),
  updatedAt:            timestamp("updated_at").notNull().defaultNow(),
})

//MAIN_PROJECT_SOFTWARE - junction. sort_order controls the order in which the
//logos render under a given project.
export const mainProjectSoftware = pgTable("main_project_software", {
  mainProjectId: integer("main_project_id").notNull().references(() => mainProject.id, { onDelete: "cascade" }),
  softwareId:    integer("software_id").notNull().references(() => software.id, { onDelete: "cascade" }),
  sortOrder:     integer("sort_order").notNull().default(0),
}, (t) => ({
  pk: primaryKey({ columns: [t.mainProjectId, t.softwareId] }),
}))

//GALLERY_PROJECT - the 8 smaller cards under "Project Gallery"
export const galleryProject = pgTable("gallery_project", {
  id:          serial("id").primaryKey(),
  title:       jsonb("title").$type<{ en: string; fr: string }>().notNull(),
  link:        text("link").notNull(),
  imageFileId: uuid("image_file_id").references(() => file.id, { onDelete: "set null" }),
  stats:       jsonb("stats").$type<{ vertices: number; edges: number; faces?: number; triangles?: number }>().notNull(),
  sortOrder:   integer("sort_order").notNull().default(0),
})

//EXPERIENCE - work timeline.
//- summary: optional paragraph description per language (intro to the role)
//- description: bullet-list of highlights per language (edited entry by entry)
export const experience = pgTable("experience", {
  id:          serial("id").primaryKey(),
  period:      jsonb("period").$type<{ en: string; fr: string }>().notNull(),
  title:       jsonb("title").$type<{ en: string; fr: string }>().notNull(),
  company:     text("company").notNull(),
  location:    text("location").notNull(),
  summary:     jsonb("summary").$type<{ en: string; fr: string }>().notNull().default({ en: "", fr: "" }),
  description: jsonb("description").$type<{ en: string[]; fr: string[] }>().notNull(),
  sortOrder:   integer("sort_order").notNull().default(0),
})

//PROFILE - single-row table that holds the "About me" copy + contact + interests.
//A new row is created on seed; the admin updates id=1 going forward.
export const profile = pgTable("profile", {
  id:        serial("id").primaryKey(),
  about:     jsonb("about").$type<{ en: string; fr: string }>().notNull(),
  contact:   jsonb("contact").$type<{ phone: string; email: string; instagram: string }>().notNull(),
  interests: jsonb("interests").$type<{ games: string[]; art: string[] }>().notNull(),
  avatarUrl: text("avatar_url").notNull().default(""),
})

//AUTH TABLES (required by better-auth) ---------------------------------------
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
