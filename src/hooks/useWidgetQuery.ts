/* eslint-disable sort-keys/sort-keys-fix */
/* this rules conflicts with react-query ordering required for correct type inference */

import { useEffect } from 'react'
import { useInfiniteQuery, useIsFetching } from '@tanstack/react-query'

import { useConfigContext } from '../context/ConfigContext'
import type { Widget } from '../types/Widget'
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

    if (!res.ok) {
      throw new Error(`Widget fetch failed: ${res.status} ${res.statusText}`)
    }

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
    // Phase 1 cumulative-slice pagination: each page call returns the
    // complete widget state for the cumulative slice [0 : page * perPage]
    // of the underlying data source. No cross-page merging is needed —
    // the latest page's output IS the current state.
    //
    // The backend does all the work:
    //   - snowplow's widget resolver injects .slice into the widgetDataTemplate
    //     data source so the widget's JQ can cumulatively slice the list.
    //   - The table widget's forPath slices .list[0 : K*perPage] then sorts.
    //   - The piechart widget's indexed forPaths count items in the same
    //     cumulative slice, so values grow monotonically as pages arrive.
    select: (data) => {
      if (data.pages.length === 0) {
        // react-query initial state — return an empty Widget-shaped object
        return data.pages[0]
      }
      return data.pages[data.pages.length - 1]
    },
  })

  // Auto-pagination: when the latest page signals hasNextPage, fire the
  // next page fetch in the background without waiting for user interaction.
  // Together with the latest-page-wins select() above, this drives the
  // progressive-rendering UX: widget renders page 1 immediately, then page 2
  // replaces it when ready (with 2x more data), and so on until the cumulative
  // slice covers the full data set and slice.continue becomes false.
  useEffect(() => {
    if (
      queryResult.hasNextPage
      && !queryResult.isFetchingNextPage
      && !queryResult.isFetching
    ) {
      void queryResult.fetchNextPage()
    }
  }, [
    queryResult.hasNextPage,
    queryResult.isFetchingNextPage,
    queryResult.isFetching,
    queryResult.fetchNextPage,
  ])

  const resourcesRefsPaths = typeof queryResult.data?.status === 'object'
    ? queryResult.data.status.resourcesRefs?.items?.map((item) => item.path) ?? []
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
