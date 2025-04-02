import React from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '../../hooks/useLanguage';
import styles from './Home.module.css';

const Home: React.FC = () => {
  const { t } = useLanguage();

  return (
    <section id="home" className={`section ${styles.homeSection}`}>
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
            <h2 className={styles.subtitle}>{t('home.name')}</h2>
            <p className={styles.role}>{t('home.subtitle')}</p>
          </motion.div>
        </motion.div>
      </div>
      <div className={styles.gridOverlay}></div>
    </section>
  );
};

export default Home;