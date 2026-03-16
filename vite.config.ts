import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'

// Plugin to print current config name during development
const printConfigPlugin = () => ({
  configResolved(config: { command: string }) {
    if (config.command === 'serve') {
      const configName = process.env.VITE_CONFIG_NAME
      if (configName) {
        const configFile = `config.${configName}.json`
        // eslint-disable-next-line no-console
        console.log(`\n🔧 Using config: ${configFile}\n`)
      } else {
        // eslint-disable-next-line no-console
        console.log(`\n🔧 Using config: config.json\n`)
      }
    }
  },
  name: 'print-config',
})

// https://vitejs.dev/config/
export default defineConfig({
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
      },
    },
  },
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        icon: true,
      },
    }),
    printConfigPlugin(),
  ],
  server: {
    port: 4000,
  },
})
