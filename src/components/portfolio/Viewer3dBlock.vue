<script setup lang="ts">
import { computed } from "vue"
import { usePortfolio } from "../../composables/usePortfolio"
import ThreeViewer, { type ViewerSettings } from "./ThreeViewer.vue"

//Tiny resolver-renderer for a viewer3d detail-page block. Takes the
//block's content ({ model3dId, desktopView, mobileView }), looks up
//the model in the portfolio cache, applies the chosen view as
//startView, and renders ThreeViewer. Renders nothing if no model is
//picked or the id is unresolved.

const props = defineProps<{
  content: { model3dId: number | null; desktopView: string; mobileView: string }
  mobile?: boolean
}>()

const { data } = usePortfolio()

const resolved = computed(() => {
  const c = props.content
  if (!c.model3dId) return null
  const model = data.value?.models.find((m) => m.id === c.model3dId)
  if (!model || !model.glbUrl) return null
  const wantedName = props.mobile ? (c.mobileView || c.desktopView) : c.desktopView
  const view = wantedName ? model.views.find((v) => v.name === wantedName) : null
  const base = (model.viewerSettings ?? {}) as ViewerSettings
  const settings: ViewerSettings = view
    ? { ...base, startView: { pos: view.position, target: view.target } }
    : base
  return { glbUrl: model.glbUrl, settings }
})
</script>

<template>
  <ThreeViewer
    v-if="resolved"
    :glbUrl="resolved.glbUrl"
    :settings="resolved.settings"
  />
</template>
