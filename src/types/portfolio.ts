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

//3D MODEL ASSET - returned by GET /api/models. Reusable across the
//main project viewer and viewer3d detail-page blocks. viewerSettings
//is left untyped (it's the editor's snapshot blob, same shape as the
//ThreeViewer ViewerSettings interface).
export interface Model3dView {
  name:      string
  position:  [number, number, number]
  target:    [number, number, number]
  zoom?:     number
  wireframe: boolean
}
export interface Model3dDto {
  id:              number
  name:            string
  glbFileId:       string
  glbUrl:          string
  thumbnailFileId: string | null
  thumbnailUrl:    string | null
  viewerSettings:  unknown | null
  views:           Model3dView[]
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

//DETAIL PAGE - per-project content grid (bento-style). Authored via the
//page editor, rendered on the public detail page route.
//- text:     markdown source per language
//- image:    file row + resolved url
//- viewer3d: embeds the parent project's own ThreeViewer (no per-block
//            settings - it inherits glbUrl + viewerSettings from the
//            project, so the block is just a placement marker).
export type DetailBlockType = "text" | "image" | "viewer3d"

export interface DetailBlock {
  id:       string
  type:     DetailBlockType
  //Grid coords on the 3-col desktop layout. Each unit = 1 column wide.
  //Row units = 1 grid row of fixed height (set in CSS, ~200px).
  x:        number    //0..2
  y:        number    //0..N
  w:        number    //1..3
  h:        number    //>=1
  //Mobile layout is a separate, single-column stack. mobileY = row index,
  //mobileH = row span. No mobileX/mobileW because every block spans the
  //full width on mobile. When undefined, mobile rendering falls back to
  //the desktop y / h.
  mobileY?: number
  mobileH?: number
  content:  DetailBlockContent
}

//Per-type content. Union narrowed by DetailBlock.type at usage sites.
export type DetailBlockContent =
  | { text:   Bilingual }                                            //type: "text"
  | { fileId: string | null; url: string | null; alt?: Bilingual }   //type: "image"
  | { model3dId: number | null; desktopView: string; mobileView: string }  //type: "viewer3d"

export interface DetailPage {
  blocks: DetailBlock[]
}

export interface MainProjectDto {
  id:                  number
  modelId:             string
  layout:              MainProjectLayout
  title:               Bilingual
  description:         Bilingual
  mainImageUrl:        string | null
  mainWireframeUrl:    string | null
  videoUrl:            string | null
  //3D model reference - the project's viewer picks a model + which
  //named view to apply per breakpoint. model3dId is null until the
  //admin assigns one (or until the migration script has run).
  model3dId:           number | null
  model3dDesktopView:  string
  model3dMobileView:   string
  //Legacy fields - still resolved by the server from the file/blob
  //attached to this row, kept here so the migration script can read
  //them. Will be removed once every project has been moved over.
  glbFileId:           string | null
  glbUrl:              string | null
  viewerSettings:      unknown | null
  thumbnails:          ThumbnailDto[]
  wireframeParameters: WireframeParameters
  detailPage:          DetailPage
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

//Global editor preferences (admin's settings table rows). Public viewers
//(ThreeViewer) layer these over the per-project values so a tweak in
//one project propagates to every model on the site.
export interface EditorPrefsDto {
  wireframeLineColor:     string | null
  wireframeModeColor:     string | null
  wireframeMaterial:      string | null  //JSON-encoded WfMatParams
  wireframeEdgeThreshold: string | null  //degrees, stored as string in settings table
}

export interface PortfolioDto {
  software:        SoftwareDto[]
  models:          Model3dDto[]
  mainProjects:    MainProjectDto[]
  galleryProjects: GalleryProjectDto[]
  experiences:     ExperienceDto[]
  profile:         ProfileDto | null
  editorPrefs:     EditorPrefsDto
}
