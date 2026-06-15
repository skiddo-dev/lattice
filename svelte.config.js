import adapter from '@sveltejs/adapter-node'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Ship .br/.gz alongside the bundle so the node server serves precompressed
    // assets without compressing per request.
    adapter: adapter({ out: 'build', precompress: true }),
    alias: {
      $lib: 'src/lib'
    }
  }
}

export default config
