import React, { Component } from 'react';
import { motion } from 'framer-motion';
import { ProjectStats as ProjectStatsType } from '../../types';
import { LanguageContextType } from '../languageProvider';
import styles from './projectStats.module.css';

//Context consumer for class components
import { LanguageContext } from '../languageProvider';

interface ProjectStatsProps {
  stats: ProjectStatsType;
}

class ProjectStats extends Component<ProjectStatsProps> {
  static contextType = LanguageContext;
  context!: React.ContextType<typeof LanguageContext>;

  formatNumber(num: number): string {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(0)}k`;
    }
    return num.toString();
  }

  render() {
    const { stats } = this.props;
    //Get translation function from context
    const { t } = this.context as LanguageContextType;

    const statItems = [
      { key: 'vertices', value: stats.vertices },
      { key: 'edges', value: stats.edges },
      ...(stats.faces ? [{ key: 'faces', value: stats.faces }] : []),
      ...(stats.triangles ? [{ key: 'triangles', value: stats.triangles }] : []),
    ];

    return (
      <div className={styles.statsContainer}>
        {statItems.map((item, index) => (
          <motion.div 
            key={item.key}
            className={styles.statItem}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 + 0.3, duration: 0.5 }}
          >
            <div className={styles.statLabel}>{t(`projects.stats.${item.key}`)}</div>
            <div className={styles.statValue}>{this.formatNumber(item.value)}</div>
          </motion.div>
        ))}
      </div>
    );
  }
}

export default ProjectStats;