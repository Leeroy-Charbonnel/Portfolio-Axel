import React, { Component } from 'react';
import * as LucideIcons from 'lucide-react';
import styles from './navigation.module.css';
import { LanguageContext, LanguageContextType } from '../languageProvider';
import AnimatedComponent from '../AnimatedComponent';

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
      isExpanded: false
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

    for (const [section] of this.props.sections) {
      const element = document.getElementById(section.toLocaleLowerCase());
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
      <AnimatedComponent
        direction="left"
        distance={100}
        duration={0.3}
        animateOnMount={true}
        style={{ position: 'fixed', top: '50%', transform: 'translateY(-50%)' }}
        className={`${styles.navItemHover} ${isExpanded ? styles.expanded : ''}`}
        onMouseEnter={this.handleMouseEnter}
        onMouseLeave={this.handleMouseLeave}
      >
        <nav
          className={styles.navigation}
        >
          <ul className={styles.navList}>
            {sections.map(([section, iconName]) => (
              <li key={section}
                className={`${styles.navItem} ${activeSection === section ? styles.active : ''}`}
              >
                <button
                  onClick={() => this.scrollToSection(section.toLocaleLowerCase())}
                  className={styles.navButton}>
                  <div className={styles.navItemContent}>
                    {this.renderIcon(iconName)}
                  </div>
                </button>
                <div className={styles.tooltip}>{section}</div>
              </li>
            ))}
          </ul>
        </nav>
      </AnimatedComponent>
    );
  }
}