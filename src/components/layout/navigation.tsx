import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '../../hooks/useLanguage';
import styles from './Navigation.module.css';

interface NavigationProps {
  sections: string[];
}

const Navigation: React.FC<NavigationProps> = ({ sections }) => {
  const { t } = useLanguage();
  const [activeSection, setActiveSection] = useState<string>('home');
  const [isVisible, setIsVisible] = useState<boolean>(false);

  //Handle scroll and update active section
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      
      //Show/hide navigation
      if (scrollPosition > 100) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
      
      //Update active section
      for (const section of sections) {
        const element = document.getElementById(section);
        if (element) {
          const { offsetTop, offsetHeight } = element;
          if (
            scrollPosition >= offsetTop - 100 &&
            scrollPosition < offsetTop + offsetHeight - 100
          ) {
            setActiveSection(section);
            break;
          }
        }
      }
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [sections]);

  //Scroll to section when nav item is clicked
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      window.scrollTo({
        top: element.offsetTop,
        behavior: 'smooth'
      });
    }
  };

  return (
    <motion.nav 
      className={styles.navigation}
      initial={{ x: '-100%' }}
      animate={{ x: isVisible ? 0 : '-100%' }}
      transition={{ duration: 0.5 }}
    >
      <ul className={styles.navList}>
        {sections.map((section) => (
          <motion.li 
            key={section}
            className={`${styles.navItem} ${activeSection === section ? styles.active : ''}`}
            whileHover={{ x: 10 }}
            transition={{ duration: 0.2 }}
          >
            <button 
              onClick={() => scrollToSection(section)}
              className={styles.navButton}
            >
              {t(`nav.${section}`)}
            </button>
          </motion.li>
        ))}
      </ul>
    </motion.nav>
  );
};

export default Navigation;