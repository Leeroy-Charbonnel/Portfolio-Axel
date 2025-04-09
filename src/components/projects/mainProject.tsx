import React, { useState, useEffect, useRef, useContext } from 'react';
import Image from 'next/image';
import { motion, useInView } from 'framer-motion';
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

interface LightSetting {
  intensity: number;
  color: number[];
}

const MainProject: React.FC<MainProjectProps> = ({ project, softwares, index }) => {
  const { language, t } = useContext(LanguageContext) as LanguageContextType;
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // Check if the component is in view
  const isInView = useInView(containerRef, { 
    once: true, // Only trigger once
    amount: 0.3, // Trigger when 30% of the element is in view
    margin: "0px 0px -200px 0px" // Start loading a bit before it comes into view
  });

  const [sketchfabLoaded, setSketchfabLoaded] = useState<boolean>(false);
  const [sketchfabInitialized, setSketchfabInitialized] = useState<boolean>(false);
  const [sketchfabError, setSketchfabError] = useState<boolean>(false);
  const [isWireframe, setIsWireframe] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const sketchfabAPI = useRef<any>(null);
  const sketchfabClient = useRef<any>(null);
  const originalMaterials = useRef<Record<string, any>>({});
  const geometryNodes = useRef<any[]>([]);
  const whiteMaterial = useRef<string | null>(null);
  const originalLights = useRef<Record<number, LightSetting>>({});
  
  //Constants for wireframe visualization
  const wireframeColor = project.wireframeParameters?.wireframeColor || "00000020"; //Transparent black for wireframe lines
  const whiteMaterialColor = project.wireframeParameters?.whiteMaterialColor || [0.09, 0.09, 0.09]; //Default dark gray for materials in wireframe mode

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
    
    //Initialize white material for wireframe mode
    initWhiteMaterial();
    
    //Store original light settings
    storeOriginalLightSettings();
    
    //Get node map to find geometry nodes and their materials
    sketchfabAPI.current.getNodeMap((err: any, nodes: any) => {
      if (err) {
        console.error("Error getting node map:", err);
        return;
      }
      
      //Get all geometry nodes
      geometryNodes.current = Object.values(nodes).filter((node: any) => 
        node.type === "Geometry"
      );
      
      //Save original materials for later restoration
      geometryNodes.current.forEach((node: any) => {
        originalMaterials.current[node.name] = node.materialID;
      });
    });
  };

  //Store original light settings for all 3 lights
  const storeOriginalLightSettings = () => {
    if (!sketchfabAPI.current) return;
    
    //Sketchfab has 3 lights (indices 0, 1, 2)
    for (let i = 0; i < 3; i++) {
      sketchfabAPI.current.getLight(i, (err: any, light: any) => {
        if (err) {
          console.error(`Error getting light ${i}:`, err);
          return;
        }
        
        originalLights.current[i] = {
          intensity: light.intensity || 1.0,
          color: light.color || [1, 1, 1]
        };
      });
    }
  };

  //Create a white material for wireframe mode
  const initWhiteMaterial = () => {
    if (!sketchfabAPI.current) return;
    
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
      whiteMaterial.current = material.id;
    });
  };

  //Set lights based on wireframeParameters settings
  const setLightsForWireframeMode = () => {
    if (!sketchfabAPI.current || !project.wireframeParameters?.lights) return;
    
    //Apply light settings based on index
    project.wireframeParameters.lights.forEach(light => {
      if (light.index !== undefined && light.index >= 0 && light.index < 3) {
        const intensity = light.intensity || 1.0;
        const color = hexToRgb(light.color || "#ffffff");
        
        sketchfabAPI.current.setLight(light.index, {
          intensity: intensity,
          color: color
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

  //Helper to convert hex color to RGB array
  const hexToRgb = (hex: string): number[] => {
    //Remove # if present
    hex = hex.replace(/^#/, '');
    
    //Parse the hex values
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    
    return [r, g, b];
  };

  const toggleWireframe = (e: React.MouseEvent) => {
    e.preventDefault();

    if (!sketchfabAPI.current || whiteMaterial.current === null) {
      setIsWireframe(false);
      return;
    }

    const newWireframeState = !isWireframe;
    
    //Set wireframe visibility with color
    sketchfabAPI.current.setWireframe(true, {
      color: newWireframeState ? wireframeColor : "00000000" //Transparent when not in wireframe mode
    });
    
    if (newWireframeState) {
      //Switch to wireframe mode
      setLightsForWireframeMode();
      
      //Apply white material to all geometry nodes
      geometryNodes.current.forEach((node: any) => {
        sketchfabAPI.current.assignMaterial(node, whiteMaterial.current);
      });
    } else {
      //Switch back to normal mode
      restoreOriginalLights();
      
      //Restore original materials
      geometryNodes.current.forEach((node: any) => {
        sketchfabAPI.current.assignMaterial(node, originalMaterials.current[node.name]);
      });
    }
    
    setIsWireframe(newWireframeState);
  };

  // Get project stats with calculated triangles if not provided
  const getProjectStats = () => {
    const stats = {...project.stats};
    
    // Calculate triangles if not provided (faces * 2)
    if (stats.faces && !stats.triangles) {
      stats.triangles = stats.faces * 2;
    }
    
    return stats;
  };

  const mainImagePath = `/images/projects/${project.imageFolder}/main.png`;
  const wireframeImagePath = `/images/projects/${project.imageFolder}/main-wireframe.png`;
  const layoutClassName = styles[`layout${index % 2}`];
  const projectSoftwareWithLogos = project.software.filter(sw => softwares[sw]).map(sw => ({ name: sw, ...softwares[sw] }));

  const showSketchfab = project.modelId && !sketchfabError && isInView;
  const showMainImage = !showSketchfab || isLoading;

  // Initialize Sketchfab when the component comes into view
  useEffect(() => {
    if (isInView && !sketchfabInitialized) {
      initSketchfab();
    }
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
              
              {/* Always render iframe but it will only initialize when in view */}
              {project.modelId && (
                <iframe
                  ref={iframeRef}
                  title={`Sketchfab Model - ${project.title[language]}`}
                  className={`${styles.modelEmbed} ${showSketchfab && !isLoading ? '' : styles.hidden}`}
                ></iframe>
              )}
              
              {/* Loading indicator */}
              {isLoading && (
                <div className={styles.loadingContainer}>
                  <div className={styles.loadingSpinner}></div>
                </div>
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
                <ProjectStats stats={getProjectStats()} animate={true} />

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