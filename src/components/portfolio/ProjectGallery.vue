<script setup lang="ts">
import { computed } from "vue"
import { ExternalLink } from "lucide-vue-next"
import { useLanguage } from "../../composables/useLanguage"
import { useAdmin } from "../../composables/useAdmin"
import { useLightbox } from "../../composables/useLightbox"
import { usePortfolio } from "../../composables/usePortfolio"
import { formatNumber, statLetter, statName } from "../../lib/portfolio-utils"
import AnimatedReveal from "./AnimatedReveal.vue"
import EditableText from "./EditableText.vue"
import RemoveButton from "./RemoveButton.vue"
import ReplaceImageButton from "./ReplaceImageButton.vue"
import AddButton from "./AddButton.vue"
import type { GalleryProjectDto } from "../../types/portfolio"

const props = defineProps<{ projects: GalleryProjectDto[] }>()

const { t, lang } = useLanguage()
const { editMode } = useAdmin()
const { replaceImage, updateGalleryProject, deleteGalleryProject, createGalleryProject } = usePortfolio()

//LIGHTBOX hookup - tapping any gallery card opens the carousel with the
//FULL gallery list and starts at the clicked card's index.
const { open: openLightbox } = useLightbox()
const galleryAsLightbox = computed(() => props.projects
  .filter((p) => p.imageUrl)
  .map((p) => ({ url: p.imageUrl as string, alt: p.title[lang.value] }))
)
function onCardImageClick(p: GalleryProjectDto) {
  if (editMode.value || !p.imageUrl) return
  //index inside the LIGHTBOX list (which already filtered out items
  //without an imageUrl) - find by url match.
  const i = galleryAsLightbox.value.findIndex((it) => it.url === p.imageUrl)
  openLightbox(galleryAsLightbox.value, i >= 0 ? i : 0)
}

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

function onReplaceImage(p: GalleryProjectDto) {
  return replaceImage("gallery image", async (id) => {
    await updateGalleryProject(p.id, { imageFileId: id })
  })
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

          <div class="gallery-item__inner">
            <div
              class="gallery-item__thumbnail-wrap"
              :class="{ 'gallery-item__thumbnail-wrap--clickable': !editMode && project.imageUrl }"
              @click="onCardImageClick(project)"
            >
              <img
                v-if="project.imageUrl"
                :src="project.imageUrl"
                :alt="project.title[lang]"
                class="gallery-item__thumbnail"
              />
              <div v-else class="gallery-item__thumbnail gallery-item__thumbnail--empty">
                No image
              </div>
              <ReplaceImageButton v-if="editMode" @click.stop="onReplaceImage(project)" />

              <!--Sketchfab external link - sits as a small badge in the
              corner so the image click is reserved for the lightbox.-->
              <a
                v-if="!editMode && project.link"
                :href="project.link"
                target="_blank"
                rel="noopener noreferrer"
                class="gallery-item__sketchfab"
                :aria-label="`Open ${project.title[lang]} on Sketchfab`"
                title="Open on Sketchfab"
                @click.stop
              >
                <ExternalLink :size="14" />
              </a>
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
          </div>
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
.gallery-item__thumbnail-wrap--clickable { cursor: zoom-in; }

/*Sketchfab badge - tucked in the top-right corner of the thumb wrap so
the main click is reserved for the lightbox.*/
.gallery-item__sketchfab {
  position: absolute;
  top:   var(--spacing-xs);
  right: var(--spacing-xs);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width:  var(--spacing-xl);
  height: var(--spacing-xl);
  background-color: hsl(0 0% 0% / 0.6);
  border: var(--border-width-sm) solid var(--color-accent);
  color: var(--color-accent);
  text-decoration: none;
  backdrop-filter: blur(var(--filter-blur));
  z-index: 4;
  transition: background-color 0.2s ease, color 0.2s ease;
}
.gallery-item__sketchfab:hover {
  background-color: var(--color-accent);
  color: hsl(0 0% 0%);
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

/*Edit-mode link row - red-tinted because it's an admin-only field that
visitors don't see (matches the MainProject "admin only" model-id row).
The value column flexes to fill remaining width and truncates with
ellipsis instead of wrapping so the card height stays predictable.*/
.gallery-item__link-row {
  display: flex;
  gap: var(--spacing-sm);
  align-items: center;
  margin-top: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-xs);
  background-color: hsl(var(--destructive) / 0.08);
  border: var(--border-width-sm) solid hsl(var(--destructive) / 0.35);
}

.gallery-item__link-label {
  color: hsl(var(--destructive));
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  flex-shrink: 0;
}

.gallery-item__link-value {
  flex: 1 1 auto;
  min-width: 0;
  font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace;
  color: var(--color-text-hover);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
