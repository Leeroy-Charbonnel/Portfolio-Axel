// Project Types
export interface ProjectStats {
  vertices: number;
  edges: number;
  faces?: number;
}

export interface ProjectThumbnail {
  src: string;
  srcWireframe: string;
  alt: string;
}

export interface GalleryProject {
  id: string;
  title: {
    en: string;
    fr: string;
  };
  imageFolder: string;
  link: string;
  stats: {
    vertices: number;
    edges: number;
  };
}


export interface WireframeLight {
  index: number;
  intensity: number;
  color: string;
}

export interface WireframeParameters {
  wireframeColor?: string;
  whiteMaterialColor: string;
  lightsOverwrite: WireframeLight[];
  emissiveMaterialsOverwrite: string[]
}

export interface Project {
  modelId: string;
  imageFolder: string;
  title: {
    en: string;
    fr: string;
  };
  description: {
    en: string;
    fr: string;
  };
  thumbnailsDescriptions: {
    en: string;
    fr: string;
  }[];
  wireframeParameters: WireframeParameters;
  stats: ProjectStats;
  software: string[];
}

export interface Software {
  logo: string;
  url: string;
}


export type Language = 'en' | 'fr';

export interface NavItem {
  id: string;
  label: {
    en: string;
    fr: string;
  };
}


export interface Experience {
  period: {
    en: string;
    fr: string;
  };
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



export interface ExperienceProps {
  experiences: Experience[];
  about: {
    en: string;
    fr: string;
  };
  contact: {
    phone: string;
    email: string;
    instagram: string;
  };
  interests: {
    games: string[];
    art: string[];
  };
}





export interface AboutProps {
  about: {
    en: string;
    fr: string;
  };
  contact: {
    phone: string;
    email: string;
    instagram: string;
  };
  interests: {
    games: string[];
    art: string[];
  };
}
