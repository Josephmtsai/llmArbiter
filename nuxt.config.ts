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
      // data-theme is not declared here: app.vue binds it to the theme ref.
      // A constant at this level competes with that binding for the same
      // attribute. The server-rendered default is still 'dark' via useState.
      script: [
        {
          // Runs before first paint so a restored 'light' theme never flashes
          // dark. Hardcoded constant, no user input - not an XSS surface
          // (CLAUDE.md §3). localStorage access itself throws when the browser
          // blocks site data, hence the try/catch.
          innerHTML:
            "try{var t=localStorage.getItem('arb-theme');" +
            "if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}",
        },
      ],
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

  css: [
    '~/assets/css/design-tokens.css',
    '~/assets/css/guide-diagrams.css',
    '@vueform/slider/themes/default.css',
    '@vuepic/vue-datepicker/dist/main.css',
  ],

  build: {
    transpile: ['@vuepic/vue-datepicker'],
  },

  typescript: { strict: true },
})
