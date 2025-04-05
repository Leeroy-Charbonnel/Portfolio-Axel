import React, { useState, useEffect, useRef, useContext } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Grid } from 'lucide-react';
import { Project, Software } from '../../types';
import { LanguageContext, LanguageContextType } from '../languageProvider';
import ProjectStats from './projectStats';
import styles from './mainProject.module.css';

declare global {
  interface Window {
    Sketchfab: any;
  }
}

interface MainProjectProps {
  project: Project;
  softwares: Record<string, Software>;
  index: number;
}

const MainProject: React.FC<MainProjectProps> = ({ project, softwares, index }) => {

  const { language, t } = useContext(LanguageContext) as LanguageContextType;

  //Refs
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [sketchfabLoaded, setSketchfabLoaded] = useState<boolean>(false);
  const [sketchfabError, setSketchfabError] = useState<boolean>(false);
  const [isWireframe, setIsWireframe] = useState<boolean>(false);

  //Sketchfab API references
  const sketchfabAPI = useRef<any>(null);
  const sketchfabClient = useRef<any>(null);
  const myMaterials = useRef<any[]>([]);
  const originalMaterials = useRef<any[]>([]);


  const initSketchfab = () => {
    if (!iframeRef.current) return;

    try {
      sketchfabClient.current = new window.Sketchfab(iframeRef.current);
      sketchfabClient.current.init(project.modelId, {
        success: (api: any) => {
          sketchfabAPI.current = api;
          api.start();
          api.addEventListener('viewerready', onViewerReady);
          setSketchfabLoaded(true);
        },
        error: () => {
          console.error('Sketchfab API initialization failed');
          setSketchfabError(true);
        },
        autostart: 1,
        preload: 1,
        ui_theme: 'dark',
        ui_controls: 1
      });
    } catch (err) {
      console.error('Error initializing Sketchfab:', err);
      setSketchfabError(true);
    }
  };

  const onViewerReady = () => {
    if (!sketchfabAPI.current) return;

    //Get materials list
    sketchfabAPI.current.getMaterialList((err: any, materials: any) => {
      myMaterials.current = materials.map((m: any) => JSON.parse(JSON.stringify(m)));
    });
  };

  const toggleWireframe = () => {
    if (!sketchfabAPI.current) {
      setIsWireframe(false);
      return;
    }

    const newWireframeState = !isWireframe;
    sketchfabAPI.current.setWireframe(newWireframeState);
    if (newWireframeState) {
      makeAllMaterialsWhite();
    } else {
      restoreOriginalMaterials();
    }
    setIsWireframe(newWireframeState);
  };

  const makeAllMaterialsWhite = () => {
    if (!sketchfabAPI.current) return;

    for (let i = 0; i < myMaterials.current.length; i++) {
      const m = myMaterials.current[i];

      if (m.channels.AlbedoPBR) {
        m.channels.AlbedoPBR.enable = true;
        m.channels.AlbedoPBR.color = [1.0, 1.0, 1.0];
        if (m.channels.AlbedoPBR.texture) {
          m.channels.AlbedoPBR.texture = null;
        }
      }

      if (m.channels.DiffuseColor) {
        m.channels.DiffuseColor.enable = false;
      }

      if (m.channels.RoughnessPBR) {
        m.channels.RoughnessPBR.enable = true;
        m.channels.RoughnessPBR.factor = 1.0;
      }

      if (m.channels.MetalnessPBR) {
        m.channels.MetalnessPBR.enable = false;
      }

      sketchfabAPI.current.setMaterial(m);
    }
  };

  const restoreOriginalMaterials = () => {
    if (!sketchfabAPI.current) return;

    for (let i = 0; i < originalMaterials.current.length; i++) {
      sketchfabAPI.current.setMaterial(originalMaterials.current[i]);
    }
  };

  const mainImagePath = `/images/projects/${project.imageFolder}/main.png`;
  const wireframeImagePath = `/images/projects/${project.imageFolder}/main-wireframe.png`;
  const layoutClassName = styles[`layout${index % 3}`];
  const projectSoftwareWithLogos = project.software.filter(sw => softwares[sw]).map(sw => ({ name: sw, ...softwares[sw] }));

  const showSketchfab = project.modelId && !sketchfabError;
  const showMainImage = !showSketchfab;

  initSketchfab();


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
          {showSketchfab && (
            <div className={styles.modelContainer}>
              <div className={styles.sketchfabContainer}>
                <iframe
                  ref={iframeRef}
                  title={`Sketchfab Model - ${project.title[language]}`}
                  className={styles.sketchfabEmbed}
                  frameBorder="0"
                  allowFullScreen
                  allow="autoplay; fullscreen; xr-spatial-tracking"
                ></iframe>
              </div>
              <button
                className={`${styles.wireframeButton} ${isWireframe ? styles.active : ''}`}
                onClick={toggleWireframe}
              >
                <Grid size={16} className={styles.wireframeIcon} />
                {isWireframe ? "Hide Wireframe" : "Show Wireframe"}
              </button>
            </div>
          )}

          {showMainImage && (
            <div className={styles.imagesSection}>
              <div className={styles.projectImageContainer}>
                <Image
                  src={isWireframe ? wireframeImagePath : mainImagePath}
                  alt={project.title[language]}
                  width={600}
                  height={400}
                  className={styles.projectMainImage}
                  priority
                />
              </div>
              <button
                className={`${styles.wireframeButton} ${isWireframe ? styles.active : ''}`}
                onClick={() => setIsWireframe(!isWireframe)}
              >
                <Grid size={16} className={styles.wireframeIcon} />
                {isWireframe ? "Hide Wireframe" : "Show Wireframe"}
              </button>
            </div>
          )}

          <div className={styles.thumbnailsContainer}>
            {project.thumbnails.map((thumbnail, idx) => (
              <div
                key={idx}
                className={styles.thumbnailWrapper}
              >
                <Image
                  src={isWireframe ? `/images/projects/${project.imageFolder}/${thumbnail.srcWireframe}` : `/images/projects/${project.imageFolder}/${thumbnail.src}`}
                  alt={thumbnail.alt}
                  width={150}
                  height={113}
                  className={styles.thumbnailImage}
                />
              </div>
            ))}
          </div>
        </div>

        <div className={styles.projectDetails}>
          <div className={styles.projectInfo}>

            <div className={styles.projectDescription}>
              <p>{project.description[language]}</p>
            </div>

            <ProjectStats stats={project.stats} />

            <div className={styles.software}>
              <span className={styles.softwareLabel}>{t('projects.renderedWith')}</span>
              <div className={styles.softwareIcons}>
                {projectSoftwareWithLogos.map((sw, idx) => (
                  <div key={idx} className={styles.softwareIcon}>
                    <a href={sw.url} target="_blank" rel="noopener noreferrer" className={styles.softwareLink}>
                      <Image
                        src={sw.logo}
                        alt={sw.name}
                        width={24}
                        height={24}
                        className={styles.softwareLogo}
                      />
                      <span>{sw.name}</span>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    </motion.div>
  );
};

export default MainProject;