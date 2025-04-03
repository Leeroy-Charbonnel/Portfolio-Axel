import React, { Component } from 'react';
import { motion } from 'framer-motion';
import * as LucideIcons from 'lucide-react';
import styles from './navigation.module.css';

import { LanguageContext, LanguageContextType } from '../languageProvider';

interface NavigationProps {
  sections: Array<[string, string]>;
}

interface NavigationState {
  activeSection: string;
  isExpanded: boolean;
}

export default class Navigation extends Component<NavigationProps, NavigationState> {
  static contextType = LanguageContext;
  context!: React.ContextType<typeof LanguageContext>;

  constructor(props: NavigationProps) {
    super(props);
    this.state = {
      activeSection: 'home',
      isExpanded: true
    };
  }

  componentDidMount() {
    window.addEventListener('scroll', this.handleScroll);
  }

  componentWillUnmount() {
    window.removeEventListener('scroll', this.handleScroll);
  }

  handleMouseEnter = () => {
    this.setState({ isExpanded: true });
  };

  handleMouseLeave = () => {
    this.setState({ isExpanded: false });
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
    if (Icon) return <Icon size={18} className={styles.navIcon} />;
    return null;
  };

  render() {
    const { sections } = this.props;
    const { activeSection, isExpanded } = this.state;
    const { t } = this.context as LanguageContextType;

    return (
      <motion.div
        initial={{ x: -100, y: '-50%' }}
        animate={{ x: 0, y: '-50%' }}
        transition={{ duration: 0.3 }}
        onMouseEnter={this.handleMouseEnter}
        onMouseLeave={this.handleMouseLeave}
        className={`${styles.navItemHover} ${isExpanded ? styles.expanded : ''}`}
      >

        <nav
          className={styles.navigation}
        >

          <ul className={styles.navList}>
            {sections.map(([section, iconName]) => (

              <li key={section}
                className={`${styles.navItem} ${activeSection === section ? styles.active : ''}`}
                title={section}
                aria-label={section}
              >
                <button
                  onClick={() => this.scrollToSection(section)}
                  className={styles.navButton}>
                  <div className={styles.navItemContent}>
                    {this.renderIcon(iconName)}
                  </div>
                </button>
              </li>

            ))}
          </ul>
        </nav >
      </motion.div >

    );
  }
}