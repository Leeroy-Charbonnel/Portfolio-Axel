import React, { Component } from 'react';
import { motion } from 'framer-motion';
import { LanguageContextType } from '../languageProvider';
import styles from './About.module.css';

//Context consumer for class components
import { LanguageContext } from '../languageProvider';

interface AboutProps {
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

class About extends Component<AboutProps> {
  static contextType = LanguageContext;
  context!: React.ContextType<typeof LanguageContext>;

  render() {
    const { about, contact, interests } = this.props;
    //Get language and translation function from context
    const { language, t } = this.context as LanguageContextType;
    
    return (
      <div className={styles.aboutContainer}>
        <motion.div 
          className={styles.aboutSection}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <h3 className={styles.sectionTitle}>{t('experience.about')}</h3>
          <div className={styles.aboutContent}>
            <div className={styles.avatar}></div>
            <p className={styles.aboutText}>{about[language]}</p>
          </div>
        </motion.div>
        
        <div className={styles.infoColumns}>
          <motion.div 
            className={styles.contactSection}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true }}
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
          </motion.div>
          
          <motion.div 
            className={styles.interestsSection}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            viewport={{ once: true }}
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
          </motion.div>
        </div>
      </div>
    );
  }
}

export default About;