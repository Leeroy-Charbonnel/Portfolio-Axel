CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experience" (
	"id" serial PRIMARY KEY NOT NULL,
	"period" jsonb NOT NULL,
	"title" jsonb NOT NULL,
	"company" text NOT NULL,
	"location" text NOT NULL,
	"summary" jsonb DEFAULT '{"en":"","fr":""}'::jsonb NOT NULL,
	"description" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_filename" text NOT NULL,
	"stored_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "file_stored_filename_unique" UNIQUE("stored_filename")
);
--> statement-breakpoint
CREATE TABLE "gallery_project" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" jsonb NOT NULL,
	"link" text NOT NULL,
	"image_file_id" uuid,
	"stats" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main_project" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_id" text DEFAULT '' NOT NULL,
	"title" jsonb NOT NULL,
	"description" jsonb NOT NULL,
	"layout" text DEFAULT 'thumbs-left' NOT NULL,
	"main_image_file_id" uuid,
	"main_wireframe_file_id" uuid,
	"model_3d_id" uuid,
	"model_3d_desktop_view" text DEFAULT '' NOT NULL,
	"model_3d_mobile_view" text DEFAULT '' NOT NULL,
	"glb_file_id" uuid,
	"viewer_settings" jsonb,
	"thumbnails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"video_file_id" uuid,
	"wireframe_parameters" jsonb NOT NULL,
	"detail_page" jsonb DEFAULT '{"blocks":[]}'::jsonb NOT NULL,
	"stats" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main_project_software" (
	"main_project_id" integer NOT NULL,
	"software_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "main_project_software_main_project_id_software_id_pk" PRIMARY KEY("main_project_id","software_id")
);
--> statement-breakpoint
CREATE TABLE "model_3d" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"glb_file_id" uuid NOT NULL,
	"thumbnail_file_id" uuid,
	"viewer_settings" jsonb,
	"views" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" serial PRIMARY KEY NOT NULL,
	"about" jsonb NOT NULL,
	"contact" jsonb NOT NULL,
	"interests" jsonb NOT NULL,
	"avatar_url" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'string' NOT NULL,
	"group" text DEFAULT 'general' NOT NULL,
	"options" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "settings_user_id_key_unique" UNIQUE("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "software" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"logo_file_id" uuid NOT NULL,
	"url" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "software_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "translations" (
	"id" text NOT NULL,
	"lang" text NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "translations_id_lang_pk" PRIMARY KEY("id","lang")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_project" ADD CONSTRAINT "gallery_project_image_file_id_file_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main_project" ADD CONSTRAINT "main_project_main_image_file_id_file_id_fk" FOREIGN KEY ("main_image_file_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main_project" ADD CONSTRAINT "main_project_main_wireframe_file_id_file_id_fk" FOREIGN KEY ("main_wireframe_file_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main_project" ADD CONSTRAINT "main_project_model_3d_id_model_3d_id_fk" FOREIGN KEY ("model_3d_id") REFERENCES "public"."model_3d"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main_project" ADD CONSTRAINT "main_project_glb_file_id_file_id_fk" FOREIGN KEY ("glb_file_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main_project" ADD CONSTRAINT "main_project_video_file_id_file_id_fk" FOREIGN KEY ("video_file_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main_project_software" ADD CONSTRAINT "main_project_software_main_project_id_main_project_id_fk" FOREIGN KEY ("main_project_id") REFERENCES "public"."main_project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main_project_software" ADD CONSTRAINT "main_project_software_software_id_software_id_fk" FOREIGN KEY ("software_id") REFERENCES "public"."software"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_3d" ADD CONSTRAINT "model_3d_glb_file_id_file_id_fk" FOREIGN KEY ("glb_file_id") REFERENCES "public"."file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_3d" ADD CONSTRAINT "model_3d_thumbnail_file_id_file_id_fk" FOREIGN KEY ("thumbnail_file_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "software" ADD CONSTRAINT "software_logo_file_id_file_id_fk" FOREIGN KEY ("logo_file_id") REFERENCES "public"."file"("id") ON DELETE restrict ON UPDATE no action;