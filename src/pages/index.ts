import React from 'react';
import { GetStaticProps } from 'next';
import fs from 'fs';
import path from 'path';
import Layout from '../components/layout/layout';
import Home from '../components/home/home';
import MainProjects from '../components/projects/mainProjects';
import ProjectGallery from '../components/gallery/projectGallery';
import Experience from '../components/experience/experience';
import { LanguageProvider } from '../hooks/useLanguage';
import { Project, Experience as ExperienceType } from '../types';

interface HomePageProps {
  mainProjects: Project[];
  galleryProjects: any[];
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

const HomePage: React.FC<HomePageProps> = ({ 
  mainProjects, 
  galleryProjects, 
  experiences, 
  about, 
  contact, 
  interests 
}) => {
  return (
    <LanguageProvider>
      <Layout>
        <Home />
        <MainProjects projects={mainProjects} />
        <ProjectGallery projects={galleryProjects} />
        <Experience 
          experiences={experiences} 
          about={about}
          contact={contact}
          interests={interests}
        />
      </Layout>
    </LanguageProvider>
  );
};

export const getStaticProps: GetStaticProps = async () => {
  //In a real project, these would be loaded from json files
  //For now, let's simulate loading from the JSON
  const projectsPath = path.join(process.cwd(), 'src/data/projects.json');
  const experiencePath = path.join(process.cwd(), 'src/data/experience.json');
  
  const projectsContent = fs.readFileSync(projectsPath, 'utf8');
  const experienceContent = fs.readFileSync(experiencePath, 'utf8');
  
  const projectsData = JSON.parse(projectsContent);
  const experienceData = JSON.parse(experienceContent);
  
  return {
    props: {
      mainProjects: projectsData.mainProjects,
      galleryProjects: projectsData.galleryProjects,
      experiences: experienceData.experiences,
      about: experienceData.about,
      contact: experienceData.contact,
      interests: experienceData.interests
    },
  };
};

export default HomePage;