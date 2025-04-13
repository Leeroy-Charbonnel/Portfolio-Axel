import React, { Component } from 'react';
import { LanguageContextType } from '../languageProvider';
import styles from './projectGallery.module.css';
import Image from 'next/image';
import { LanguageContext } from '../languageProvider';
import { formatNumber } from '@/utils/Utils';
import { GalleryProject } from '@/types';
import AnimatedComponent from '../AnimatedComponent';

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
          <AnimatedComponent
            direction="bottom"
            distance={50}
            duration={0.8}
            once={true}
            threshold={0.1}
          >
            <h2 className={'sectionTitle'}>{t('gallery.title')}</h2>
          </AnimatedComponent>

          <div className={styles.galleryGrid}>
            {projects.map((project, index) => (
              <AnimatedComponent
                key={project.id || index}
                direction="bottom"
                distance={30}
                duration={0.6}
                delay={index * 0.1}
                once={true}
                threshold={0.1}
                className={styles.galleryItem}
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
              </AnimatedComponent>
            ))}
          </div>
        </div>
      </section>
    );
  }
}

export default ProjectGallery;