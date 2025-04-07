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

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [sketchfabLoaded, setSketchfabLoaded] = useState<boolean>(false);
  const [sketchfabError, setSketchfabError] = useState<boolean>(false);
  const [isWireframe, setIsWireframe] = useState<boolean>(false);

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
        ui_controls: 0
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
      myMaterials.current = materials.filter((m: any) => !project.excludedFromWireframe.includes(m.name)).map((m: any) => JSON.parse(JSON.stringify(m)));
      originalMaterials.current = myMaterials.current.map((m: any) => JSON.parse(JSON.stringify(m)));
    });
  };

  const toggleWireframe = (e: React.MouseEvent) => {
    e.preventDefault();

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

      const c = 0.1
      m.channels.EmitColor.color = [c, c, c];
      m.channels.DiffuseColor.color = [1, 1, 1];
      m.channels.ClearCoat.tint = [0, 0, 0]
      m.channels.ClearCoatRoughness.factor = 1
      m.channels.GlossinessPBR.factor = 1
      m.channels.MetalnessPBR.factor = 0
      m.channels.RoughnessPBR.factor = 1

      m.channels.Matcap.color = [1, 1, 1];
      m.channels.Sheen.colorFactor = [1, 1, 1];
      m.channels.Sheen.factor = 1;
      m.channels.SpecularColor.color = [1, 1, 1];
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
  const layoutClassName = styles[`layout${index % 2}`];
  const projectSoftwareWithLogos = project.software.filter(sw => softwares[sw]).map(sw => ({ name: sw, ...softwares[sw] }));

  const showSketchfab = project.modelId && !sketchfabError;
  const showMainImage = !showSketchfab;

  useEffect(() => {
    initSketchfab();
  }, []);

  return (
    <motion.div
      className={styles.projectWrapper}
      initial={{ opacity: 0, y: 100 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      viewport={{ once: true, margin: "-100px" }}
    >

      <div className={`container  ${styles.projectContainer} ${layoutClassName}`}>

        <div className={styles.projectHeader}>
          <h3 className={styles.projectNumber}>{String(index + 1).padStart(2, '0')}</h3>
          <h3 className={styles.projectTitle}>{project.title[language]}</h3>
        </div>

        <div className={styles.projectContent}>
          <div className={`${styles.modelSection} noGrainOverlay`}>
            {showSketchfab && (
              <div className={`${styles.modelContainer} border-sm`}>
                <iframe
                  ref={iframeRef}
                  title={`Sketchfab Model - ${project.title[language]}`}
                  className={styles.modelEmbed}
                ></iframe>
                <button
                  className={`${styles.wireframeButton} ${isWireframe ? styles.active : 'border-sm'} `}
                  onClick={toggleWireframe}
                  aria-label="Toggle wireframe"
                >
                  <Grid size={16} className={styles.wireframeIcon} />
                </button>
              </div>
            )}

            {showMainImage && (
              <div className={`${styles.modelContainer} border-sm`}>
                <Image
                  src={isWireframe ? wireframeImagePath : mainImagePath}
                  alt={project.title[language]}
                  fill={true}
                  className={styles.projectMainImage}
                  priority
                />
              </div>
            )}
          </div>

          <div className={`${styles.projectDetails} noGrainOverlay`}>
            <div className={styles.projectInfo}>
              <div className={styles.projectDescription}>
                <p>{project.description[language]}</p>
              </div>

              {/* New wrapper for stats and software */}
              <div className={styles.projectStatsAndSoftware}>
                <ProjectStats stats={project.stats} />

                <div className={styles.software}>
                  <span className={styles.softwareLabel}>{t('projects.renderedWith')}</span>
                  <div className={styles.softwareIcons}>
                    {projectSoftwareWithLogos.map((sw, index) => (
                      <div key={index} className={styles.softwareIcon}>
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

          <div className={`${styles.thumbnailsContainer} noGrainOverlay`}>
            {project.thumbnails.map((thumbnail, index) => (
              <div
                key={index}
                className={`${styles.thumbnailWrapper} border-sm`}
              >
                <Image
                  src={`/images/projects/${project.imageFolder}/${isWireframe ? thumbnail.srcWireframe : thumbnail.src}`}
                  alt={thumbnail.alt}
                  fill={true}
                  className={styles.thumbnailImage}
                />
              </div>
            ))}
          </div>




        </div>





      </div>
    </motion.div>
  );
};

export default MainProject;