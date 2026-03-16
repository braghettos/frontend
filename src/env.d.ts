interface ImportMetaEnv {
  readonly VITE_CONFIG_NAME?: string
  readonly DEV: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
