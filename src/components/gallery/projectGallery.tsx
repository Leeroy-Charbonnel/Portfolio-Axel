import React, { Component } from 'react';
import { motion } from 'framer-motion';
import { LanguageContextType } from '../languageProvider';
import GalleryItem from './galleryItem';
import styles from './ProjectGallery.module.css';

//Context consumer for class components
import { LanguageContext } from '../languageProvider';

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

class ProjectGallery extends Component<ProjectGalleryProps> {
  static contextType = LanguageContext;
  context!: React.ContextType<typeof LanguageContext>;

  render() {
    const { projects } = this.props;
    //Get translation function from context
    const { t } = this.context as LanguageContextType;

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
  }
}

export default ProjectGallery;