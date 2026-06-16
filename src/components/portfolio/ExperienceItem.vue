<script setup lang="ts">
import { computed } from "vue"
import { Plus, X } from "lucide-vue-next"
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

const periodParts = computed(() => props.experience.period[lang.value].split("-"))

//ROLE/PERIOD/COMPANY/LOCATION ---
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

//SUMMARY (paragraph) ---
async function onSummarySave(newVal: string) {
  await updateExperience(props.experience.id, {
    summary: { ...props.experience.summary, [lang.value]: newVal },
  })
}

//BULLETS - each entry edited individually with its own remove button, plus
//an explicit "add bullet" trigger. No more newline-splitting hack.
async function onBulletSave(idx: number, newVal: string) {
  const bullets = [...(props.experience.description[lang.value] ?? [])]
  bullets[idx] = newVal
  await updateExperience(props.experience.id, {
    description: { ...props.experience.description, [lang.value]: bullets },
  })
}

async function addBullet() {
  const bullets = [...(props.experience.description[lang.value] ?? []), ""]
  await updateExperience(props.experience.id, {
    description: { ...props.experience.description, [lang.value]: bullets },
  })
}

async function removeBullet(idx: number) {
  const bullets = (props.experience.description[lang.value] ?? []).filter((_, i) => i !== idx)
  await updateExperience(props.experience.id, {
    description: { ...props.experience.description, [lang.value]: bullets },
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

    <!--PERIOD column: fixed width so view-mode (two-line dates) and edit-mode
    (single editable line) stay vertically aligned with the content column.-->
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
        <EditableText tag="span" :value="experience.company" placeholder="Company" @save="onCompanySave" />
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

      <!--SUMMARY paragraph - optional, sits between header and bullet list-->
      <EditableText
        v-if="editMode || experience.summary[lang]"
        tag="p"
        class="experience-item__summary"
        :multiline="true"
        :value="experience.summary[lang]"
        placeholder="Optional summary paragraph..."
        @save="onSummarySave"
      />

      <!--BULLET LIST - real <ul> with one editable item per bullet plus +/x controls-->
      <ul v-if="(experience.description[lang]?.length ?? 0) > 0 || editMode" class="experience-item__bullets">
        <li
          v-for="(bullet, idx) in experience.description[lang]"
          :key="idx"
          class="experience-item__bullet"
        >
          <EditableText
            tag="span"
            class="experience-item__bullet-text"
            :value="bullet"
            placeholder="Highlight..."
            @save="(v) => onBulletSave(idx, v)"
          />
          <button
            v-if="editMode"
            type="button"
            class="experience-item__bullet-remove"
            aria-label="Remove bullet"
            @click="removeBullet(idx)"
          >
            <X :size="12" />
          </button>
        </li>

        <li v-if="editMode" class="experience-item__bullet experience-item__bullet--add">
          <button type="button" class="experience-item__bullet-add" @click="addBullet">
            <Plus :size="14" />
            <span>Add bullet</span>
          </button>
        </li>
      </ul>
    </div>
  </AnimatedReveal>
</template>

<style scoped>
.experience-item {
  position: relative;
  display: grid;
  grid-template-columns: var(--spacing-5xl) 1fr;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-2xl);
  padding-right: var(--spacing-2xl);
  align-items: start;
}

.experience-item__period {
  font-weight: var(--font-weight-bold);
  text-align: right;
  padding-right: var(--spacing-md);
  /*lock width to match the grid track so view/edit modes line up identically*/
  min-width: 0;
}

.experience-item__content {
  position: relative;
  padding-left: var(--spacing-xl);
  border-left: var(--border-width-sm) solid var(--color-gray-medium);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.experience-item__title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-normal);
}

.experience-item__company {
  font-size: var(--font-size-md);
  color: var(--color-text-secondary);
}

.experience-item__location-wrap { margin-left: var(--spacing-xxs); }
.experience-item__location      { color: var(--color-text-tertiary); }

.experience-item__summary {
  line-height: 1.6;
  color: var(--color-text);
}

/*BULLET LIST - real ul, each li is a row with the bullet text + a remove button.
The leading dash is a pseudo-element so it scales naturally with font size and
doesn't take a separate column when in edit mode.*/
.experience-item__bullets {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.experience-item__bullet {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: var(--spacing-sm);
  padding-left: var(--spacing-lg);
  line-height: 1.6;
}

.experience-item__bullet::before {
  content: "";
  position: absolute;
  top: 0.7em;
  left: 0;
  width: var(--spacing-sm);
  height: var(--border-width-md);
  background-color: hsl(var(--foreground) / 0.5);
}

.experience-item__bullet--add::before { display: none; }

.experience-item__bullet-text {
  flex: 1;
  min-width: 0;
}

.experience-item__bullet-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width:  var(--spacing-lg);
  height: var(--spacing-lg);
  color: var(--color-text-tertiary);
  background-color: transparent;
  cursor: pointer;
  flex-shrink: 0;
  transition: color 0.15s ease, background-color 0.15s ease;
}

.experience-item__bullet-remove:hover {
  color: var(--color-text-hover);
  background-color: hsl(var(--destructive) / 0.6);
}

.experience-item__bullet-add {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  background-color: transparent;
  border: var(--border-width-sm) dashed var(--color-gray-medium);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.experience-item__bullet-add:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

@media (max-width: 768px) {
  .experience-item {
    grid-template-columns: 1fr;
    padding-right: var(--spacing-xl);
  }
  .experience-item__period {
    text-align: left;
    padding-right: 0;
    display: flex;
    gap: var(--spacing-xs);
  }
  .experience-item__period > div:first-child + div::before {
    content: "—";
    margin-right: var(--spacing-xs);
  }
  .experience-item__content {
    padding-left: var(--spacing-md);
  }
}
</style>
