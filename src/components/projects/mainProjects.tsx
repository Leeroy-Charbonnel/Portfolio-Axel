import React, { Component } from 'react';
import { motion } from 'framer-motion';
import { LanguageContextType } from '../languageProvider';
import MainProject from './mainProject';
import { Project } from '../../types';
import styles from './MainProjects.module.css';

//Context consumer for class components
import { LanguageContext } from '../languageProvider';

interface MainProjectsProps {
  projects: Project[];
}

class MainProjects extends Component<MainProjectsProps> {
  static contextType = LanguageContext;
  context!: React.ContextType<typeof LanguageContext>;

  render() {
    const { projects } = this.props;
    //Get translation function from context
    const { t } = this.context as LanguageContextType;

    return (
      <section id="projects" className={`section ${styles.projectsSection}`}>
        <div className="container">
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
              <MainProject key={project.id} project={project} index={index} />
            ))}
          </div>
        </div>
      </section>
    );
  }
}

export default MainProjects;