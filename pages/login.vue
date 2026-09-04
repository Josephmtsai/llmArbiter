<script setup lang="ts">
definePageMeta({ layout: 'auth', middleware: [] })

const authStore = useAuthStore()
const password = ref('')

async function submit() {
  const ok = await authStore.login(password.value)
  if (ok) await navigateTo('/')
}
</script>

<template>
  <div class="arb-login">
    <div class="arb-login__glint" />
    <div class="arb-login__card">
      <div class="arb-login__brand">
        <div class="arb-login__logo">
          <span class="arb-login__logo-mark">A</span>
          <div class="arb-login__logo-dot" />
        </div>
        <span class="arb-login__wordmark">Arbiter</span>
      </div>

      <div class="arb-login__body">
        <p class="arb-login__desc">
          CI/CD intelligence dashboard. Enter your access password to continue.
        </p>

        <div v-if="authStore.error" class="arb-login__error">
          {{ authStore.error }}
        </div>

        <form class="arb-login__form" @submit.prevent="submit">
          <UiField label="Password">
            <UiInput
              v-model="password"
              type="password"
              placeholder="Enter password"
              autocomplete="current-password"
            />
          </UiField>
          <UiButton
            type="submit"
            variant="primary"
            :loading="authStore.loading"
            style="width: 100%"
          >
            Sign in
          </UiButton>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.arb-login {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  position: relative;
}
.arb-login__glint {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--glint);
  pointer-events: none;
}
.arb-login__card {
  width: 100%;
  max-width: 380px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}
.arb-login__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border-subtle);
}
.arb-login__logo {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--bg-2);
  border: 1px solid var(--border-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
}
.arb-login__logo-mark {
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 600;
  color: var(--fg-0);
}
.arb-login__logo-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--accent);
}
.arb-login__wordmark {
  font-weight: 600;
  font-size: 16px;
  letter-spacing: -0.02em;
  color: var(--fg-0);
}
.arb-login__body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.arb-login__desc {
  font-size: 13px;
  color: var(--fg-3);
  margin: 0;
  line-height: 1.5;
}
.arb-login__error {
  padding: 10px 12px;
  border-radius: var(--r-sm);
  background: var(--bg-tint-danger);
  border: 1px solid rgba(248, 113, 113, 0.2);
  font-size: 13px;
  color: var(--action-notify);
}
.arb-login__form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
</style>
