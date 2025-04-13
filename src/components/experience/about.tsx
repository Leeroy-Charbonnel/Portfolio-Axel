import React, { Component } from 'react';
import { LanguageContextType } from '../languageProvider';
import styles from './about.module.css';
import { LanguageContext } from '../languageProvider';
import { AboutProps } from '@/types';
import Image from 'next/image';
import AnimatedComponent from '../AnimatedComponent';

class About extends Component<AboutProps> {
  static contextType = LanguageContext;
  context!: React.ContextType<typeof LanguageContext>;

  render() {
    const { about, contact, interests } = this.props;
    const { language, t } = this.context as LanguageContextType;

    return (
      <div className={styles.aboutContainer}>
        <AnimatedComponent
          className={styles.aboutSection}
          direction="bottom"
          distance={30}
          duration={0.6}
          once={true}
          initialOpacity={0}
          finalOpacity={1}
        >
          <h3 className={styles.sectionTitle}>{t('experience.about')}</h3>
          <div className={styles.aboutContent}>
            <div className={styles.avatar}>
              <a href="https://sketchfab.com/Obambulatesart" target="_blank" rel="noopener noreferrer">
                <Image
                  src="https://media.sketchfab.com/avatars/5414de3b61cc449bb3b094e1b5af13e0/aea42c6a1e164c288fb8f965384bb362.png"
                  alt="Avatar"
                  width={100}
                  height={100}
                />
              </a>
            </div>
            <p className={styles.aboutText}>{about[language]}</p>
          </div>
        </AnimatedComponent>

        <div className={styles.infoColumns}>
          <AnimatedComponent
            className={styles.contactSection}
            direction="bottom"
            distance={30}
            duration={0.6}
            delay={0.2}
            once={true}
            initialOpacity={0}
            finalOpacity={1}
          >
            <h3 className={styles.sectionTitle}>{t('experience.contact')}</h3>
            <ul className={styles.contactList}>
              <li className={styles.contactItem}>
                <span className={styles.contactLabel}>{t('experience.phone')}</span>
                <span className={styles.contactValue}>{contact.phone}</span>
              </li>
              <li className={styles.contactItem}>
                <span className={styles.contactLabel}>{t('experience.mail')}</span>
                <span className={styles.contactValue}>{contact.email}</span>
              </li>
              <li className={styles.contactItem}>
                <span className={styles.contactLabel}>{t('experience.insta')}</span>
                <span className={styles.contactValue}>{contact.instagram}</span>
              </li>
            </ul>
          </AnimatedComponent>

          <AnimatedComponent
            className={styles.interestsSection}
            direction="bottom"
            distance={30}
            duration={0.6}
            delay={0.3}
            once={true}
            initialOpacity={0}
            finalOpacity={1}
          >
            <h3 className={styles.sectionTitle}>{t('experience.interest')}</h3>
            <div className={styles.interestsColumns}>
              <div className={styles.interestColumn}>
                <h4 className={styles.interestTitle}>{t('experience.games')}</h4>
                <ul className={styles.interestList}>
                  {interests.games.map((game, index) => (
                    <li key={index} className={styles.interestItem}>{game}</li>
                  ))}
                </ul>
              </div>
              <div className={styles.interestColumn}>
                <h4 className={styles.interestTitle}>{t('experience.art')}</h4>
                <ul className={styles.interestList}>
                  {interests.art.map((art, index) => (
                    <li key={index} className={styles.interestItem}>{art}</li>
                  ))}
                </ul>
              </div>
            </div>
          </AnimatedComponent>
        </div>
      </div>
    );
  }
}

export default About;