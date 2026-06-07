export default defineNuxtConfig({
  devtools: { enabled: true },

  modules: ['@nuxtjs/tailwindcss', '@pinia/nuxt', 'nuxt-auth-utils'],

  runtimeConfig: {
    authPassword: '',
    apiBaseUrl: 'https://artbiter-production.up.railway.app',
    apiKey: '',
  },

  app: {
    head: {
      htmlAttrs: { 'data-theme': 'dark' },
      link: [
        {
          rel: 'preconnect',
          href: 'https://fonts.googleapis.com',
        },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossorigin: 'anonymous',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap',
        },
      ],
    },
  },

  css: ['~/assets/css/design-tokens.css'],

  typescript: { strict: true },
})
