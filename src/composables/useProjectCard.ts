import { computed, ref, watch, type Ref } from "vue"
import { useAdmin } from "./useAdmin"
import { useEffectiveViewerSettings, useResolvedGlbUrl } from "./useEffectiveViewerSettings"
import { useLanguage } from "./useLanguage"
import { useLightbox } from "./useLightbox"
import { usePortfolio } from "./usePortfolio"
import type { MainProjectDto, ThumbnailDto } from "../types/portfolio"

//WHAT A PROJECT CARD DOES, WHATEVER ITS LAYOUT.
//
//MainProject.vue and MainProjectPhone.vue render the same project two ways, and
//they carried nine identical functions between them: the wireframe toggle and
//its reset, the list handed to the lightbox, the thumbnail-to-slide lookup, and
//the two save handlers. Editing one and forgetting the other is the whole reason
//this exists.
//
//What stays in the components is what actually differs: the markup, and the
//Sketchfab lifecycle, whose suspend condition is not the same on the two (the
//desktop card has a preview switcher, the phone card does not).

export function useProjectCard(project: Ref<MainProjectDto>, opts: { mobile?: boolean } = {}) {
  const { lang }     = useLanguage()
  const { editMode } = useAdmin()
  const { data: portfolioData, updateMainProject } = usePortfolio()
  const { open: openLightbox } = useLightbox()

  const effectiveViewerSettings = useEffectiveViewerSettings(project, portfolioData, opts)
  const resolvedGlbUrl          = useResolvedGlbUrl(project, portfolioData)

  const isWireframe = ref(false)

  //leaving edit mode drops back to the lit view: the wireframe is a way of
  //looking at the model, not a property of the project
  watch(editMode, (isEditing) => { if (isEditing === false) isWireframe.value = false })

  function toggleWireframe(e: Event) {
    e.preventDefault()
    isWireframe.value = !isWireframe.value
  }

  const mainImageUrl = computed(() => project.value.mainImageUrl)

  //the button is worth showing only when something can actually change: a model
  //carries its own wireframe rig, an image needs a wireframe variant
  const hasAnyWireframeImage = computed(() => {
    if (resolvedGlbUrl.value) return true
    if (project.value.mainWireframeUrl) return true
    return project.value.thumbnails.some((t) => t.wireframeUrl)
  })

  const lightboxImages = computed(() => {
    const list: { url: string; alt?: string }[] = []
    const main = isWireframe.value
      ? project.value.mainWireframeUrl ?? project.value.mainImageUrl
      : project.value.mainImageUrl
    if (main) list.push({ url: main, alt: project.value.title[lang.value] })
    for (const t of project.value.thumbnails) {
      const url = isWireframe.value ? t.wireframeUrl ?? t.url : t.url
      if (url) list.push({ url, alt: t.description?.[lang.value] ?? "" })
    }
    return list
  })

  function onImageClick(startIndex: number) {
    if (editMode.value) return
    openLightbox(lightboxImages.value, startIndex)
  }

  //Thumbnails map to slides by url, not by position: lightboxImages skips the
  //main image when it is missing and skips thumbnails with no file, so index + 1
  //would open the wrong one.
  function onThumbnailClick(thumb: ThumbnailDto) {
    if (editMode.value || !thumb.url) return
    const url = isWireframe.value ? thumb.wireframeUrl ?? thumb.url : thumb.url
    openLightbox(lightboxImages.value, lightboxImages.value.findIndex((img) => img.url === url))
  }

  async function onTitleSave(value: string) {
    await updateMainProject(project.value.id, {
      title: { ...project.value.title, [lang.value]: value },
    })
  }

  async function onDescriptionSave(value: string) {
    await updateMainProject(project.value.id, {
      description: { ...project.value.description, [lang.value]: value },
    })
  }

  return {
    lang,
    editMode,
    portfolioData,
    updateMainProject,
    effectiveViewerSettings,
    resolvedGlbUrl,
    isWireframe,
    toggleWireframe,
    mainImageUrl,
    hasAnyWireframeImage,
    lightboxImages,
    onImageClick,
    onThumbnailClick,
    onTitleSave,
    onDescriptionSave,
  }
}
