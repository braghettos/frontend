import type { NotificationInstance } from 'antd/es/notification/interface'
import type { DefaultOptionType } from 'antd/es/select'

import type { Config } from '../../../context/ConfigContext'
import type { ResourcesRefs } from '../../../types/Widget'
import { getAccessToken } from '../../../utils/getAccessToken'
import { getResourceRef } from '../../../utils/utils'

export const getOptionsFromResourceRefId = async (
  value: string | undefined,
  resourceRefId: string | undefined,
  resourcesRefs: ResourcesRefs,
  valueKey: string | undefined,
  notification: NotificationInstance,
  config: Config | undefined
): Promise<DefaultOptionType[]> => {
  if (!resourceRefId) {
    return []
  }

  const resourceRef = getResourceRef(resourceRefId, resourcesRefs)
  if (!resourceRef) {
    notification.error({
      description: `Cannot find resources refs for resource ref with ID ${resourceRefId}`,
      message: 'Error while retrieving options',
      placement: 'bottomLeft',
    })

    return []
  }

  try {
    const url = new URL(resourceRef.path, config!.api.SNOWPLOW_API_BASE_URL)

    if (valueKey) {
      url.searchParams.set('extras', JSON.stringify({ [valueKey]: value }))
    }

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${getAccessToken()}`,
      },
      method: 'GET',
    })

    if (!response.ok) {
      notification.error({
        description: 'No response received',
        message: 'Error while retrieving options',
        placement: 'bottomLeft',
      })

      return []
    }

    const data = await response.json() as unknown

    if (typeof data === 'object' && data !== null && 'status' in data && Array.isArray(data.status)) {
      const options: DefaultOptionType[] = data.status
        .filter((item: unknown): item is DefaultOptionType => {
          if (typeof item !== 'object' || item === null) { return false }

          const maybeObj = item as Record<string, unknown>
          return typeof maybeObj.label === 'string' && typeof maybeObj.value === 'string'
        })

      return options
    }

    return []
  } catch (error) {
    notification.error({
      description: 'There has been an unhandled error while retrieving field options',
      message: 'Error while retrieving options',
      placement: 'bottomLeft',
    })
    console.error('getOptionsFromResourceRefId error:', error)

    return []
  }
}
