<script setup lang="ts">
//STAT ICON - tiny SVG glyphs for the four 3D mesh primitives we display
//next to a project: a vertex (point), an edge (segment with endpoints),
//a face (filled quad polygon), and a triangle (filled triangle). Drawn
//with currentColor so they pick up the surrounding text color, and
//rendered inside a fixed-size square BADGE container in the parent rule
//while the glyph itself stays compact in the middle. Used by both
//MainProject and ProjectGallery for a consistent visual language.

defineProps<{
  kind:  "vertices" | "edges" | "faces" | "triangles"
  size?: number
}>()
</script>

<template>
  <svg
    :width="size ?? 12"
    :height="size ?? 12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="stat-icon"
  >
    <template v-if="kind === 'vertices'">
      <!--single point - a small filled dot in the middle of the box-->
      <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="kind === 'edges'">
      <!--segment - line between two endpoints (the verts at each end)-->
      <line x1="5" y1="19" x2="19" y2="5" />
      <circle cx="5"  cy="19" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="19" cy="5"  r="2.2" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="kind === 'faces'">
      <!--face - filled quad poly: a generic n-gon surface in a mesh-->
      <polygon points="4,8 14,4 20,14 10,20" fill="currentColor" fill-opacity="0.2" />
      <polygon points="4,8 14,4 20,14 10,20" />
    </template>
    <template v-else>
      <!--triangle - the simplest closed face, distinct from generic face-->
      <polygon points="12,4 21,20 3,20" fill="currentColor" fill-opacity="0.2" />
      <polygon points="12,4 21,20 3,20" />
    </template>
  </svg>
</template>

<style scoped>
.stat-icon { display: inline-block; flex-shrink: 0; }
</style>
