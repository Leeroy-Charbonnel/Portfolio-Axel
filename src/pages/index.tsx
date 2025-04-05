import React, { JSX } from 'react';
import type { GetStaticProps } from 'next';
import fs from 'fs';
import path from 'path';

import Layout from '../components/layout/layout';
import Home from '../components/home/home';
import MainProjects from '../components/projects/mainProjects';
import ProjectGallery from '../components/gallery/projectGallery';
import Experience from '../components/experience/experience';
import { LanguageProvider } from '../components/languageProvider';
import { Project, Experience as ExperienceType, Software } from '../types';

//Explicitly define props interface
interface HomePageProps {
  mainProjects: Project[];
  softwares: Record<string, Software>;
  galleryProjects: {
    id: string;
    title: {
      en: string;
      fr: string;
    };
    thumbnail: string;
    stats: {
      vertices: number;
      edges: number;
    };
  }[];
  experiences: ExperienceType[];
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

function HomePage(props: HomePageProps): JSX.Element {
  return (
    <LanguageProvider>
      <Layout>
        <Home />
        <MainProjects projects={props.mainProjects} softwares={props.softwares} />
        {/* <ProjectGallery projects={props.galleryProjects} />
        <Experience
          experiences={props.experiences}
          about={props.about}
          contact={props.contact}
          interests={props.interests}
        /> */}
      </Layout>
    </LanguageProvider>
  );
}

export const getStaticProps: GetStaticProps<HomePageProps> = async () => {
  try {
    const projectsPath = path.join(process.cwd(), 'src/data/projects.json');
    const experiencePath = path.join(process.cwd(), 'src/data/experience.json');

    const projectsContent = fs.readFileSync(projectsPath, 'utf8');
    const experienceContent = fs.readFileSync(experiencePath, 'utf8');

    const projectsData = JSON.parse(projectsContent);
    const experienceData = JSON.parse(experienceContent);

    return {
      props: {
        mainProjects: projectsData.mainProjects || [],
        softwares: projectsData.software || {},
        galleryProjects: projectsData.galleryProjects || [],
        experiences: experienceData.experiences || [],
        about: experienceData.about || { en: '', fr: '' },
        contact: experienceData.contact || { phone: '', email: '', instagram: '' },
        interests: experienceData.interests || { games: [], art: [] }
      },
    };
  } catch (error) {
    console.error('Error loading JSON files:', error);
    return {
      props: {
        mainProjects: [],
        softwares: {},
        galleryProjects: [],
        experiences: [],
        about: { en: '', fr: '' },
        contact: { phone: '', email: '', instagram: '' },
        interests: { games: [], art: [] }
      },
    };
  }
};

export default HomePage;