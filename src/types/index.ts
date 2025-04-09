// Project Types
export interface ProjectStats {
  vertices: number;
  edges: number;
  faces?: number;
  triangles?: number;
}

export interface ProjectThumbnail {
  src: string;
  srcWireframe: string;
  alt: string;
}

export interface WireframeLight {
  index: number;
  intensity: number;
  color: string;
}

export interface WireframeParameters {
  wireframeColor?: string;
  whiteMaterialColor?: number[];
  lights: WireframeLight[];
}

export interface Project {
  id?: string;
  imageFolder: string;
  title: {
    en: string;
    fr: string;
  };
  description: {
    en: string;
    fr: string;
  };
  modelId: string;
  thumbnails: ProjectThumbnail[];
  wireframeParameters: WireframeParameters;
  stats: ProjectStats;
  software: string[];
}

export interface Software {
  logo: string;
  url: string;
}


export type Language = 'en' | 'fr';

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

export interface NavItem {
  id: string;
  label: {
    en: string;
    fr: string;
  };
}