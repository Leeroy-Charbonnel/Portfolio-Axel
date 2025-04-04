// Project Types
export interface ProjectStats {
  vertices: number;
  edges: number;
  faces?: number;
}

export interface ProjectThumbnail {
  src: string;
  alt: string;
}

export interface Project {
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
  stats: ProjectStats;
  software: string[];
  template: 'template1' | 'template2';
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