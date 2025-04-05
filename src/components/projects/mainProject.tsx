import React, { Component } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Grid } from 'lucide-react';
import { Project, Software } from '../../types';
import { LanguageContextType } from '../languageProvider';
import ProjectStats from '../projects/projectStats';
import styles from './mainProject.module.css';

//Context consumer for class components
import { LanguageContext } from '../languageProvider';

interface MainProjectProps {
  project: Project;
  softwares: Software[];
  index: number;
}

interface MainProjectState {
  showWireframe: boolean;
  sketchfabWireframe: boolean;
  sketchfabLoaded: boolean;
  iframeKey: number; // Used to force iframe recreation
}

class MainProject extends Component<MainProjectProps, MainProjectState> {
  static contextType = LanguageContext;
  context!: React.ContextType<typeof LanguageContext>;
  sketchfabClient: any = null;
  originalMaterials: any[] = [];

  constructor(props: MainProjectProps) {
    super(props);
    this.state = {
      showWireframe: false,
      sketchfabWireframe: false,
      sketchfabLoaded: false,
      iframeKey: 0
    };
  }

  handleMouseEnter = () => {
    this.setState({ showWireframe: true });
  }

  handleMouseLeave = () => {
    this.setState({ showWireframe: false });
  }

  toggleSketchfabWireframe = () => {
    this.setState(prevState => ({
      sketchfabWireframe: !prevState.sketchfabWireframe,
      iframeKey: prevState.iframeKey + 1 // Force iframe to recreate
    }));
  }

  handleIframeLoad = () => {
    this.setState({ sketchfabLoaded: true });
  }

  getLayoutClassName(index: number): string {
    const layoutType = index % 3;
    return styles[`layout${layoutType}`];
  }

  render() {
    const { project, softwares, index } = this.props;
    const { showWireframe, sketchfabWireframe, sketchfabLoaded, iframeKey } = this.state;

    const { language, t } = this.context as LanguageContextType;

    const mainImagePath = `/images/projects/${project.imageFolder}/main.png`;
    const wireframeImagePath = `/images/projects/${project.imageFolder}/main-wireframe.png`;


    let sketchfabEmbedUrl = `https://sketchfab.com/models/${project.modelId}/embed?autospin=0&autostart=1&ui_theme=dark`;

    console.log({
      mainImagePath,
      wireframeImagePath,
      project, softwares, index 
    });


    const layoutClassName = this.getLayoutClassName(index);

    return (
      <motion.div
        className={`${styles.projectContainer} ${layoutClassName}`}
        initial={{ opacity: 0, y: 100 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        viewport={{ once: true, margin: "-100px" }}
      >
        <div className={styles.projectHeader}>
          <h3 className={styles.projectNumber}>{String(index + 1).padStart(2, '0')}</h3>
          <h3 className={styles.projectTitle}>{project.title[language]}</h3>
        </div>

        <div className={styles.projectContent}>
          <div className={styles.modelSection}>
            {project.modelLink && (
              <div className={styles.modelContainer}>
                <div className={styles.sketchfabContainer}>
                  <iframe
                    key={iframeKey}
                    title={`Sketchfab Model - ${project.title[language]}`}
                    className={styles.sketchfabEmbed}
                    src={sketchfabEmbedUrl}
                    onLoad={this.handleIframeLoad}
                    frameBorder="0"
                    allowFullScreen
                    allow="autoplay; fullscreen; xr-spatial-tracking"
                  ></iframe>
                </div>
                <button
                  className={`${styles.wireframeButton} ${sketchfabWireframe ? styles.active : ''}`}
                  onClick={this.toggleSketchfabWireframe}
                >
                  <Grid size={16} className={styles.wireframeIcon} />
                  {sketchfabWireframe ? "Hide Wireframe" : "Show Wireframe"}
                </button>
              </div>
            )}

            {(!project.modelLink || !sketchfabLoaded) && (
              <div className={styles.imagesSection}>
                <div
                  className={styles.projectImageContainer}
                  onMouseEnter={this.handleMouseEnter}
                  onMouseLeave={this.handleMouseLeave}
                >
                  <Image
                    src={showWireframe ? wireframeImagePath : mainImagePath}
                    alt={project.title[language]}
                    width={600}
                    height={400}
                    className={styles.projectMainImage}
                    priority
                  />
                </div>
              </div>
            )}

            <div className={styles.thumbnailsContainer}>
              {project.thumbnails.map((thumbnail, idx) => (
                <div
                  key={idx}
                  className={styles.thumbnailWrapper}
                  onMouseEnter={this.handleMouseEnter}
                  onMouseLeave={this.handleMouseLeave}
                >
                  <Image
                    src={showWireframe
                      ? thumbnail.srcWireframe
                        ? `/images/projects/${project.imageFolder}/${thumbnail.srcWireframe}`
                        : wireframeImagePath
                      : `/images/projects/${project.imageFolder}/${thumbnail.src}`}
                    alt={thumbnail.alt}
                    width={200}
                    height={150}
                    className={styles.thumbnailImage}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className={styles.projectDetails}>
            <div className={styles.projectInfo}>
              <ProjectStats stats={project.stats} />

              <div className={styles.software}>
                <span className={styles.softwareLabel}>{t('projects.renderedWith')}</span>
                <div className={styles.softwareIcons}>
                  {project.software.map((sw, idx) => (
                    <div key={idx} className={styles.softwareIcon}>
                      {sw}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className={styles.projectDescription}>
            <p>{project.description[language]}</p>
          </div>
        </div>
      </motion.div>
    );
  }
}

export default MainProject;