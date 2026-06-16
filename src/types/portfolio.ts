//PORTFOLIO domain types - mirror the data shape in src/data/projects.json
//and src/data/experience.json. Imported by every portfolio section component.

export interface Bilingual {
  en: string
  fr: string
}

export interface ProjectStats {
  vertices: number
  edges:    number
  faces?:   number
}

export interface WireframeLight {
  index:      number
  intensity?: number
  color:      string
}

export interface WireframeParameters {
  wireframeColor?:              string
  whiteMaterialColor:           string
  lightsOverwrite:              WireframeLight[]
  emissiveMaterialsOverwrite:   string[]
}

export interface Project {
  modelId:                 string
  imageFolder:             string
  title:                   Bilingual
  description:             Bilingual
  thumbnailsDescriptions:  Bilingual[]
  wireframeParameters:     WireframeParameters
  stats:                   ProjectStats
  software:                string[]
}

export interface GalleryProject {
  id?:         string
  title:       Bilingual
  link:        string
  imageFolder: string
  stats: {
    vertices: number
    edges:    number
  }
}

export interface Software {
  logo: string
  url:  string
}

export interface Experience {
  period:      Bilingual
  title:       Bilingual
  company:     string
  location:    string
  description: {
    en: string[]
    fr: string[]
  }
}

export interface Contact {
  phone:     string
  email:     string
  instagram: string
}

export interface Interests {
  games: string[]
  art:   string[]
}

export interface ProjectsData {
  software:        Record<string, Software>
  mainProjects:    Project[]
  galleryProjects: GalleryProject[]
}

export interface ExperienceData {
  experiences: Experience[]
  contact:     Contact
  interests:   Interests
  about:       Bilingual
}
