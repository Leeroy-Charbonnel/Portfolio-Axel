import React, { JSX } from 'react';
import { useLanguage } from '../languageProvider';
import styles from './home.module.css';
import AnimatedComponent from '../AnimatedComponent';

function Home(): JSX.Element {
  const { t } = useLanguage();
  const name = t('home.name').split(' ');

  return (
    <section id="home" className={`section ${styles.homeSection}`}>


      <div className={styles.gradient1}></div>
      <div className={styles.gradient2}></div>

      <div className={`${styles.homeContainer} border-sm`}>
        <div className={styles.content}>

          <AnimatedComponent
            key={"home"}
            direction="bottom"
            distance={50}
            duration={0.8}
            once={true}
            threshold={0.1}
            className={styles.titleWrapper}
          >
            <h1 className={styles.title}>{t('home.title')}</h1>
          </AnimatedComponent>
          <div className={styles.gridOverlay}></div>

          <AnimatedComponent
            key={"home"}
            direction="bottom"
            initialOpacity={0}
            finalOpacity={1}
            distance={0}
            delay={0.5}
            duration={1}
            once={true}
            className={styles.infoWrapper}
          >

            <div className={styles.subtitle}>
              <div className={styles.part1}>{name.slice(0, name.length - 1).join(' ')}</div>
              <div className={styles.part2}>{name[name.length - 1]}</div>
            </div>
            <p className={styles.role}>{t('home.subtitle')}</p>

          </AnimatedComponent>

        </div>
      </div>
    </section >
  );
}

export default Home;