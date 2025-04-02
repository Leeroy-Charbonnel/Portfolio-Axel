import React from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '../../hooks/useLanguage';
import MainProject from './mainProject';
import { Project } from '../../types';
import styles from './MainProjects.module.css';

interface MainProjectsProps {
  projects: Project[];
}

const MainProjects: React.FC<MainProjectsProps> = ({ projects }) => {
  const { t } = useLanguage();

  return (
    <section id="projects" className={`section ${styles.projectsSection}`}>
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true, margin: "-100px" }}
        >
          <h2 className={styles.sectionTitle}>{t('projects.title')}</h2>
        </motion.div>
        
        <div className={styles.projectsList}>
          {projects.map((project, index) => (
            <MainProject key={project.id} project={project} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default MainProjects;