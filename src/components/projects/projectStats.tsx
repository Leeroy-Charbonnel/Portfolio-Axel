import React from 'react';
import { motion } from 'framer-motion';
import { ProjectStats as ProjectStatsType } from '../../types';
import { useLanguage } from '../../hooks/useLanguage';
import styles from './projectStats.module.css';

interface ProjectStatsProps {
  stats: ProjectStatsType;
}

const formatNumber = (num: number): string => {
  if (num >= 1000) {
    return `${(num / 1000).toFixed(0)}k`;
  }
  return num.toString();
};

const ProjectStats: React.FC<ProjectStatsProps> = ({ stats }) => {
  const { t } = useLanguage();

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
          <div className={styles.statValue}>{formatNumber(item.value)}</div>
        </motion.div>
      ))}
    </div>
  );
};

export default ProjectStats;