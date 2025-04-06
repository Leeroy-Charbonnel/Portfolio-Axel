import React, { Component } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { LanguageContextType } from '../languageProvider';
import styles from './projectGallery.module.css';

// Context consumer for class components
import { LanguageContext } from '../languageProvider';

interface GalleryItemProps {
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
  index: number;
}

class GalleryItem extends Component<GalleryItemProps> {
  static contextType = LanguageContext;
  context!: React.ContextType<typeof LanguageContext>;

  formatNumber(num: number): string {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(0)}k`;
    }
    return num.toString();
  }

  render() {
    const { id, title, thumbnail, stats, index } = this.props;
    // Get language from context
    const { language } = this.context as LanguageContextType;

    return (
      <motion.div
        className={styles.galleryItem}
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: index * 0.1 }}
        viewport={{ once: true, margin: "-50px" }}
        whileHover={{ y: -10 }}
      >
        <div className={styles.thumbnailContainer}>
          <Image
            src={thumbnail}
            alt={title[language]}
            width={400}
            height={400}
            className={styles.thumbnail}
          />
        </div>

        <div className={styles.itemDetails}>
          <h3 className={styles.itemTitle}>{title[language]}</h3>

          <div className={styles.itemStats}>
            <div className={styles.statItem}>
              <span className={styles.statIcon}>V</span> {this.formatNumber(stats.vertices)}
            </div>
            <div className={styles.statItem}>
              <span className={styles.statIcon}>E</span> {this.formatNumber(stats.edges)}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }
}

export default GalleryItem;