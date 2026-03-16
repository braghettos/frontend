export interface DataGrid {
  version: string
  kind: string
  spec: {
    widgetData: {
      /**
       * the list of resources that are allowed to be children of this widget or referenced by it
       */
      allowedResources: (
        | 'barcharts'
        | 'buttons'
        | 'buttongroups'
        | 'datagrids'
        | 'eventlists'
        | 'filters'
        | 'flowcharts'
        | 'forms'
        | 'linecharts'
        | 'markdowns'
        | 'panels'
        | 'paragraphs'
        | 'piecharts'
        | 'tables'
        | 'tablists'
        | 'yamlviewers'
      )[]
      /**
       * to show children as list or grid
       */
      asGrid?: boolean
      /**
       * The grid type of list. You can set grid to something like {gutter: 16, column: 4} or specify the integer for columns based on their size, e.g. sm, md, etc. to make it responsive.
       */
      grid?: {
        /**
         * The spacing between grid
         */
        gutter?: number
        /**
         * The column of grid
         */
        column?: number
        /**
         * <576px column of grid
         */
        xs?: number
        /**
         * ≥576px column of grid
         */
        sm?: number
        /**
         * ≥768px column of grid
         */
        md?: number
        /**
         * ≥992px column of grid
         */
        lg?: number
        /**
         * ≥1200px column of grid
         */
        xl?: number
        /**
         * ≥1600px column of grid
         */
        xxl?: number
      }
      items: {
        resourceRefId: string
      }[]
      /**
       * it's the filters prefix to get right values
       */
      prefix?: string
    }
    apiRef?: {
      name: string
      namespace: string
    }
    widgetDataTemplate?: {
      forPath?: string
      expression?: string
    }[]
    resourcesRefs?: {
      items: {
        allowed: boolean
        apiVersion?: string
        id: string
        name?: string
        namespace?: string
        payload?: {
          [k: string]: unknown
        }
        resource?: string
        verb?: 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'GET'
        slice?: {
          offset?: number
          page: number
          perPage: number
          continue?: boolean
          [k: string]: unknown
        }
        [k: string]: unknown
      }[]
      [k: string]: unknown
    }
  }
}
