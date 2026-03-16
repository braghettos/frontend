import { Button } from 'antd'

export const ButtonPagination = ({
  children,
  fetchNextPage,
  hasNextPage,
  isFetching,
  isFetchingNextPage,
  isFetchingResourcesRefs,
}: {
  fetchNextPage: () => Promise<unknown> | void
  hasNextPage: boolean
  children: React.ReactNode
  isFetching: boolean
  isFetchingNextPage: boolean
  isFetchingResourcesRefs: boolean
}) => {
  return (
    <>
      {children}

      <div>
        {hasNextPage && (
          <Button disabled={isFetchingNextPage || isFetchingResourcesRefs} onClick={() => { void fetchNextPage() }}>
            Load more
          </Button>
        )}
      </div>
      <div>
        <div>isFetching: {isFetching.toString()}</div>
        <div>isFetchingNextPage: {isFetchingNextPage.toString()}</div>
        <div>isFetchingResourcesRefs: {isFetchingResourcesRefs.toString()}</div>
        <div>has more items: {hasNextPage?.toString()}</div>
      </div>
    </>
  )
}
