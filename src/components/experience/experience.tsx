import React, { Component } from 'react';
import { motion } from 'framer-motion';
import { Experience as ExperienceType } from '../../types';
import { LanguageContextType } from '../languageProvider';
import ExperienceItem from './experienceItem';
import About from './about';
import styles from './experience.module.css';

//Context consumer for class components
import { LanguageContext } from '../languageProvider';

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

class Experience extends Component<ExperienceProps> {
  static contextType = LanguageContext;
  context!: React.ContextType<typeof LanguageContext>;

  render() {
    const { experiences, about, contact, interests } = this.props;
    //Get translation function from context
    const { t } = this.context as LanguageContextType;

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
  }
}

export default Experience;