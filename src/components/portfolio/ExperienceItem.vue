<script setup lang="ts">
import { computed } from "vue"
import { useLanguage } from "../../composables/useLanguage"
import { useAdmin } from "../../composables/useAdmin"
import { usePortfolio } from "../../composables/usePortfolio"
import AnimatedReveal from "./AnimatedReveal.vue"
import EditableText from "./EditableText.vue"
import RemoveButton from "./RemoveButton.vue"
import type { ExperienceDto } from "../../types/portfolio"

const props = defineProps<{ experience: ExperienceDto; index: number }>()

const { lang } = useLanguage()
const { editMode } = useAdmin()
const { updateExperience, deleteExperience } = usePortfolio()

//view mode parses the period string ("12.2022-04.2023") into two halves;
//edit mode shows a single editable field with the full string so the admin
//doesn't have to mentally split on the dash
const periodParts = computed(() => props.experience.period[lang.value].split("-"))

async function onPeriodSave(newVal: string) {
  await updateExperience(props.experience.id, {
    period: { ...props.experience.period, [lang.value]: newVal },
  })
}

async function onTitleSave(newVal: string) {
  await updateExperience(props.experience.id, {
    title: { ...props.experience.title, [lang.value]: newVal },
  })
}

async function onCompanySave(newVal: string)  { await updateExperience(props.experience.id, { company: newVal }) }
async function onLocationSave(newVal: string) { await updateExperience(props.experience.id, { location: newVal }) }

//description list is stored as { en: string[]; fr: string[] }. In edit mode we
//render it as a multi-line textarea where each non-empty line becomes one bullet.
const descriptionJoined = computed(() => props.experience.description[lang.value].join("\n"))

async function onDescriptionSave(newVal: string) {
  const lines = newVal.split("\n").map((s) => s.trim()).filter(Boolean)
  await updateExperience(props.experience.id, {
    description: { ...props.experience.description, [lang.value]: lines },
  })
}
</script>

<template>
  <AnimatedReveal
    direction="left"
    :distance="50"
    :duration="0.6"
    :delay="index * 0.2"
    :threshold="0.1"
    :initial-opacity="0"
    :final-opacity="1"
    class="experience-item"
  >
    <RemoveButton v-if="editMode" label="Delete experience" @click="deleteExperience(experience.id)" />

    <div class="experience-item__period">
      <template v-if="!editMode">
        <div>{{ periodParts[0] }}</div>
        <div v-if="periodParts[1]">{{ periodParts[1] }}</div>
      </template>
      <EditableText
        v-else
        tag="div"
        :value="experience.period[lang]"
        placeholder="YYYY-YYYY"
        @save="onPeriodSave"
      />
    </div>

    <div class="experience-item__content">
      <EditableText
        tag="h3"
        class="experience-item__title"
        :value="experience.title[lang]"
        placeholder="Role"
        @save="onTitleSave"
      />

      <div class="experience-item__company">
        <EditableText
          tag="span"
          :value="experience.company"
          placeholder="Company"
          @save="onCompanySave"
        />
        <span class="experience-item__location-wrap">
          (<EditableText
            tag="span"
            class="experience-item__location"
            :value="experience.location"
            placeholder="City"
            @save="onLocationSave"
          />)
        </span>
      </div>

      <ul v-if="!editMode" class="experience-item__description-list">
        <li
          v-for="(line, idx) in experience.description[lang]"
          :key="idx"
          class="experience-item__description"
        >{{ line }}</li>
      </ul>

      <!--Edit mode: one line per bullet, save splits on newlines. The textarea
      borrows the same typography as the rendered list so the admin sees roughly
      the same line layout.-->
      <EditableText
        v-else
        tag="div"
        class="experience-item__description-edit"
        :multiline="true"
        :value="descriptionJoined"
        placeholder="One line per bullet..."
        @save="onDescriptionSave"
      />
    </div>
  </AnimatedReveal>
</template>

<style scoped>
.experience-item {
  position: relative;
  display: flex;
  margin-bottom: var(--spacing-2xl);
  padding-right: var(--spacing-2xl);
}

.experience-item__period {
  font-weight: var(--font-weight-bold);
  padding-right: var(--spacing-md);
  text-align: right;
  flex-shrink: 0;
  min-width: var(--spacing-4xl);
}

.experience-item__content {
  flex: 1;
  padding-left: var(--spacing-xl);
  position: relative;
}

.experience-item__content::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: var(--border-width-sm);
  height: 100%;
  background: linear-gradient(to bottom, var(--color-background-gray-300), transparent);
}

.experience-item__title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-normal);
  margin-bottom: var(--spacing-sm);
}

.experience-item__company {
  font-size: var(--font-size-md);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-md);
}

.experience-item__location-wrap { margin-left: var(--spacing-xxs); }
.experience-item__location      { color: var(--color-text-tertiary); }

.experience-item__description-list { list-style: none; padding: 0; }

.experience-item__description {
  margin-bottom: var(--spacing-xs);
  position: relative;
  padding-left: var(--spacing-lg);
  line-height: 1.6;
}

.experience-item__description::before {
  content: "";
  position: absolute;
  top: var(--spacing-sm);
  left: 0;
  width: var(--spacing-sm);
  height: var(--border-width-md);
  background-color: hsl(var(--foreground) / 0.5);
}

.experience-item__description-edit {
  white-space: pre-wrap;
  line-height: 1.6;
  padding: var(--spacing-sm);
  background-color: hsl(var(--background) / 0.5);
  border-left: var(--border-width-md) solid var(--color-gray-medium);
}

@media (max-width: 768px) {
  .experience-item { flex-direction: column; padding-right: var(--spacing-xl); }
  .experience-item__period {
    width: 100%;
    text-align: left;
    padding-right: 0;
    padding-left: var(--spacing-lg);
    margin-bottom: var(--spacing-md);
    display: flex;
  }
  .experience-item__period > div:first-child::after {
    content: "-";
    margin: 0 var(--spacing-xs);
  }
  .experience-item__content { padding-left: var(--spacing-lg); }
}
</style>
