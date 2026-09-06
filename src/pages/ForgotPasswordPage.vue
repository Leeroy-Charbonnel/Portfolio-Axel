<script setup lang="ts">
import { ref } from "vue"
import { useAuth } from "../composables/useAuth"
import { useTranslations } from "../composables/useTranslations"

const authApi = useAuth()
const { t } = useTranslations()

const email   = ref("")
const sent    = ref(false)
const error   = ref("")
const loading = ref(false)

async function submit() {
  error.value   = ""
  loading.value = true
  try {
    await authApi.requestPasswordReset(email.value)
    sent.value = true
  } catch (e: any) {
    error.value = e?.message ?? "error"
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

      <template v-if="!sent">
        <p class="vsui-auth-card__message">{{ t('resetPasswordIntro') }}</p>

        <form class="vsui-auth-card__form" @submit.prevent="submit">
          <div class="vsui-auth-card__field">
            <label class="vsui-auth-card__label">{{ t('email') }}</label>
            <input
              v-model="email"
              type="email"
              :placeholder="t('email')"
              required
              autocomplete="email"
              class="vsui-auth-card__input"
            />
          </div>

          <p v-if="error" class="vsui-auth-card__error">{{ error }}</p>

          <button type="submit" :disabled="loading" class="vsui-auth-card__submit">
            {{ loading ? "..." : t('signIn') }}
          </button>
        </form>
      </template>

      <template v-else>
        <p class="vsui-auth-card__message">{{ t('resetPasswordSent') }}</p>
        <RouterLink to="/login" class="vsui-auth-card__submit" style="display: block; text-align: center; text-decoration: none;">
          {{ t('signIn') }}
        </RouterLink>
      </template>

      <p class="vsui-auth-card__switch">
        <RouterLink to="/login" style="color: inherit; text-decoration: underline;">{{ t('back') }}</RouterLink>
      </p>
    </div>
  </div>
</template>
