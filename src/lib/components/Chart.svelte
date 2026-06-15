<script lang="ts">
  // Minimal Chart.js wrapper for Svelte 5 (lifted from Blueprint). Instantiates
  // in onMount and updates in place when `data`/`options` change. Unlike
  // svelte-chartjs it does NOT run $state.snapshot on the config, so function
  // options (tick/tooltip formatters) don't trigger `state_snapshot_uncloneable`.
  import { onMount } from 'svelte'
  import {
    Chart as ChartJS,
    registerables,
    type ChartType,
    type ChartData,
    type ChartOptions,
    type ChartConfiguration,
  } from 'chart.js'
  import { theme } from '$lib/theme.svelte'
  import { chartInk } from '$lib/theme'

  ChartJS.register(...registerables)

  let { type, data, options = {} }: {
    type: ChartType
    data: ChartData
    options?: ChartOptions
  } = $props()

  let canvas: HTMLCanvasElement
  let instance: ChartJS | undefined

  onMount(() => {
    instance = new ChartJS(canvas, { type, data, options } as ChartConfiguration)
    return () => instance?.destroy()
  })

  // Keep the chart in sync if the inputs OR the theme change. Reading
  // theme.resolved makes this effect re-run on a light/dark toggle.
  $effect(() => {
    const ink = chartInk(theme.resolved)
    ChartJS.defaults.color = ink.tick
    ChartJS.defaults.borderColor = ink.grid
    if (!instance) return
    instance.data = data
    instance.options = options
    instance.update()
  })
</script>

<canvas bind:this={canvas}></canvas>
