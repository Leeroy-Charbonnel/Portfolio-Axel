import React from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '../../hooks/useLanguage';
import GalleryItem from './galleryItem';
import styles from './ProjectGallery.module.css';

interface GalleryProject {
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
}

interface ProjectGalleryProps {
  projects: GalleryProject[];
}

const ProjectGallery: React.FC<ProjectGalleryProps> = ({ projects }) => {
  const { t } = useLanguage();

  return (
    <section id="gallery" className={`section ${styles.gallerySection}`}>
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true, margin: "-100px" }}
        >
          <h2 className={styles.sectionTitle}>{t('gallery.title')}</h2>
        </motion.div>
        
        <div className={styles.galleryGrid}>
          {projects.map((project, index) => (
            <GalleryItem
              key={project.id}
              id={project.id}
              title={project.title}
              thumbnail={project.thumbnail}
              stats={project.stats}
              index={index}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProjectGallery;