export interface PageHeader {
  /**
   * widget version
   */
  version?: string
  /**
   * name of the k8s Custom Resource
   */
  kind?: string
  spec?: {
    /**
     * the data that will be passed to the widget on the frontend
     */
    widgetData: {
      /**
       * the page title (H1). The one required field — a page header without a title is not a page header
       */
      title: string
      /**
       * an optional count rendered in brackets beside the title, on the title's own type step (e.g. '(397)'). Use for 'how many of these are there', never for a status
       */
      counter?: number
      /**
       * one line of supporting context below the title. Must NOT restate the title — say it once per page
       */
      subtitle?: string
      /**
       * status pills on the title line, vertically centred with it
       */
      tags?: {
        /**
         * the pill text. Required: a colour with no label carries meaning by colour alone, which a screen reader and a colourblind reader both miss
         */
        label: string
        /**
         * a palette colour NAME (resolved through the shared palette, never an antd preset or a hex)
         */
        color?: 'blue' | 'darkBlue' | 'orange' | 'gray' | 'red' | 'green' | 'violet'
      }[]
      /**
       * the list of resources that are allowed to be children of this widget or referenced by it
       */
      allowedResources?: ('buttons' | 'buttongroups' | 'flexes')[]
      /**
       * the page's actions, rendered right-aligned on the title line. At most one should be `type: primary`
       */
      items?: {
        resourceRefId: string
      }[]
    }
    resourcesRefs: {
      items: {
        allowed?: boolean
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
    apiRef?: {
      name: string
      namespace: string
    }
    widgetDataTemplate?: {
      forPath?: string
      expression?: string
    }[]
    resourcesRefsTemplate?: {
      iterator?: string
      template?: {
        apiVersion?: string
        id?: string
        name?: string
        namespace?: string
        payload?: {
          [k: string]: unknown
        }
        resource?: string
        verb?: 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'GET'
      }
    }[]
    [k: string]: unknown
  }
}
