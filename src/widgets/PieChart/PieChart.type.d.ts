export interface PieChart {
  version: string
  /**
   * PieChart is a visual component used to display categorical data as segments of a pie chart
   */
  kind: string
  spec: {
    widgetData: {
      /**
       * title displayed above the chart
       */
      title: string
      /**
       * supplementary text displayed below or near the title
       */
      description?: string
      /**
       * data to be visualized in the pie chart
       */
      series?: {
        /**
         * sum of all data values, used to calculate segment sizes
         */
        total: number
        /**
         * individual segments of the pie chart
         */
        data: {
          /**
           * color used to represent the segment
           */
          color: 'blue' | 'darkBlue' | 'orange' | 'gray' | 'red' | 'green' | 'violet'
          /**
           * numeric value for the segment
           */
          value: number
          /**
           * label for the segment
           */
          label: string
        }[]
      }
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
