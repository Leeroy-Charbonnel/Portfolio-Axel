<script setup lang="ts">
import type { Bilingual } from "../../../../types/portfolio"

//SHARED bilingual field - one label, FR + EN inputs (or textareas when
//multiline). Mutates the bound object directly and emits "dirty" so the
//parent editor doesn't repeat the FR/EN plumbing for every field.

const props = defineProps<{
  label:      string
  value:      Bilingual
  multiline?: boolean
  rows?:      number
  //markdown fields render in monospace so the source reads as source
  mono?:      boolean
}>()

const emit = defineEmits<{ (e: "dirty"): void }>()

function set(lang: "fr" | "en", v: string) {
  props.value[lang] = v
  emit("dirty")
}
</script>

<template>
  <div class="dp-bilingual">
    <span class="dp-label">{{ label }}</span>
    <div class="dp-bilingual__pair">
      <label class="dp-bilingual__col">
        <span class="dp-lang-tag">FR</span>
        <textarea
          v-if="multiline"
          class="dp-input"
          :class="{ 'dp-input--mono': mono }"
          :rows="rows ?? 4"
          :value="value.fr"
          @input="set('fr', ($event.target as HTMLTextAreaElement).value)"
        ></textarea>
        <input
          v-else
          type="text"
          class="dp-input"
          :value="value.fr"
          @input="set('fr', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="dp-bilingual__col">
        <span class="dp-lang-tag">EN</span>
        <textarea
          v-if="multiline"
          class="dp-input"
          :class="{ 'dp-input--mono': mono }"
          :rows="rows ?? 4"
          :value="value.en"
          @input="set('en', ($event.target as HTMLTextAreaElement).value)"
        ></textarea>
        <input
          v-else
          type="text"
          class="dp-input"
          :value="value.en"
          @input="set('en', ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>
  </div>
</template>
