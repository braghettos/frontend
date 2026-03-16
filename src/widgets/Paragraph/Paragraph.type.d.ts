export interface Paragraph {
  version: string
  /**
   * Paragraph is a simple component used to display a block of text
   */
  kind: string
  spec: {
    widgetData: {
      /**
       * the content of the paragraph to be displayed
       */
      text: string
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
