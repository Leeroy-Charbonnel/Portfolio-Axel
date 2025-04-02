import React from 'react';
import { motion } from 'framer-motion';
import { Experience } from '../../types';
import { useLanguage } from '../../hooks/useLanguage';
import styles from './ExperienceItem.module.css';

interface ExperienceItemProps {
  experience: Experience;
  index: number;
}

const ExperienceItem: React.FC<ExperienceItemProps> = ({ experience, index }) => {
  const { language } = useLanguage();
  
  return (
    <motion.div 
      className={styles.experienceItem}
      initial={{ opacity: 0, x: -50 }}
      whileInView={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6, delay: index * 0.2 }}
      viewport={{ once: true, margin: "-50px" }}
    >
      <div className={styles.period}>{experience.period}</div>
      
      <div className={styles.content}>
        <h3 className={styles.title}>{experience.title[language]}</h3>
        <div className={styles.company}>
          {experience.company} <span className={styles.location}>({experience.location})</span>
        </div>
        
        <ul className={styles.descriptionList}>
          {experience.description[language].map((item, idx) => (
            <li key={idx} className={styles.descriptionItem}>{item}</li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
};

export default ExperienceItem;