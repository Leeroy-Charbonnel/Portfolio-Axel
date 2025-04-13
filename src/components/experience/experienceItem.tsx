import React, { Component } from 'react';
import { motion } from 'framer-motion';
import { Experience } from '@/types';
import { LanguageContextType } from '../languageProvider';
import styles from './experienceItem.module.css';
import { LanguageContext } from '../languageProvider';

interface ExperienceItemProps {
  experience: Experience;
  index: number;
}

class ExperienceItem extends Component<ExperienceItemProps> {
  static contextType = LanguageContext;
  context!: React.ContextType<typeof LanguageContext>;

  render() {
    const { experience, index } = this.props;
    const { language } = this.context as LanguageContextType;
    const period = experience.period[language].split("-");
    return (
      <motion.div
        className={styles.experienceItem}
        initial={{ opacity: 0, x: -50 }}
        whileInView={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: index * 0.2 }}
        viewport={{ once: true, margin: "-50px" }}
      >
        <div className={styles.period}>
          <div>{period[0]}</div>
          <div>{period[1]}</div>
        </div>

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
  }
}

export default ExperienceItem;