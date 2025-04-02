import React from 'react';
import { motion } from 'framer-motion';
import { Experience as ExperienceType } from '../../types';
import { useLanguage } from '../../hooks/useLanguage';
import ExperienceItem from './ExperienceItem';
import About from './About';
import styles from './Experience.module.css';

interface ExperienceProps {
  experiences: ExperienceType[];
  about: {
    en: string;
    fr: string;
  };
  contact: {
    phone: string;
    email: string;
    instagram: string;
  };
  interests: {
    games: string[];
    art: string[];
  };
}

const Experience: React.FC<ExperienceProps> = ({ 
  experiences, 
  about, 
  contact, 
  interests 
}) => {
  const { t } = useLanguage();

  return (
    <section id="experience" className={`section ${styles.experienceSection}`}>
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true, margin: "-100px" }}
        >
          <h2 className={styles.sectionTitle}>{t('experience.title')}</h2>
        </motion.div>
        
        <div className={styles.experienceContent}>
          <div className={styles.experienceTimeline}>
            {experiences.map((experience, index) => (
              <ExperienceItem 
                key={index}
                experience={experience}
                index={index}
              />
            ))}
          </div>
          
          <About 
            about={about}
            contact={contact}
            interests={interests}
          />
        </div>
      </div>
    </section>
  );
};

export default Experience;