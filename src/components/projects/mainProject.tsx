import React, { useState } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Project } from '../../types';
import { useLanguage } from '../../hooks/useLanguage';
import ProjectStats from '../projects/projectStats';
import styles from './MainProject.module.css';

interface MainProjectProps {
  project: Project;
  index: number;
}

const MainProject: React.FC<MainProjectProps> = ({ project, index }) => {
  const { language, t } = useLanguage();
  const [showWireframe, setShowWireframe] = useState(false);
  
  //Set different layouts based on template
  const isTemplateOne = project.template === 'template1';
  
  return (
    <motion.div 
      className={`${styles.projectContainer} ${isTemplateOne ? styles.template1 : styles.template2}`}
      initial={{ opacity: 0, y: 100 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      viewport={{ once: true, margin: "-100px" }}
    >
      <div className={styles.projectHeader}>
        <h3 className={styles.projectNumber}>
          {String(index + 1).padStart(2, '0')}
        </h3>
        <h3 className={styles.projectTitle}>
          {project.title[language]}
        </h3>
      </div>
      
      <div className={styles.projectContent}>
        <div className={styles.projectImageContainer}
             onMouseEnter={() => setShowWireframe(true)}
             onMouseLeave={() => setShowWireframe(false)}>
          <Image
            src={showWireframe ? project.wireframeImage : project.mainImage}
            alt={project.title[language]}
            width={600}
            height={400}
            className={styles.projectMainImage}
            priority
          />
        </div>
        
        <div className={styles.projectDetails}>
          <div className={styles.thumbnailsContainer}>
            {project.thumbnails.map((thumbnail, idx) => (
              <div 
                key={idx} 
                className={styles.thumbnailWrapper}
                onMouseEnter={() => setShowWireframe(true)}
                onMouseLeave={() => setShowWireframe(false)}
              >
                <Image
                  src={showWireframe ? project.wireframeImage : thumbnail.src}
                  alt={thumbnail.alt}
                  width={200}
                  height={150}
                  className={styles.thumbnailImage}
                />
              </div>
            ))}
          </div>
          
          <div className={styles.projectInfo}>
            <ProjectStats stats={project.stats} />
            
            <div className={styles.software}>
              <span className={styles.softwareLabel}>{t('projects.renderedWith')}</span>
              <div className={styles.softwareIcons}>
                {project.software.map((sw, idx) => (
                  <div key={idx} className={styles.softwareIcon}>
                    {sw}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        
        <div className={styles.projectDescription}>
          <p>{project.description[language]}</p>
        </div>
      </div>
    </motion.div>
  );
};

export default MainProject;