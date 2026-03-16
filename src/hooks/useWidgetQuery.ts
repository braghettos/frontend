/* eslint-disable sort-keys/sort-keys-fix */
/* this rules conflicts with react-query ordering required for correct type inference */

import { useInfiniteQuery, useIsFetching } from '@tanstack/react-query'

import { useConfigContext } from '../context/ConfigContext'
import type { ResourceRef, Widget } from '../types/Widget'
import { getAccessToken } from '../utils/getAccessToken'

function parseNumberParam(param: string | null) {
  const parsed = param ? parseInt(param) : undefined
  return isNaN(parsed!) ? undefined : parsed
}

export const useWidgetQuery = (widgetEndpoint: string) => {
  const { config } = useConfigContext()
  const widgetFullUrl = `${config!.api.SNOWPLOW_API_BASE_URL}${widgetEndpoint}`
  const requestUrl = new URL(widgetFullUrl)

  /* TO DEBUG BEFORE SNOWPLOW RETURNS THESE IN THE widgetEndpoint */
  // if (requestUrl.searchParams.get('resource') === 'datagrids') {
  //   requestUrl.searchParams.set('page', '1')
  //   requestUrl.searchParams.set('perPage', '1')
  // }

  const initialPage = parseNumberParam(requestUrl.searchParams.get('page'))
  const initialPerPage = parseNumberParam(requestUrl.searchParams.get('perPage'))

  async function fetchWidget({ page, perPage }: { page?: number; perPage?: number }) {
    /* set new page and perPage to the original requestUrl with updated values */
    if (typeof page === 'number') {
      requestUrl.searchParams.set('page', page.toString())
    }
    if (typeof perPage === 'number') {
      requestUrl.searchParams.set('perPage', perPage.toString())
    }

    const urlString = requestUrl.toString()

    // console.log({
    //   kind: url.searchParams.get('resource'),
    //   page: url.searchParams.get('page'),
    //   perPage: url.searchParams.get('perPage'),
    //   urlString,
    // })

    const res = await fetch(urlString, {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    })

    const widget = (await res.json()) as Widget
    return widget
  }

  const queryResult = useInfiniteQuery({
    queryKey: ['widgets', widgetEndpoint],
    queryFn: ({ pageParam }) => fetchWidget(pageParam),
    initialPageParam: {
      page: initialPage,
      perPage: initialPerPage,
    },
    getNextPageParam: (lastPage, _allPages, pageParams) => {
      if (typeof pageParams.page !== 'number') {
        // no initial page, so no more pages
        return undefined
      }

      const hasMorePages = typeof lastPage.status === 'object' && lastPage.status?.resourcesRefs?.slice?.continue === true

      if (!hasMorePages) {
        /* to signal there are not other pages */
        return undefined
      }

      return {
        page: pageParams.page + 1,
        perPage: pageParams.perPage,
      }
    },
    select: (data) => {
      const [firstPage] = data.pages

      if (typeof firstPage.status !== 'object') {
        return firstPage
      }

      // Merge items from all pages
      const allResourcesRefs: ResourceRef[] = []
      const allWidgetDataItems: unknown[] = []

      for (const page of data.pages) {
        if (typeof page.status === 'object' && page.status?.resourcesRefs?.items) {
          allResourcesRefs.push(...page.status.resourcesRefs.items)
        }
        if (
          typeof page.status === 'object'
          && page.status?.widgetData
          && typeof page.status.widgetData === 'object'
          && 'items' in page.status.widgetData
          && Array.isArray((page.status.widgetData as { items: unknown[] }).items)
        ) {
          allWidgetDataItems.push(...(page.status.widgetData as { items: unknown[] }).items)
        }
      }

      // Return NEW object to ensure React detects the change
      return {
        ...firstPage,
        status: {
          ...firstPage.status,
          resourcesRefs: {
            ...firstPage.status.resourcesRefs,
            items: allResourcesRefs,
          },
          widgetData: {
            ...(firstPage.status.widgetData as Record<string, unknown>),
            items: allWidgetDataItems,
          },
        },
      }
    },
  })

  const resourcesRefsPaths = typeof queryResult.data?.status === 'object'
    ? queryResult.data.status.resourcesRefs?.items.map((item) => item.path)
    : []

  const resourcesRefsFetching = useIsFetching({
    predicate: (query) => {
      const resourceRefPath = query.queryKey[1] as string

      if (!resourcesRefsPaths) { return false }

      return resourcesRefsPaths.includes(resourceRefPath)
    },
  })

  return {
    queryResult,
    isFetchingResourcesRefs: resourcesRefsFetching > 0,
  }
}
