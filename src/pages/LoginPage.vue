<script setup lang="ts">
import { ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { Languages } from "lucide-vue-next"
import { useAuth } from "../composables/useAuth"
import { useLang } from "../composables/useLang"
import { useTranslations } from "../composables/useTranslations"

const router  = useRouter()
const authApi = useAuth()
const { t } = useTranslations()
//the same switch as the nav menu, which this screen hides: it paints the page
//and, through the cookie it writes, decides the language of the letters this
//form sends before an account exists
const { lang, toggleLang } = useLang()

const mode       = ref<"login" | "register">("login")
const name       = ref("")
const email      = ref("")
const password   = ref("")
const error      = ref("")
const loading    = ref(false)
//the server never says whether an address is taken, so neither does this screen
const sent       = ref<"" | "signup">("")

//a refused sign-in link comes back here with its reason in the query. Only these
//are shown: anything else in that parameter is a stranger's text on our own screen.
//Kept as a key and translated in the template: this page renders before the
//dictionary has arrived, and t() called here would freeze the raw key
const LINK_ERRORS: Record<string, string> = {
  INVALID_TOKEN:            "invalidOrExpiredToken",
  EXPIRED_TOKEN:            "invalidOrExpiredToken",
}

const errorKey  = ref("")
const linkError = useRoute().query.error
if (typeof linkError === "string" && linkError) {
  const key = LINK_ERRORS[linkError]
  if (!key) console.warn(`[login] unknown sign-in link error: ${linkError}`)
  errorKey.value = key ?? "unexpectedError"
}

async function submit() {
  error.value   = ""
  loading.value = true
  try {
    if (mode.value === "login") {
      await authApi.signIn(email.value, password.value)
      router.push("/")
    } else {
      await authApi.signUp(name.value, email.value, password.value)
      sent.value = "signup"
    }
  } catch (e: any) {
    error.value = e?.message ?? t("unexpectedError")
  } finally {
    loading.value = false
  }
}

//THE GOOGLE BUTTON AND THE SIGN-IN LINK USED TO SIT HERE. auth.ts declares
//neither a social provider nor the magic-link plugin any more: this site has one
//account, created once with an address and a password. Both controls answered
//with an error on click, which is worse than not offering them.

function toggleMode() {
  mode.value     = mode.value === "login" ? "register" : "login"
  error.value    = ""
  errorKey.value = ""
  sent.value     = ""
}

function backToSignIn() {
  mode.value     = "login"
  error.value    = ""
  errorKey.value = ""
  sent.value     = ""
}
</script>

<template>
  <div class="vsui-auth-page">
    <div class="vsui-auth-card">
      <div class="vsui-auth-card__topline" />

      <div class="login-head">
        <h1 class="vsui-auth-card__title">
          {{ sent ? t('signupSentTitle')
            : mode === "login" ? t('signIn') : t('createAccount') }}
        </h1>

        <!--the label names the target, not the state: what the click does-->
        <button
          type="button"
          class="login-lang"
          :aria-label="t('loginLanguageAction')"
          :title="t('loginLanguageAction')"
          @click="toggleLang()"
        >
          <Languages :size="14" aria-hidden="true" />
          <span>{{ lang === 'fr' ? 'EN' : 'FR' }}</span>
        </button>
      </div>

      <template v-if="sent">
        <p class="vsui-auth-card__message">
          {{ t('signupSent') }}
        </p>
        <button type="button" class="vsui-auth-card__submit" @click="backToSignIn">
          {{ t('signIn') }}
        </button>
      </template>

      <template v-else>
        <form class="vsui-auth-card__form" @submit.prevent="submit">

          <div v-if="mode === 'register'" class="vsui-auth-card__field">
            <label for="auth-name" class="vsui-auth-card__label">{{ t('name') }}</label>
            <input
              id="auth-name"
              v-model="name"
              type="text"
              name="name"
              :placeholder="t('name')"
              required
              autocomplete="name"
              class="vsui-auth-card__input"
            />
          </div>

          <div class="vsui-auth-card__field">
            <label for="auth-email" class="vsui-auth-card__label">{{ t('email') }}</label>
            <input
              id="auth-email"
              v-model="email"
              type="email"
              name="email"
              :placeholder="t('email')"
              required
              autocomplete="email"
              autocapitalize="none"
              spellcheck="false"
              class="vsui-auth-card__input"
            />
          </div>

          <div class="vsui-auth-card__field">
            <label for="auth-password" class="vsui-auth-card__label">{{ t('password') }}</label>
            <input
              id="auth-password"
              v-model="password"
              type="password"
              name="password"
              :placeholder="t('password')"
              required
              minlength="8"
              :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
              class="vsui-auth-card__input"
            />
          </div>

          <p v-if="error || errorKey" class="vsui-auth-card__error" role="alert">{{ error || t(errorKey) }}</p>

          <button type="submit" :disabled="loading" class="vsui-auth-card__submit">
            {{ loading ? "..." : mode === "login" ? t('signIn') : t('register') }}
          </button>

          <RouterLink v-if="mode === 'login'" to="/forgot-password" class="vsui-auth-card__forgot">
            {{ t('forgotPassword') }}
          </RouterLink>
        </form>

        <p class="vsui-auth-card__switch">
          <button type="button" @click="toggleMode">
            {{ mode === "login" ? t('noAccount') : t('haveAccount') }}
          </button>
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped>
/*a secondary setting, so it stands on the title line and out of the form's column*/
.login-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--vsui-space-lg);
  margin-bottom: var(--vsui-space-2xl);
}

.login-head .vsui-auth-card__title {
  margin-bottom: 0;
}

.login-lang {
  display: inline-flex;
  align-items: center;
  gap: var(--vsui-space-xs);
  height: var(--vsui-control-sm);
  padding: 0 var(--vsui-space-sm);
  background: none;
  border: var(--vsui-hairline) solid var(--border);
  border-radius: var(--vsui-radius);
  color: var(--text-muted);
  font-family: inherit;
  font-size: var(--vsui-text-xs);
  font-weight: 600;
  cursor: pointer;
  transition: color var(--vsui-transition-fast), background var(--vsui-transition-fast);
}

.login-lang:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}
</style>
