import React, { Component } from 'react';
import { LanguageContextType } from '../languageProvider';
import MainProject from './mainProject';
import { Project, Software } from '../../types';
import styles from './mainProjects.module.css';
import AnimatedComponent from '../AnimatedComponent';
//Context consumer for class components
import { LanguageContext } from '../languageProvider';

interface MainProjectsProps {
  projects: Project[];
  softwares: Record<string, Software>;
}

class MainProjects extends Component<MainProjectsProps> {
  static contextType = LanguageContext;
  context!: React.ContextType<typeof LanguageContext>;

  render() {
    const { projects, softwares } = this.props;
    const { t } = this.context as LanguageContextType;

    return (
      <section id="projects" className={`section ${styles.projectsSection}`}>
        <AnimatedComponent
          direction="bottom"
          distance={50}
          duration={0.8}
          once={true}
          threshold={0.1}
          initialOpacity={0}
          finalOpacity={1}
        >
          <h2 className={'sectionTitle'}>{t('projects.title')}</h2>
        </AnimatedComponent>

        <div className={styles.projectsList}>
          {projects.map((project, index) => (
            <MainProject
              key={index}
              project={project}
              softwares={softwares}
              index={index}
            />
          ))}
        </div>
      </section>
    );
  }
}

export default MainProjects;