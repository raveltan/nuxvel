import type { StorybookConfig } from '@storybook-vue/nuxt'
import { nuxvelStories } from '@nuxvel/nuxt/storybook'

const config: StorybookConfig = {
  stories: ['../app/**/*.stories.ts', nuxvelStories()],
  framework: { name: '@storybook-vue/nuxt', options: { docgen: 'vue-component-meta' } },
  addons: ['@storybook/addon-vitest', '@storybook/addon-a11y'],
  staticDirs: ['./public'],
}

export default config
