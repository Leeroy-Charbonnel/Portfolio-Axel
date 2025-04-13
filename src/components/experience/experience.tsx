import React, { Component } from 'react';
import { motion } from 'framer-motion';
import { ExperienceProps } from '@/types';
import { LanguageContextType } from '../languageProvider';
import ExperienceItem from './experienceItem';
import About from './about';
import styles from './experience.module.css';
import { LanguageContext } from '../languageProvider';



class Experience extends Component<ExperienceProps> {
  static contextType = LanguageContext;
  context!: React.ContextType<typeof LanguageContext>;

  render() {
    const { experiences, about, contact, interests } = this.props;
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
            <h2 className={'sectionTitle'}>{t('experience.title')}</h2>
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