import React, { useState, useEffect, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { ProjectStats as ProjectStatsType } from '../../types';
import { LanguageContextType } from '../languageProvider';
import styles from './projectStats.module.css';

//Context consumer for components
import { LanguageContext } from '../languageProvider';

interface ProjectStatsProps {
  stats: ProjectStatsType;
  animate?: boolean;
}

const ProjectStats: React.FC<ProjectStatsProps> = ({ stats, animate = true }) => {
  const context = React.useContext(LanguageContext) as LanguageContextType;
  const { t } = context;

  // Reference for detecting when component is in view
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });

  // State for animated values
  const [animatedValues, setAnimatedValues] = useState({
    vertices: 0,
    edges: 0,
    faces: 0,
    triangles: 0
  });

  // Format number (add k suffix for thousands)
  const formatNumber = (num: number): string => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toString();
  };

  // Start or update animation when in view
  useEffect(() => {
    // If not in view yet, keep values at 0
    if (!isInView) {
      return;
    }

    // If animation is disabled, just set the final values
    if (!animate) {
      setAnimatedValues(stats);
      return;
    }

    // Animation settings
    const duration = 1500;
    const steps = 60;
    const stepTime = duration / steps;

    let frame = 0;
    const intervalId = setInterval(() => {
      frame++;

      if (frame >= steps) {
        // Animation complete, set final values
        setAnimatedValues(stats);
        clearInterval(intervalId);
        return;
      }

      // Calculate progress (easeOutQuad easing function)
      const progress = frame / steps;
      const easedProgress = -progress * (progress - 2);

      // Calculate current animated values
      const newValues = {
        vertices: Math.round(stats.vertices * easedProgress),
        edges: Math.round(stats.edges * easedProgress),
        faces: stats.faces ? Math.round(stats.faces * easedProgress) : 0,
        triangles: stats.triangles ? Math.round(stats.triangles * easedProgress) : 0
      };

      setAnimatedValues(newValues);
    }, stepTime);

    // Clean up the interval on component unmount
    return () => clearInterval(intervalId);
  }, [isInView, animate, stats]);

  // Create stat items array
  const statItems = [
    { key: 'vertices', value: animatedValues.vertices },
    { key: 'edges', value: animatedValues.edges },
    ...(stats.faces ? [{ key: 'faces', value: animatedValues.faces }] : []),
    ...(stats.triangles ? [{ key: 'triangles', value: animatedValues.triangles }] : [])
  ];

  return (
    <div ref={ref} className={styles.statsContainer}>
      {statItems.map((item, index) => (
        <motion.div
          key={item.key}
          className={styles.statItem}
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
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