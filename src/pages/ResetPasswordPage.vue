<script setup lang="ts">
import { ref, computed, onMounted } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useAuth } from "../composables/useAuth"
import { useTranslations } from "../composables/useTranslations"

const route  = useRoute()
const router = useRouter()
const authApi = useAuth()
const { t } = useTranslations()

const password        = ref("")
const confirmPassword = ref("")
const error           = ref("")
const success         = ref(false)
const loading         = ref(false)
const token           = ref("")
//translated in the template, not here: this page renders before the dictionary
//has arrived, and t() called at mount froze the raw key on the screen
const tokenMissing    = ref(false)

//the link in the letter is built from the token as a query key (auth.ts,
//sendResetPassword), which is what this reads
onMounted(() => {
  const received = route.query.token
  if (typeof received === "string" && received) token.value = received
  else tokenMissing.value = true
})

const canSubmit = computed(() =>
  token.value && password.value.length >= 8 && password.value === confirmPassword.value
)

async function submit() {
  error.value = ""
  if (password.value !== confirmPassword.value) {
    error.value = t("passwordsDontMatch")
    return
  }
  loading.value = true
  try {
    await authApi.resetPassword(token.value, password.value)
    success.value = true
    setTimeout(() => router.push("/login"), 2000)
  } catch (e: any) {
    error.value = e?.message ?? t("invalidOrExpiredToken")
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="vsui-auth-page">
    <div class="vsui-auth-card">
      <div class="vsui-auth-card__topline" />
      <h1 class="vsui-auth-card__title">{{ t('resetPasswordTitle') }}</h1>

      <template v-if="success">
        <p class="vsui-auth-card__message">{{ t('passwordResetSuccess') }}</p>
      </template>

      <template v-else>
        <form class="vsui-auth-card__form" @submit.prevent="submit">
          <div class="vsui-auth-card__field">
            <label class="vsui-auth-card__label">{{ t('newPassword') }}</label>
            <input
              v-model="password"
              type="password"
              required
              minlength="8"
              autocomplete="new-password"
              class="vsui-auth-card__input"
            />
          </div>

          <div class="vsui-auth-card__field">
            <label class="vsui-auth-card__label">{{ t('confirmPassword') }}</label>
            <input
              v-model="confirmPassword"
              type="password"
              required
              minlength="8"
              autocomplete="new-password"
              class="vsui-auth-card__input"
            />
          </div>

          <p v-if="error || tokenMissing" class="vsui-auth-card__error" role="alert">{{ error || t('invalidOrExpiredToken') }}</p>

          <button type="submit" :disabled="loading || !canSubmit" class="vsui-auth-card__submit">
            {{ loading ? "..." : t('save') }}
          </button>
        </form>
      </template>
    </div>
  </div>
</template>
