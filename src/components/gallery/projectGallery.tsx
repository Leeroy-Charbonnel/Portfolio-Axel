import React, { Component } from 'react';
import { motion } from 'framer-motion';
import { LanguageContextType } from '../languageProvider';
import styles from './projectGallery.module.css';
import Image from 'next/image';

// Context consumer for class components
import { LanguageContext } from '../languageProvider';
import { formatNumber } from '@/utils/Utils';
import { GalleryProject } from '@/types';


interface ProjectGalleryProps {
  projects: GalleryProject[];
}

class ProjectGallery extends Component<ProjectGalleryProps> {
  static contextType = LanguageContext;
  context!: React.ContextType<typeof LanguageContext>;

  render() {
    const { projects } = this.props;
    const { t, language } = this.context as LanguageContextType;

    return (
      <section id="gallery" className={`section ${styles.gallerySection}`}>
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true, margin: "-100px" }}
          >
            <h2 className={'sectionTitle'}>{t('gallery.title')}</h2>
          </motion.div>

          <div className={styles.galleryGrid}>
            {projects.map((project, index) => (
              <motion.div
                className={styles.galleryItem}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true, margin: "-50px" }}
              >
                <a href={project.link} target="_blank" rel="noopener noreferrer">
                  <div className={`${styles.thumbnailContainer} noGrainOverlay`}>
                    <Image
                      src={`/images/projects/${project.imageFolder}/main.png`}
                      alt={project.title[language]}
                      width={400}
                      height={400}
                      className={styles.thumbnail}
                    />
                  </div>

                  <div className={`${styles.itemDetails} noGrainOverlay`}>
                    <h3 className={styles.itemTitle}>{project.title[language]}</h3>

                    <div className={styles.itemStats}>
                      <div className={styles.statItem}>
                        <span className={styles.statIcon}>V</span> {formatNumber(project.stats.vertices)}
                      </div>
                      <div className={styles.statItem}>
                        <span className={styles.statIcon}>E</span> {formatNumber(project.stats.edges)}
                      </div>
                    </div>
                  </div>
                </a>


              </motion.div >
            ))}
          </div>
        </div>
      </section>
    );
  }
}

export default ProjectGallery;