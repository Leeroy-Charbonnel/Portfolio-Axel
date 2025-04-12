import React, { useState, useEffect, useRef, useContext } from 'react';
import Image from 'next/image';
import { motion, useInView } from 'framer-motion';
import { Grid } from 'lucide-react';
import { Project, Software } from '../../types';
import { LanguageContext, LanguageContextType } from '../languageProvider';
import styles from './mainProject.module.css';
import AnimatedCounter from '../AnimatedCounter';
import { hexToRgb } from '@/utils/Utils';

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

interface LightSetting {
  intensity: number;
  color: number[];
}

const MainProject: React.FC<MainProjectProps> = ({ project, softwares, index }) => {
  const { language, t } = useContext(LanguageContext) as LanguageContextType;
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const isInView = useInView(containerRef, {
    once: true,
    amount: 0.3,
    margin: "0px 0px -200px 0px" //Load before fully in view
  });

  const [sketchfabLoaded, setSketchfabLoaded] = useState<boolean>(false);
  const [sketchfabInitialized, setSketchfabInitialized] = useState<boolean>(false);
  const [sketchfabError, setSketchfabError] = useState<boolean>(false);
  const [isWireframe, setIsWireframe] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const sketchfabAPI = useRef<any>(null);

  const sketchfabClient = useRef<any>(null);

  const geometryNodes = useRef<any[]>([]);
  const originalMaterials = useRef<Record<string, any>>({});



  const whiteMaterial = useRef<string | null>(null);
  const emissiveMaterial = useRef<string | null>(null);
  const originalLights = useRef<Record<number, LightSetting>>({});

  //Constants for wireframe visualization
  const wireframeColor = project.wireframeParameters?.wireframeColor || "00000020";
  const whiteMaterialColor = project.wireframeParameters?.whiteMaterialColor || [0.09, 0.09, 0.09];
  const emissiveMaterialColor = project.wireframeParameters?.emissiveMaterialsColor || [0.5, 0.5, 0.5];

  const initSketchfab = () => {
    if (!iframeRef.current || !isInView || sketchfabInitialized) return;

    setIsLoading(true);
    setSketchfabInitialized(true);

    try {
      sketchfabClient.current = new window.Sketchfab(iframeRef.current);
      sketchfabClient.current.init(project.modelId, {
        success: (api: any) => {
          sketchfabAPI.current = api;
          api.start();
          api.addEventListener('viewerready', onViewerReady);
          setSketchfabLoaded(true);
          setIsLoading(false);
        },
        error: () => {
          console.error('Sketchfab API initialization failed');
          setSketchfabError(true);
          setIsLoading(false);
        },
        autostart: 1,
        preload: 1,
        ui_controls: 0
      });
    } catch (err) {
      console.error('Error initializing Sketchfab:', err);
      setSketchfabError(true);
      setIsLoading(false);
    }
  };

  const onViewerReady = () => {
    if (!sketchfabAPI.current) return;

    initMaterial();
    storeOriginalLightSettings();

    sketchfabAPI.current.getNodeMap((err: any, nodes: any) => {
      if (err) {
        console.error("Error getting node map:", err);
        return;
      }

      //Get all geometry nodes
      geometryNodes.current = Object.values(nodes).filter((node: any) =>
        node.type === "Geometry"
      );


      //Save original materials
      geometryNodes.current.forEach((node: any) => {
        originalMaterials.current[node.name] = node.materialID;
      });
    });
  };

  //Store original light settings for all 3 lights
  const storeOriginalLightSettings = () => {
    if (!sketchfabAPI.current) return;

    for (let i = 0; i < 3; i++) {
      sketchfabAPI.current.getLight(i, (err: any, light: any) => {
        if (err) {
          console.error(`Error getting light ${i}:`, err);
          return;
        }
        originalLights.current[i] = {
          intensity: light.intensity,
          color: light.color
        };
      });
    }
  };

  const initMaterial = () => {
    if (!sketchfabAPI.current) return;

    sketchfabAPI.current.createMaterial({
      channels: {
        AlbedoPBR: { color: emissiveMaterialColor },
        EmitColor: { factor: 1, color: emissiveMaterialColor },
        Matcap: { factor: 0 },
        ClearCoat: { factor: 0 },
        ClearCoatNormalMap: { factor: 0 },
        ClearCoatRoughness: { factor: 0 },
        GlossinessPBR: { factor: 0 },
        RoughnessPBR: { factor: 1 },
        MetalnessPBR: { factor: 0 },
      }
    }, (err: any, material: any) => {
      if (err) {
        console.error("Error creating white material:", err);
        return;
      }
      whiteMaterial.current = material.id;
    });




    sketchfabAPI.current.createMaterial({
      channels: {
        AlbedoPBR: { color: whiteMaterialColor },
        EmitColor: { factor: 0 },
        Matcap: { factor: 0 },
        ClearCoat: { factor: 0 },
        ClearCoatNormalMap: { factor: 0 },
        ClearCoatRoughness: { factor: 0 },
        GlossinessPBR: { factor: 0 },
        RoughnessPBR: { factor: 1 },
        MetalnessPBR: { factor: 0 },
      }
    }, (err: any, material: any) => {
      if (err) {
        console.error("Error creating white material:", err);
        return;
      }
      emissiveMaterial.current = material.id;
    });
  };

  const setLightsForWireframeMode = () => {
    if (!sketchfabAPI.current || !project.wireframeParameters?.lightsOverwrite) return;

    project.wireframeParameters.lightsOverwrite.forEach(light => {
      if (light.index !== undefined && light.index >= 0 && light.index < 3) {
        const intensity = light.intensity || 1.0;
        const color = hexToRgb(light.color || "#ffffff");

        sketchfabAPI.current.setLight(light.index, {
          intensity: intensity || originalLights.current[light.index].intensity,
          color: color || originalLights.current[light.index].color,
        });
      }
    });
  };

  //Restore original light settings
  const restoreOriginalLights = () => {
    if (!sketchfabAPI.current) return;

    //Restore each light to its original settings
    Object.entries(originalLights.current).forEach(([indexStr, settings]) => {
      const index = parseInt(indexStr);
      sketchfabAPI.current.setLight(index, {
        intensity: settings.intensity,
        color: settings.color
      });
    });
  };



  const toggleWireframe = (e: React.MouseEvent) => {
    e.preventDefault();

    if (!sketchfabAPI.current || whiteMaterial.current === null) {
      setIsWireframe(false);
      return;
    }

    const newWireframeState = !isWireframe;

    sketchfabAPI.current.setWireframe(true, {
      color: newWireframeState ? wireframeColor : "00000000"
    });

    if (newWireframeState) {
      setLightsForWireframeMode();

      geometryNodes.current.forEach((node: any) => {
        sketchfabAPI.current.assignMaterial(node, whiteMaterial.current);
      });
    } else {
      restoreOriginalLights();

      geometryNodes.current.forEach((node: any) => {
        sketchfabAPI.current.assignMaterial(node, originalMaterials.current[node.name]);
      });
    }

    setIsWireframe(newWireframeState);
  };

  const mainImagePath = `/images/projects/${project.imageFolder}/main.png`;
  const wireframeImagePath = `/images/projects/${project.imageFolder}/main-wireframe.png`;
  const layoutClassName = styles[`layout${index % 2}`];
  const projectSoftwareWithLogos = project.software.filter(sw => softwares[sw]).map(sw => ({ name: sw, ...softwares[sw] }));

  const showSketchfab = project.modelId && !sketchfabError && isInView;
  const showMainImage = !showSketchfab || isLoading;

  useEffect(() => {
    if (isInView && !sketchfabInitialized) { initSketchfab(); }
  }, [isInView, sketchfabInitialized]);

  return (
    <motion.div
      className={styles.projectWrapper}
      initial={{ opacity: 0, y: 100 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      viewport={{ once: true, margin: "-100px" }}
      ref={containerRef}
    >
      <div className={`container ${styles.projectContainer} ${layoutClassName}`}>
        <div className={styles.projectHeader}>
          <h3 className={styles.projectNumber}>{String(index + 1).padStart(2, '0')}</h3>
          <h3 className={styles.projectTitle}>{project.title[language]}</h3>
        </div>

        <div className={styles.projectContent}>

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


          <div className={styles.panel1}>
            <div className={`${styles.modelSection} noGrainOverlay`}>
              <div className={`${styles.modelContainer} border-sm`}>
                {showMainImage && (
                  <Image
                    src={isWireframe ? wireframeImagePath : mainImagePath}
                    alt={project.title[language]}
                    fill={true}
                    className={styles.projectMainImage}
                    priority
                  />
                )}

                {project.modelId && (
                  <iframe
                    ref={iframeRef}
                    title={`Sketchfab Model - ${project.title[language]}`}
                    className={`${styles.modelEmbed} ${showSketchfab && !isLoading ? '' : styles.hidden}`}
                  ></iframe>
                )}

                <button
                  className={`${styles.wireframeButton} ${isWireframe ? styles.active : 'border-sm'} `}
                  onClick={toggleWireframe}
                  aria-label="Toggle wireframe"
                  disabled={!sketchfabLoaded}
                >
                  <Grid size={16} className={styles.wireframeIcon} />
                </button>
              </div>
            </div>

            <div className={`${styles.projectDetails} noGrainOverlay`}>
              <div className={styles.projectInfo}>
                <div className={styles.projectDescription}>
                  <p>{project.description[language]}</p>
                </div>

                <div className={styles.projectStatsAndSoftware}>


                  <div className={styles.statsContainer}>
                    {[
                      { key: 'vertices', value: project.stats.vertices! },
                      { key: 'edges', value: project.stats.edges! },
                      { key: 'faces', value: project.stats.faces! }
                    ].map((item, index) => (
                      <motion.div
                        key={item.key}
                        className={styles.statItem}
                        initial={{ opacity: 0, y: 20 }}
                        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                        transition={{ delay: index * 0.1 + 0.3, duration: 0.5 }}
                      >

                        <div className={styles.statLabel}>{t(`projects.stats.${item.key}`)}</div>
                        <AnimatedCounter from={0} to={item.value} duration={2} />
                      </motion.div>
                    ))}
                  </div>




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
                          <span className={styles.softwareName}>{sw.name}</span>
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>



        </div>
      </div>
    </motion.div>
  );
};

export default MainProject;