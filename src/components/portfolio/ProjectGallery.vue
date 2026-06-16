<script setup lang="ts">
import { useLanguage } from "../../composables/useLanguage"
import { useAdmin } from "../../composables/useAdmin"
import { usePortfolio } from "../../composables/usePortfolio"
import { formatNumber, pickImageFile } from "../../lib/portfolio-utils"
import AnimatedReveal from "./AnimatedReveal.vue"
import EditableText from "./EditableText.vue"
import RemoveButton from "./RemoveButton.vue"
import ReplaceImageButton from "./ReplaceImageButton.vue"
import AddButton from "./AddButton.vue"
import type { GalleryProjectDto } from "../../types/portfolio"

defineProps<{ projects: GalleryProjectDto[] }>()

const { t, lang } = useLanguage()
const { editMode } = useAdmin()
const { uploadFile, updateGalleryProject, deleteGalleryProject, createGalleryProject } = usePortfolio()

async function onTitleSave(p: GalleryProjectDto, newVal: string) {
  await updateGalleryProject(p.id, { title: { ...p.title, [lang.value]: newVal } })
}

async function onLinkSave(p: GalleryProjectDto, newVal: string) {
  await updateGalleryProject(p.id, { link: newVal.trim() })
}

async function onStatSave(p: GalleryProjectDto, key: "vertices" | "edges", val: string) {
  const n = parseInt(val.replace(/[^\d-]/g, ""), 10)
  if (Number.isNaN(n)) return
  await updateGalleryProject(p.id, { stats: { ...p.stats, [key]: n } })
}

async function onReplaceImage(p: GalleryProjectDto) {
  const file = await pickImageFile()
  if (!file) return
  try {
    const { id } = await uploadFile(file)
    await updateGalleryProject(p.id, { imageFileId: id })
  } catch (e) { console.error("[Gallery] replace image failed:", e) }
}
</script>

<template>
  <section id="gallery" class="gallery-section">
    <div class="container">
      <AnimatedReveal direction="bottom" :distance="50" :duration="0.8" :threshold="0.1">
        <h2 class="section-title">{{ t("galleryTitle") }}</h2>
      </AnimatedReveal>

      <div class="gallery-grid">
        <AnimatedReveal
          v-for="(project, index) in projects"
          :key="project.id"
          direction="bottom"
          :distance="30"
          :duration="0.6"
          :delay="index * 0.1"
          :threshold="0.1"
          class="gallery-item"
        >
          <RemoveButton v-if="editMode" label="Delete gallery item" @click="deleteGalleryProject(project.id)" />

          <component :is="editMode ? 'div' : 'a'"
            :href="editMode ? undefined : project.link"
            target="_blank"
            rel="noopener noreferrer"
            class="gallery-item__inner"
          >
            <div class="gallery-item__thumbnail-wrap no-grain">
              <img
                v-if="project.imageUrl"
                :src="project.imageUrl"
                :alt="project.title[lang]"
                class="gallery-item__thumbnail"
              />
              <div v-else class="gallery-item__thumbnail gallery-item__thumbnail--empty">
                No image
              </div>
              <ReplaceImageButton v-if="editMode" @click="onReplaceImage(project)" />
            </div>

            <div class="gallery-item__details">
              <EditableText
                tag="h3"
                class="gallery-item__title"
                :value="project.title[lang]"
                placeholder="Project name"
                @save="(v) => onTitleSave(project, v)"
              />

              <div v-if="editMode" class="gallery-item__link-row">
                <span class="gallery-item__link-label">Link</span>
                <EditableText
                  tag="span"
                  class="gallery-item__link-value"
                  :value="project.link"
                  placeholder="https://sketchfab.com/..."
                  @save="(v) => onLinkSave(project, v)"
                />
              </div>

              <div class="gallery-item__stats">
                <div class="gallery-item__stat">
                  <span class="gallery-item__stat-icon">V</span>
                  <span v-if="!editMode">{{ formatNumber(project.stats.vertices) }}</span>
                  <EditableText
                    v-else
                    tag="span"
                    :value="String(project.stats.vertices)"
                    @save="(v) => onStatSave(project, 'vertices', v)"
                  />
                </div>
                <div class="gallery-item__stat">
                  <span class="gallery-item__stat-icon">E</span>
                  <span v-if="!editMode">{{ formatNumber(project.stats.edges) }}</span>
                  <EditableText
                    v-else
                    tag="span"
                    :value="String(project.stats.edges)"
                    @save="(v) => onStatSave(project, 'edges', v)"
                  />
                </div>
              </div>
            </div>
          </component>
        </AnimatedReveal>

        <AddButton label="Add gallery item" @click="createGalleryProject" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.gallery-section {
  background: linear-gradient(to bottom, var(--color-background-secondary), var(--color-background));
  padding-top: var(--spacing-2xl);
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-xl);
  margin-top: var(--spacing-3xl);
}

.gallery-item {
  position: relative;
  border: var(--border-width-sm) solid hsl(var(--foreground) / 0.1);
  background-color: hsl(var(--card) / 0.5);
  overflow: hidden;
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
}

.gallery-item:hover {
  border-color: hsl(var(--foreground) / 0.3);
  box-shadow: 0 var(--spacing-sm) var(--spacing-2xl) hsl(var(--background) / 0.5);
}

.gallery-item__inner {
  display: block;
  cursor: pointer;
}

.gallery-item__thumbnail-wrap {
  position: relative;
  width: 100%;
  height: 0;
  padding-top: 75%;
  overflow: hidden;
}

.gallery-item__thumbnail {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.gallery-item__thumbnail--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-background-gray-100);
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
}

.gallery-item:hover .gallery-item__thumbnail { transform: scale(1.05); }

.gallery-item__details { padding: var(--spacing-md); }

.gallery-item__title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  margin-bottom: var(--spacing-xs);
  letter-spacing: var(--letter-spacing-tight);
}

.gallery-item__link-row {
  display: flex;
  gap: var(--spacing-sm);
  align-items: baseline;
  margin-bottom: var(--spacing-sm);
  font-size: var(--font-size-xs);
}

.gallery-item__link-label {
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
}

.gallery-item__link-value {
  font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace;
  color: var(--color-text-hover);
  word-break: break-all;
}

.gallery-item__stats { display: flex; gap: var(--spacing-md); }

.gallery-item__stat {
  display: flex;
  align-items: center;
  gap: var(--spacing-xxs);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.gallery-item__stat-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--spacing-lg);
  height: var(--spacing-lg);
  background-color: hsl(var(--foreground) / 0.1);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  margin-right: var(--spacing-xxs);
}

@media (max-width: 1024px) { .gallery-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px)  { .gallery-grid { grid-template-columns: 1fr; gap: var(--spacing-lg); } }
</style>
