//PORTFOLIO domain types - shape returned by GET /api/portfolio. Mirrors the
//DB tables in db/schema.ts but with file ids resolved to /media URLs.

export interface Bilingual {
  en: string
  fr: string
}

export interface ProjectStats {
  vertices:   number
  edges:      number
  faces?:     number
  triangles?: number
}

export interface WireframeLight {
  index:      number
  intensity?: number
  color:      string
}

export interface WireframeParameters {
  wireframeColor?:             string
  whiteMaterialColor:          string
  lightsOverwrite:             WireframeLight[]
  emissiveMaterialsOverwrite:  string[]
}

export interface SoftwareDto {
  id:          number
  key:         string
  url:         string
  logoFileId:  string | null
  logoUrl:     string | null
}

export interface ThumbnailDto {
  fileId:          string | null
  wireframeFileId: string | null
  url:             string | null
  wireframeUrl:    string | null
  description:     Bilingual
}

export type MainProjectLayout = "thumbs-left" | "thumbs-right" | "thumbs-bottom" | "viewer-only"

export const MAIN_PROJECT_LAYOUTS: { key: MainProjectLayout; label: string }[] = [
  { key: "thumbs-left",   label: "Thumbnails left" },
  { key: "thumbs-right",  label: "Thumbnails right" },
  { key: "thumbs-bottom", label: "Thumbnails bottom" },
  { key: "viewer-only",   label: "Viewer only" },
]

export interface MainProjectDto {
  id:                  number
  modelId:             string
  layout:              MainProjectLayout
  title:               Bilingual
  description:         Bilingual
  mainImageUrl:        string | null
  mainWireframeUrl:    string | null
  videoUrl:            string | null
  glbFileId:           string | null
  glbUrl:              string | null
  viewerSettings:      unknown | null
  thumbnails:          ThumbnailDto[]
  wireframeParameters: WireframeParameters
  stats:               ProjectStats
  software:            SoftwareDto[]
}

export interface GalleryProjectDto {
  id:       number
  title:    Bilingual
  link:     string
  imageUrl: string | null
  stats: {
    vertices:   number
    edges:      number
    faces?:     number
    triangles?: number
  }
}

export interface ExperienceDto {
  id:          number
  period:      Bilingual
  title:       Bilingual
  company:     string
  location:    string
  summary:     Bilingual
  description: { en: string[]; fr: string[] }
}

export interface ProfileDto {
  about:     Bilingual
  contact:   { phone: string; email: string; instagram: string }
  interests: { games: string[]; art: string[] }
  avatarUrl: string
}

export interface PortfolioDto {
  software:        SoftwareDto[]
  mainProjects:    MainProjectDto[]
  galleryProjects: GalleryProjectDto[]
  experiences:     ExperienceDto[]
  profile:         ProfileDto | null
}
