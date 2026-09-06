<script setup lang="ts">
import { computed } from "vue"
import { useLanguage } from "../../composables/useLanguage"
import { useAdmin } from "../../composables/useAdmin"
import { usePortfolio } from "../../composables/usePortfolio"
import AnimatedReveal from "./AnimatedReveal.vue"
import EditableText from "./EditableText.vue"
import ReplaceImageButton from "./ReplaceImageButton.vue"
import type { ProfileDto } from "../../types/portfolio"

const props = defineProps<{ profile: ProfileDto }>()

const { t, lang } = useLanguage()
const { editMode } = useAdmin()
const { replaceImage, updateProfile } = usePortfolio()

//arrays editing: one line per item, save splits on newlines, joins back for view
const gamesJoined = computed(() => props.profile.interests.games.join("\n"))
const artJoined   = computed(() => props.profile.interests.art.join("\n"))

async function onAboutSave(newVal: string) {
  await updateProfile({ about: { ...props.profile.about, [lang.value]: newVal } })
}

async function onContactSave(field: "phone" | "email" | "instagram", newVal: string) {
  await updateProfile({ contact: { ...props.profile.contact, [field]: newVal } })
}

async function onInterestSave(field: "games" | "art", newVal: string) {
  const items = newVal.split("\n").map((s) => s.trim()).filter(Boolean)
  await updateProfile({ interests: { ...props.profile.interests, [field]: items } })
}

function onReplaceAvatar() {
  return replaceImage("avatar", async (_id, url) => {
    await updateProfile({ avatarUrl: url })
  })
}
</script>

<template>
  <div class="about">
    <AnimatedReveal
      direction="bottom"
      :distance="30"
      :duration="0.6"
      :initial-opacity="0"
      :final-opacity="1"
      class="about__section"
    >
      <h3 class="about__heading">{{ t("experienceAbout") }}</h3>
      <div class="about__content">
        <div v-if="profile.avatarUrl || editMode" class="about__avatar">
          <component
            :is="editMode ? 'div' : 'a'"
            :href="editMode ? undefined : 'https://sketchfab.com/Obambulatesart'"
            target="_blank"
            rel="noopener noreferrer"
            class="about__avatar-link"
          >
            <img
              v-if="profile.avatarUrl"
              :src="profile.avatarUrl"
              alt="Profile avatar"
              width="100"
              height="100"
            />
            <div v-else class="about__avatar-placeholder">No avatar</div>
            <ReplaceImageButton v-if="editMode" @click="onReplaceAvatar" />
          </component>
        </div>

        <EditableText
          tag="p"
          class="about__text"
          :multiline="true"
          :value="profile.about[lang]"
          placeholder="Write a short bio..."
          @save="onAboutSave"
        />
      </div>
    </AnimatedReveal>

    <div class="about__columns">
      <AnimatedReveal
        direction="bottom"
        :distance="30"
        :duration="0.6"
        :delay="0.2"
        :initial-opacity="0"
        :final-opacity="1"
      >
        <h3 class="about__heading">{{ t("experienceContact") }}</h3>
        <ul class="about__contact-list">
          <li class="about__contact-item">
            <span class="about__contact-label">{{ t("experiencePhone") }}</span>
            <EditableText
              tag="span"
              :value="profile.contact.phone"
              placeholder="+33 …"
              @save="(v) => onContactSave('phone', v)"
            />
          </li>
          <li class="about__contact-item">
            <span class="about__contact-label">{{ t("experienceMail") }}</span>
            <EditableText
              tag="span"
              :value="profile.contact.email"
              placeholder="you@example.com"
              @save="(v) => onContactSave('email', v)"
            />
          </li>
          <li class="about__contact-item">
            <span class="about__contact-label">{{ t("experienceInsta") }}</span>
            <EditableText
              tag="span"
              :value="profile.contact.instagram"
              placeholder="@handle"
              @save="(v) => onContactSave('instagram', v)"
            />
          </li>
        </ul>
      </AnimatedReveal>

      <AnimatedReveal
        direction="bottom"
        :distance="30"
        :duration="0.6"
        :delay="0.3"
        :initial-opacity="0"
        :final-opacity="1"
      >
        <h3 class="about__heading">{{ t("experienceInterest") }}</h3>
        <div class="about__interests-columns">
          <div>
            <h4 class="about__interest-title">{{ t("experienceGames") }}</h4>
            <ul v-if="!editMode" class="about__interest-list">
              <li v-for="(game, idx) in profile.interests.games" :key="idx">{{ game }}</li>
            </ul>
            <EditableText
              v-else
              tag="div"
              class="about__interest-edit"
              :multiline="true"
              :value="gamesJoined"
              placeholder="One game per line..."
              @save="(v) => onInterestSave('games', v)"
            />
          </div>
          <div>
            <h4 class="about__interest-title">{{ t("experienceArt") }}</h4>
            <ul v-if="!editMode" class="about__interest-list">
              <li v-for="(art, idx) in profile.interests.art" :key="idx">{{ art }}</li>
            </ul>
            <EditableText
              v-else
              tag="div"
              class="about__interest-edit"
              :multiline="true"
              :value="artJoined"
              placeholder="One art form per line..."
              @save="(v) => onInterestSave('art', v)"
            />
          </div>
        </div>
      </AnimatedReveal>
    </div>
  </div>
</template>

<style scoped>
.about {
  background-color: hsl(var(--card) / 0.7);
  border: var(--border-width-sm) solid hsl(var(--foreground) / 0.1);
  padding: var(--spacing-xl);
  margin-top: var(--spacing-2xl);
}

.about__section { margin-bottom: var(--spacing-xl); }

.about__heading {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-normal);
  margin-bottom: var(--font-size-lg);
  text-transform: uppercase;
  position: relative;
  display: inline-block;
}

.about__heading::after {
  content: "";
  position: absolute;
  width: 40%;
  height: var(--border-width-md);
  background-color: var(--color-border-primary);
  bottom: calc(-1 * var(--spacing-xs));
  left: 0;
}

.about__content {
  display: flex;
  align-items: flex-start;
  gap: var(--font-size-lg);
}

.about__avatar {
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
  aspect-ratio: 1;
  width: 100px;
  transition: box-shadow var(--transition-slow) ease;
}

.about__avatar-link {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
}

.about__avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.about__avatar-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background-color: var(--color-background-gray-100);
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
}

.about__avatar:hover {
  box-shadow: 0 0 0 var(--border-width-md) var(--color-border-muted);
}

.about__text { line-height: 1.8; white-space: pre-line; }

.about__columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-xl);
}

.about__contact-list,
.about__interest-list {
  list-style: none;
  padding: 0;
}

.about__contact-item {
  margin-bottom: var(--spacing-md);
  display: flex;
  flex-direction: column;
}

.about__contact-label {
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-md);
  color: var(--color-text-secondary);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
}

.about__interests-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--font-size-base);
}

.about__interest-title {
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  font-size: var(--font-size-xs);
  letter-spacing: var(--letter-spacing-normal);
  color: var(--color-text-secondary);
}

.about__interest-edit {
  white-space: pre-wrap;
  line-height: 1.6;
  padding: var(--spacing-sm);
  background-color: hsl(var(--background) / 0.5);
  border-left: var(--border-width-md) solid var(--color-gray-medium);
  font-size: var(--font-size-sm);
}

@media (max-width: 1024px) {
  .about__content {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .about__section { text-align: center; }
  .about__heading::after { left: 30%; }
}

@media (max-width: 768px) {
  .about__columns,
  .about__interests-columns { grid-template-columns: 1fr; }
  .about { padding: var(--spacing-lg); }
}
</style>
