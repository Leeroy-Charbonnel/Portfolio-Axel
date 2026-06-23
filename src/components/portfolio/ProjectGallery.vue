<script setup lang="ts">
import { useLanguage } from "../../composables/useLanguage"
import { useAdmin } from "../../composables/useAdmin"
import { usePortfolio } from "../../composables/usePortfolio"
import { formatNumber, pickImageFile, statLetter, statName } from "../../lib/portfolio-utils"
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

async function onStatSave(p: GalleryProjectDto, key: "vertices" | "edges" | "faces" | "triangles", val: string) {
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

              <!--LINK editor sits between title and the bottom stats strip so
              it doesn't push the icon row out of its visual home (the card
              footer). Only rendered in edit mode.-->
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

              <!--Stats row anchored to the BOTTOM of the card so every gallery
              card has stats aligned on the same baseline regardless of the
              title length above. Letter badges follow the active language
              (V/E/F/T in EN, S/A/F/T in FR) with the full name as tooltip.-->
              <div class="gallery-item__stats">
                <div class="gallery-item__stat">
                  <span
                    class="gallery-item__stat-icon"
                    :title="statName('vertices', lang)"
                    :aria-label="statName('vertices', lang)"
                  >{{ statLetter('vertices', lang) }}</span>
                  <span v-if="!editMode">{{ formatNumber(project.stats.vertices) }}</span>
                  <EditableText
                    v-else
                    tag="span"
                    :value="String(project.stats.vertices)"
                    @save="(v) => onStatSave(project, 'vertices', v)"
                  />
                </div>
                <div class="gallery-item__stat">
                  <span
                    class="gallery-item__stat-icon"
                    :title="statName('edges', lang)"
                    :aria-label="statName('edges', lang)"
                  >{{ statLetter('edges', lang) }}</span>
                  <span v-if="!editMode">{{ formatNumber(project.stats.edges) }}</span>
                  <EditableText
                    v-else
                    tag="span"
                    :value="String(project.stats.edges)"
                    @save="(v) => onStatSave(project, 'edges', v)"
                  />
                </div>
                <div class="gallery-item__stat">
                  <span
                    class="gallery-item__stat-icon"
                    :title="statName('faces', lang)"
                    :aria-label="statName('faces', lang)"
                  >{{ statLetter('faces', lang) }}</span>
                  <span v-if="!editMode">{{ formatNumber(project.stats.faces ?? 0) }}</span>
                  <EditableText
                    v-else
                    tag="span"
                    :value="String(project.stats.faces ?? 0)"
                    @save="(v) => onStatSave(project, 'faces', v)"
                  />
                </div>
                <div class="gallery-item__stat">
                  <span
                    class="gallery-item__stat-icon"
                    :title="statName('triangles', lang)"
                    :aria-label="statName('triangles', lang)"
                  >{{ statLetter('triangles', lang) }}</span>
                  <span v-if="!editMode">{{ formatNumber(project.stats.triangles ?? 0) }}</span>
                  <EditableText
                    v-else
                    tag="span"
                    :value="String(project.stats.triangles ?? 0)"
                    @save="(v) => onStatSave(project, 'triangles', v)"
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
  grid-template-columns: repeat(var(--gallery-columns), 1fr);
  gap: var(--gallery-gap);
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

/*Flex column so every card stretches to the same height inside its grid
row. The details block grows to fill remaining space, which lets the stats
row stick to the BOTTOM of every card on the same baseline.*/
.gallery-item__inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  cursor: pointer;
}

.gallery-item__thumbnail-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: var(--gallery-thumb-aspect);
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

/*Grow to absorb remaining card height so the stats row can hug the bottom
edge via margin-top:auto on .gallery-item__stats.*/
.gallery-item__details {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  padding: var(--gallery-card-padding);
  gap: var(--spacing-xs);
}

.gallery-item__title {
  font-size: var(--gallery-title-size);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-tight);
}

.gallery-item__link-row {
  display: flex;
  gap: var(--spacing-sm);
  align-items: baseline;
  margin-top: var(--spacing-sm);
  padding-top: var(--spacing-sm);
  border-top: var(--border-width-sm) dashed var(--color-gray-medium);
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

/*margin-top:auto pushes the stats strip down so it sits flush with the
bottom of the card regardless of title length above. Hairline above the
strip separates the meta numbers from the title visually.
Fixed 4-column grid so the four stat badges (V/E/F/T or S/A/F/T) always
fit on one row no matter how wide the numbers get - flex was letting
long counters push the last badge onto a second line.*/
.gallery-item__stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--spacing-sm);
  margin-top: auto;
  padding-top: var(--spacing-sm);
  border-top: var(--border-width-sm) solid var(--color-gray-medium);
}

.gallery-item__stat {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  min-width: 0;
  font-size: var(--gallery-stat-size);
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

/*Letter badge carrying V/E/F/T (or S/A/F/T in FR). Square pill, --tag-bg
fill, mono letter. Same treatment as MainProject so the two sections share
one visual language.*/
.gallery-item__stat-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width:  var(--gallery-stat-badge-size);
  height: var(--gallery-stat-badge-size);
  background-color: var(--tag-bg);
  color: var(--color-text-hover);
  font-size: calc(var(--gallery-stat-badge-size) * 0.55);
  font-weight: var(--font-weight-bold);
  font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace;
  letter-spacing: 0;
  cursor: default;
}

/*Responsive grid - phones get 2 columns (not 1, there's room) so the
gallery feels dense; tablets get 2; only very narrow / portrait phones
collapse to a single column. The .simulate-phone selectors mirror the
same layout for the CssVarsPanel preview.*/
@media (max-width: 1024px) { .gallery-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 480px)  {
  .gallery-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-sm);
  }
  .gallery-item__stats {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-xs);
  }
}

/*simulate-phone (driven by the CssVarsPanel's drag). html.simulate-phone
is an ancestor selector; scoped CSS still hashes the descendant.*/
html.simulate-phone .gallery-grid {
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-sm);
}
html.simulate-phone .gallery-item__stats {
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-xs);
}
</style>
