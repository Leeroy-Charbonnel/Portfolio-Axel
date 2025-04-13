import React, { Component } from 'react';
import { ExperienceProps } from '@/types';
import { LanguageContextType } from '../languageProvider';
import ExperienceItem from './experienceItem';
import About from './about';
import styles from './experience.module.css';
import { LanguageContext } from '../languageProvider';
import AnimatedComponent from '../AnimatedComponent';

class Experience extends Component<ExperienceProps> {
  static contextType = LanguageContext;
  context!: React.ContextType<typeof LanguageContext>;

  render() {
    const { experiences, about, contact, interests } = this.props;
    const { t } = this.context as LanguageContextType;

    return (
      <section id="experience" className={`section ${styles.experienceSection}`}>
        <div className="container">
          <AnimatedComponent
            direction="bottom"
            distance={50}
            duration={0.8}
            once={true}
            threshold={0.1}
          >
            <h2 className={'sectionTitle'}>{t('experience.title')}</h2>
          </AnimatedComponent>

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