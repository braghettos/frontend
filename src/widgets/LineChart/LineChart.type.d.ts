export interface LineChart {
  version: string
  /**
   * LineChart displays a customizable line chart based on time series or numerical data. It supports multiple lines with colored coordinates and axis labels, typically used to visualize metrics from Kubernetes resources
   */
  kind: string
  spec: {
    /**
     * data used to render the chart including lines and axis labels
     */
    widgetData: {
      /**
       * list of data series to be rendered as individual lines
       */
      lines: {
        /**
         * label of the line displayed in the legend
         */
        name?: string
        /**
         * color used to render the line
         */
        color?: 'blue' | 'darkBlue' | 'orange' | 'gray' | 'red' | 'green' | 'violet'
        /**
         * data points that define the line
         */
        coords?: {
          /**
           * value on the x axis
           */
          xAxis: string
          /**
           * value on the y axis
           */
          yAxis: string
        }[]
      }[]
      /**
       * label for the x axis
       */
      xAxisName?: string
      /**
       * label for the y axis
       */
      yAxisName?: string
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
