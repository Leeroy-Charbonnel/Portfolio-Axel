import React, { Component } from 'react';
import { motion } from 'framer-motion';
import * as LucideIcons from 'lucide-react';
import styles from './Navigation.module.css';

import { LanguageContext, LanguageContextType } from '../languageProvider';

interface NavigationProps {
  sections: Array<[string, string]>;
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
    document.addEventListener('mousemove', this.handleMouseMove);
  }

  componentWillUnmount() {
    window.removeEventListener('scroll', this.handleScroll);
    document.removeEventListener('mousemove', this.handleMouseMove);
  }

  handleMouseMove = (event: MouseEvent) => {
    if (event.clientX <= 50) {
      this.setState({ isVisible: true });
    } else if (event.clientX > 200) {
      this.setState({ isVisible: event.clientX <= 50 });
    }
  };

  handleScroll = () => {
    const scrollPosition = window.scrollY;

    //Update active section
    for (const [section] of this.props.sections) {
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

  renderIcon = (iconName: string) => {
    const Icon = (LucideIcons as any)[iconName];
    if (Icon) {
      return <Icon size={18} className={styles.navIcon} />;
    }
    return null;
  };

  render() {
    const { sections } = this.props;
    const { activeSection, isVisible } = this.state;
    const { t } = this.context as LanguageContextType;

    return (
      <motion.nav
        className={styles.navigation}
        initial={{ x: '-100%', y: '-50%' }}
        animate={{ x: isVisible ? 0 : '-100%', y: '-50%' }}
        transition={{ duration: 0.3 }}
      >
        <ul className={styles.navList}>
          {sections.map(([section, iconName]) => (
            <motion.li
              key={section}
              className={`${styles.navItem} ${activeSection === section ? styles.active : ''}`}
              transition={{ duration: 0.2 }}>

              <button
                onClick={() => this.scrollToSection(section)}
                className={styles.navButton}>
                <span className={styles.navText}>{t(`nav.${section}`)}</span>
                {this.renderIcon(iconName)}
              </button>
            </motion.li>
          ))}
        </ul>
      </motion.nav>
    );
  }
}

export default Navigation;