// Injected into <head> by nuxt.config.ts and therefore run before Nuxt's entry
// bundle, before any module plugin, and before first paint. Two jobs, in order:
//
// 1. When the browser blocks site data, the `localStorage` getter itself throws
//    a SecurityError. `nuxt-auth-utils` calls localStorage.getItem() unguarded
//    inside its client plugin, which crashes app initialisation and renders
//    Nuxt's 500 page. Nuxt registers module plugins ahead of app plugins, so a
//    plugins/ file cannot get in front of it - this <head> script can. It swaps
//    in an in-memory store ONLY when the real one is unusable, so nothing is
//    persisted and the browser's privacy setting is still honoured; the page
//    just renders instead of dying.
// 2. Restore the saved theme before first paint so a stored 'light' never
//    flashes dark.
//
// Hardcoded constant, no user input - not an XSS surface (CLAUDE.md §3).
// Kept as a string (not a function) because it is serialised into <head>; it
// lives in its own module so tests can execute the exact shipped text.
export const PRE_PAINT_SCRIPT = [
  'try{localStorage.getItem("arb-theme")}catch(e){var m={};',
  'try{Object.defineProperty(window,"localStorage",{configurable:true,value:{',
  'getItem:function(k){return k in m?m[k]:null},',
  'setItem:function(k,v){m[k]=String(v)},',
  'removeItem:function(k){delete m[k]},',
  'clear:function(){m={}},',
  'key:function(i){return Object.keys(m)[i]||null},',
  'get length(){return Object.keys(m).length}}})}catch(e2){}}',
  'try{var t=localStorage.getItem("arb-theme");',
  'if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e3){}',
].join('')
