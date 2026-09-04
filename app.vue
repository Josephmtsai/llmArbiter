<script setup lang="ts">
const { theme, init } = useTheme()

// Restored here rather than in a layout: layouts/auth.vue never called init(),
// so /login kept whatever the head binding said and ignored the saved theme.
// app.vue is the one component every route mounts under. onMounted (not setup)
// keeps the client's first render identical to the SSR output, so the theme
// toggle in AppTopbar does not trip a hydration mismatch.
onMounted(init)

// unhead owns the data-theme attribute. Binding the ref here (rather than a
// constant) is what makes the restored theme survive: any head patch re-applies
// the ref's current value instead of clobbering it back to 'dark'.
useHead({
  htmlAttrs: { 'data-theme': theme },
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
