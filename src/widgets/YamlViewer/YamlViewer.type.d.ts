export interface YamlViewer {
  version: string
  /**
   * YamlViewer receives a JSON string as input and renders its equivalent YAML representation for display.
   */
  kind: string
  spec: {
    widgetData: {
      /**
       * json string to be converted and displayed as yaml
       */
      json: string
    }
    apiRef?: {
      name: string
      namespace: string
    }
    widgetDataTemplate?: {
      forPath?: string
      expression?: string
    }[]
  }
}
