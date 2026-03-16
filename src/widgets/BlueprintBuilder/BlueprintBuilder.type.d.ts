export interface BlueprintBuilder {
  version: string
  kind: string
  spec: {
    widgetData: {
      availableResources?: {
        kind: string
        apiVersion: string
        category: 'workloads' | 'networking' | 'config' | 'storage' | 'rbac' | 'custom'
        icon?: string
        schema?: {
          type?: string
          description?: string
          properties?: Record<string, unknown>
          required?: string[]
        }
      }[]
      chartDefaults?: {
        name?: string
        version?: string
        appVersion?: string
        description?: string
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
