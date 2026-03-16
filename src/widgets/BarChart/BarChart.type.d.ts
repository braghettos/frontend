export interface BarChart {
  version: string
  /**
   * BarChart express quantities through a bar's length, using a common baseline. Bar charts series should contain a `data` property containing an array of values
   */
  kind: string
  spec: {
    widgetData: {
      /**
       * Array of grouped data entries for the bar chart
       */
      data: {
        /**
         * Label for the group/category
         */
        label?: string
        /**
         * Bars within the group, each representing a value
         */
        bars: {
          /**
           * Label or identifier for the bar
           */
          value: string
          /**
           * Height of the bar as a percentage (0–100)
           */
          percentage: number
          /**
           * Color of the bar
           */
          color?: 'blue' | 'darkBlue' | 'orange' | 'gray' | 'red' | 'green' | 'violet'
        }[]
      }[]
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
