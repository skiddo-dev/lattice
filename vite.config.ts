import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    // Distinct from Blueprint's 8501 so both can run side by side.
    port: Number(process.env.PORT) || 8770
  },
  // Unit tests run in Node and reach server-only modules ($lib/server/*), so the
  // SvelteKit plugin above is needed to resolve $lib and the $env/* virtuals.
  // Every config key is optional at runtime, so tests need no seeded env — the
  // backends simply report "not configured" when a key is absent.
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}']
  }
})
