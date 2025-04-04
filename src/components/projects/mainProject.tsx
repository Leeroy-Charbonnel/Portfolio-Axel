import React, { Component } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Project } from '../../types';
import { LanguageContextType } from '../languageProvider';
import ProjectStats from '../projects/projectStats';
import styles from './mainProject.module.css';

//Context consumer for class components
import { LanguageContext } from '../languageProvider';

interface MainProjectProps {
  project: Project;
  index: number;
}

interface MainProjectState {
  showWireframe: boolean;
  sketchfabWireframe: boolean;
  iframeKey: number; // Used to force iframe recreation
}

class MainProject extends Component<MainProjectProps, MainProjectState> {
  static contextType = LanguageContext;
  context!: React.ContextType<typeof LanguageContext>;

  constructor(props: MainProjectProps) {
    super(props);
    this.state = {
      showWireframe: false,
      sketchfabWireframe: false,
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

  extractModelId(url: string): string {
    //Extract the model ID from different Sketchfab URL formats
    const regex = /models\/([a-zA-Z0-9]+)/;
    const match = url.match(regex);
    return match ? match[1] : '';
  }

  render() {
    const { project, index } = this.props;
    const { showWireframe, sketchfabWireframe, iframeKey } = this.state;

    const { language, t } = this.context as LanguageContextType;

    const isTemplateOne = project.template === 'template1';

    // Fixed image paths to match your directory structure
    const mainImagePath = `/images/projects/${project.imageFolder || project.id}/main.png`;
    
    // Create Sketchfab embed URL with proper parameters for wireframe
    let sketchfabEmbedUrl = '';
    if (project.modelLink) {
      // Extract the model ID and construct the official embed URL
      const modelId = this.extractModelId(project.modelLink);
      sketchfabEmbedUrl = `https://sketchfab.com/models/${modelId}/embed?autospin=0&autostart=1&ui_theme=dark${sketchfabWireframe ? '&wireframe=1' : ''}`;
    }

    return (
      <motion.div
        className={`${styles.projectContainer} ${isTemplateOne ? styles.template1 : styles.template2}`}
        initial={{ opacity: 0, y: 100 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        viewport={{ once: true, margin: "-100px" }}
      >
        <div className={styles.projectHeader}>
          <h3 className={styles.projectNumber}>
            {String(index + 1).padStart(2, '0')}
          </h3>
          <h3 className={styles.projectTitle}>
            {project.title[language]}
          </h3>
        </div>

        <div className={styles.projectContent}>
          <div className={styles.modelSection}>
            {project.modelLink && (
              <div className={styles.modelContainer}>
                <div className={styles.sketchfabContainer}>
                  {/* Use key to force iframe recreation when toggling wireframe */}
                  <iframe
                    key={iframeKey}
                    title={`Sketchfab Model - ${project.title[language]}`}
                    className={styles.sketchfabEmbed}
                    src={sketchfabEmbedUrl}
                    frameBorder="0"
                    allowFullScreen
                    allow="autoplay; fullscreen; xr-spatial-tracking"
                    mozallowfullscreen="true"
                    webkitallowfullscreen="true"
                  ></iframe>
                </div>
                <button 
                  className={`${styles.wireframeButton} ${sketchfabWireframe ? styles.active : ''}`}
                  onClick={this.toggleSketchfabWireframe}
                >
                  {sketchfabWireframe ? "Hide Wireframe" : "Show Wireframe"}
                </button>
              </div>
            )}
            
            <div className={styles.imagesSection}>
              <div
                className={styles.projectImageContainer}
                onMouseEnter={this.handleMouseEnter}
                onMouseLeave={this.handleMouseLeave}
              >
                <Image
                  src={showWireframe ? project.wireframeImage : mainImagePath}
                  alt={project.title[language]}
                  width={600}
                  height={400}
                  className={styles.projectMainImage}
                  priority
                />
              </div>

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
                        ? project.wireframeImage 
                        : `/images/projects/${project.imageFolder || project.id}/${thumbnail.src}`}
                      alt={thumbnail.alt}
                      width={200}
                      height={150}
                      className={styles.thumbnailImage}
                    />
                  </div>
                ))}
              </div>
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