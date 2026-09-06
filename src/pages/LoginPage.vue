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
const emailField = ref<HTMLInputElement>()
const password   = ref("")
const error      = ref("")
const loading    = ref(false)
//the server never says whether an address is taken, so neither does this screen
const sent       = ref<"" | "signup" | "link">("")

//a refused sign-in link comes back here with its reason in the query. Only these
//are shown: anything else in that parameter is a stranger's text on our own screen.
//Kept as a key and translated in the template: this page renders before the
//dictionary has arrived, and t() called here would freeze the raw key
const LINK_ERRORS: Record<string, string> = {
  INVALID_TOKEN:            "invalidOrExpiredToken",
  EXPIRED_TOKEN:            "invalidOrExpiredToken",
  new_user_signup_disabled: "magicLinkNoAccount",
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

//outside the form, so the browser checks the one field this needs rather than the password too
async function sendLink() {
  if (!emailField.value?.reportValidity()) return
  error.value   = ""
  loading.value = true
  try {
    await authApi.sendSignInLink(email.value)
    sent.value = "link"
  } catch (e: any) {
    error.value = e?.message ?? t("unexpectedError")
  } finally {
    loading.value = false
  }
}

async function googleSignIn() {
  error.value = ""
  loading.value = true
  try {
    await authApi.signInWithGoogle()
  } catch (e: any) {
    error.value = e?.message ?? t("unexpectedError")
    loading.value = false
  }
}

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
          {{ sent === "link" ? t('magicLinkSentTitle')
            : sent ? t('signupSentTitle')
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
          {{ sent === "link" ? t('magicLinkSent') : t('signupSent') }}
        </p>
        <button type="button" class="vsui-auth-card__submit" @click="backToSignIn">
          {{ t('signIn') }}
        </button>
      </template>

      <template v-else>
        <button
          type="button"
          class="vsui-auth-card__google"
          :disabled="loading"
          @click="googleSignIn"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.61z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335"/>
          </svg>
          <span>{{ t('continueWithGoogle') }}</span>
        </button>

        <div class="vsui-auth-card__divider">
          <span>{{ t('or') }}</span>
        </div>

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
              ref="emailField"
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

          <!--type=button: inside the form it would submit, and this door wants the address alone-->
          <button
            v-if="mode === 'login'"
            type="button"
            class="vsui-auth-card__forgot"
            :disabled="loading"
            @click="sendLink"
          >
            {{ t('magicLinkSend') }}
          </button>
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
