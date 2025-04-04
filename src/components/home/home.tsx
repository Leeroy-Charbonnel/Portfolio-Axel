import React, { JSX } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '../languageProvider';
import styles from './home.module.css';

function Home(): JSX.Element {
  const { t } = useLanguage();
  const name = t('home.name').split(' ');

  return (
    <section id="home" className={`section ${styles.homeSection}`}>
      <div className={styles.grainOverlay}></div>

      <div className={`container ${styles.homeContainer}`}>

        <motion.div
          className={styles.content}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
        >
          <motion.div
            className={styles.titleWrapper}
            initial={{ y: 50 }}
            animate={{ y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
          >
            <h1 className={styles.title}>{t('home.title')}</h1>
          </motion.div>

          <motion.div
            className={styles.infoWrapper}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.8 }}
          >
            <div className={styles.gridOverlay}></div>

            <div className={styles.subtitle}>
              <div className={styles.part1}>{name.slice(0, name.length - 1).join(' ')}</div>
              <div className={styles.part2}>{name[name.length - 1]}</div>
            </div>
            <p className={styles.role}>{t('home.subtitle')}</p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

export default Home;