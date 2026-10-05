import type { Preview } from '@storybook-vue/nuxt'
import { setupWorker } from 'msw/browser'
import { mswLoader } from 'msw-storybook-addon/csf3'
import { nuxvelPreview } from '@nuxvel/nuxt/storybook/preview'

async function startWorker() {
  const worker = setupWorker()
  await worker.start({ quiet: true, onUnhandledRequest: 'bypass' })
  return worker
}

const preview: Preview = { ...nuxvelPreview, loaders: [mswLoader(startWorker)] }

export default preview
