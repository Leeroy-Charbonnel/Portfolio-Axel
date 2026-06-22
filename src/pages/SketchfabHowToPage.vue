<script setup lang="ts">
import { useRouter } from "vue-router"
import { ArrowLeft } from "lucide-vue-next"

//STATIC HOW-TO - admin-only reference for preparing a model on Sketchfab
//before pasting its ID into a main project. Pure markdown-style content,
//no API call. Linked from the AdminGear dropdown ("Sketchfab how-to").

const router = useRouter()
function goBack() { router.push("/") }
</script>

<template>
  <div class="howto-page">
    <header class="howto-page__header">
      <button class="howto-page__back" @click="goBack">
        <ArrowLeft :size="16" />
        <span>Back</span>
      </button>
      <h1 class="howto-page__title">Sketchfab — How to prepare a model</h1>
    </header>

    <section class="howto-page__section">
      <h2>1. Upload &amp; publish</h2>
      <ol>
        <li>Open <a href="https://sketchfab.com/" target="_blank" rel="noopener noreferrer">sketchfab.com</a> and sign in.</li>
        <li>Click <strong>Upload</strong> in the top bar and drop in your .blend / .fbx / .glb / .obj.</li>
        <li>Wait for the processing pass to finish — the viewer shows the raw geometry before materials.</li>
        <li>Set the model to <strong>Public</strong> visibility. Private models can't be embedded.</li>
      </ol>
    </section>

    <section class="howto-page__section">
      <h2>2. Materials &amp; lighting in the 3D editor</h2>
      <p>
        Open <strong>3D Settings</strong> (top-right of the model page). For the wireframe toggle in this
        portfolio to behave consistently we need predictable lights and a clean base material:
      </p>
      <ul>
        <li>Set <strong>Background &gt; Color</strong> to fully transparent (drag opacity to 0). The portfolio embeds the model with <code>transparent: 1</code> so the page background shows through.</li>
        <li>Disable <strong>Post-processing</strong> effects (bloom, vignette, DOF). Wireframe lines clip awkwardly behind bloom.</li>
        <li>In <strong>Lighting</strong>: pick the <em>Studio</em> preset and set 2–3 directional lights you want to remember. Note the index and color of each — you'll mirror them in the project's <code>wireframeParameters.lightsOverwrite</code>.</li>
        <li>Find each <strong>emissive</strong> material (lamps, screens, glowing trim) and copy its material id into the project's <code>wireframeParameters.emissiveMaterialsOverwrite</code> array so wireframe mode still keeps them lit.</li>
        <li>Save the 3D settings.</li>
      </ul>
    </section>

    <section class="howto-page__section">
      <h2>3. Grab the model ID</h2>
      <p>
        From the model page URL: <code>sketchfab.com/models/<strong>{modelId}</strong></code>
        — copy the hex string after <code>/models/</code>. That's what goes into the project's
        <strong>Sketchfab model ID</strong> field (visible when editing the project in admin mode).
      </p>
    </section>

    <section class="howto-page__section">
      <h2>4. Wireframe-friendly geometry tips</h2>
      <ul>
        <li>Triangulate suspicious n-gons in your DCC before export — Sketchfab's auto-triangulation sometimes adds visible edges.</li>
        <li>Merge by distance on duplicated verts; doubles show up as bright spots in wireframe mode.</li>
        <li>Keep modifier stacks applied. Unapplied subdivision pumps the displayed vertex / edge / face counts past what you intend.</li>
        <li>Aim under ~500k triangles. Above that the embedded viewer stutters on mobile.</li>
      </ul>
    </section>

    <section class="howto-page__section">
      <h2>5. Paste into the portfolio</h2>
      <ol>
        <li>Sign in as admin and toggle <strong>Edit content</strong> from the gear menu.</li>
        <li>On the target main project, paste the model ID into the highlighted Sketchfab model ID field.</li>
        <li>Fill in vertices / edges / faces / triangles by hand — the embed does not report these back.</li>
        <li>Toggle out of edit mode. The viewer re-mounts and the wireframe button should now work.</li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.howto-page {
  max-width: 56rem;
  margin: 0 auto;
  padding: var(--spacing-3xl) var(--spacing-xl);
  color: var(--color-text);
  line-height: 1.6;
}

.howto-page__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-2xl);
  padding-bottom: var(--spacing-lg);
  border-bottom: var(--border-width-sm) solid var(--color-gray-medium);
}

.howto-page__back {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-md);
  background-color: transparent;
  border: var(--border-width-sm) solid var(--color-gray-medium);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
}

.howto-page__back:hover {
  color: var(--color-text-hover);
  border-color: var(--color-accent);
  background-color: hsl(var(--primary) / 0.08);
}

.howto-page__title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-text-hover);
}

.howto-page__section {
  margin-bottom: var(--spacing-2xl);
}

.howto-page__section h2 {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-tight);
  color: var(--color-text-hover);
  margin-bottom: var(--spacing-md);
}

.howto-page__section p,
.howto-page__section li {
  font-size: var(--font-size-base);
  color: var(--color-text);
}

.howto-page__section ol,
.howto-page__section ul {
  padding-left: var(--spacing-xl);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.howto-page__section a {
  color: var(--color-accent);
  text-decoration: underline;
}

.howto-page__section code {
  font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace;
  font-size: var(--font-size-sm);
  background-color: hsl(var(--foreground) / 0.08);
  padding: 2px var(--spacing-xs);
  color: var(--color-text-hover);
}

.howto-page__section strong { color: var(--color-text-hover); }
</style>
