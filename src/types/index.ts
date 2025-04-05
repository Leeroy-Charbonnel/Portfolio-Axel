// Project Types
export interface ProjectStats {
  vertices: number;
  edges: number;
  faces?: number;
  triangles?: number;
}

export interface ProjectThumbnail {
  src: string;
  srcWireframe?: string; // Path to wireframe version of the thumbnail
  alt: string;
}

export interface Project {
  modelId: any;
  id: string;
  imageFolder: string;
  title: {
    en: string;
    fr: string;
  };
  description: {
    en: string;
    fr: string;
  };
  modelLink: string;
  thumbnails: ProjectThumbnail[];
  wireframeImage?: string; // Optional path to main wireframe image
  stats: ProjectStats;
  software: string[];
}

export interface Software {
  logo: string;
  url: string;
}
// Language type
export type Language = 'en' | 'fr';

// Experience Type
export interface Experience {
  period: string;
  title: {
    en: string;
    fr: string;
  };
  company: string;
  location: string;
  description: {
    en: string[];
    fr: string[];
  };
}

// Navigation Item Type
export interface NavItem {
  id: string;
  label: {
    en: string;
    fr: string;
  };
}