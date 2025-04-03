import React, { Component } from 'react';
import { motion } from 'framer-motion';
import styles from './Navigation.module.css';

import { LanguageContext, LanguageContextType } from '../languageProvider';

interface NavigationProps {
  sections: string[];
}

interface NavigationState {
  activeSection: string;
  isVisible: boolean;
}

class Navigation extends Component<NavigationProps, NavigationState> {
  static contextType = LanguageContext;
  context!: React.ContextType<typeof LanguageContext>;

  constructor(props: NavigationProps) {
    super(props);
    this.state = {
      activeSection: 'home',
      isVisible: false
    };
  }

  componentDidMount() {
    window.addEventListener('scroll', this.handleScroll);
  }

  componentWillUnmount() {
    window.removeEventListener('scroll', this.handleScroll);
  }

  handleScroll = () => {
    const { sections } = this.props;
    const scrollPosition = window.scrollY;
    
    //Show/hide navigation
    if (scrollPosition > 100) {
      this.setState({ isVisible: true });
    } else {
      this.setState({ isVisible: false });
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
          this.setState({ activeSection: section });
          break;
        }
      }
    }
  };

  //Scroll to section when nav item is clicked
  scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      window.scrollTo({
        top: element.offsetTop,
        behavior: 'smooth'
      });
    }
  };

  render() {
    const { sections } = this.props;
    const { activeSection, isVisible } = this.state;
    //Get translation function from context
    const { t } = this.context as LanguageContextType;

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
                onClick={() => this.scrollToSection(section)}
                className={styles.navButton}
              >
                {t(`nav.${section}`)}
              </button>
            </motion.li>
          ))}
        </ul>
      </motion.nav>
    );
  }
}

export default Navigation;