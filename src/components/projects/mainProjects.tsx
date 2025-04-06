import React, { Component } from 'react';
import { motion } from 'framer-motion';
import { LanguageContextType } from '../languageProvider';
import MainProject from './mainProject';
import { Project, Software } from '../../types';
import styles from './mainProjects.module.css';

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
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true, margin: "-100px" }}
        >
          <h2 className={styles.sectionTitle}>{t('projects.title')}</h2>
        </motion.div>

        <div className={styles.projectsList}>
          {projects.map((project, index) => (
            <MainProject
              key={project.id}
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