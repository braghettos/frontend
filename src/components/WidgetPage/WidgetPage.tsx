import { useIsFetching } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useLocation, useSearchParams } from 'react-router'

import { useRoutesContext } from '../../context/RoutesContext'
import Page404 from '../../pages/Page404'
import Drawer from '../../widgets/Drawer'
import Modal from '../../widgets/Modal'
import Header from '../Header'
import Sidebar from '../Sidebar'
import WidgetRenderer from '../WidgetRenderer'

import styles from './WidgetPage.module.css'

export const WidgetPage = ({ defaultWidgetEndpoint }: { defaultWidgetEndpoint?: string }) => {
  const location = useLocation()
  const { menuRoutes } = useRoutesContext()
  const [searchParams] = useSearchParams()
  const queryParamWidgetEndpoint = searchParams.get('widgetEndpoint')
  const currentRoute = menuRoutes.find(({ path }) => path === location.pathname)
  const widgetEndpoint = queryParamWidgetEndpoint || currentRoute?.resourceRef?.path || defaultWidgetEndpoint || ''

  useEffect(() => {
    const userData = localStorage.getItem('K_user')

    if (!userData) {
      window.location.replace('/login')
    }
  }, [])

  const isFetchingRoutes = useIsFetching({
    predicate: (query) => {
      return (
        (query.queryKey[1] as string).includes('resource=routes')
        || (query.queryKey[1] as string).includes('resource=routesloaders')
        || (query.queryKey[1] as string).includes('resource=navmenus')
      )
    },
  })

  return (
    <div className={styles.widgetPage}>
      <Sidebar />
      <div className={styles.container}>
        <Header breadcrumbVisible={widgetEndpoint !== null} />
        <div className={styles.content}>
          {widgetEndpoint || isFetchingRoutes ? <WidgetRenderer key={'content'} widgetEndpoint={widgetEndpoint} /> : <Page404 />}
        </div>
      </div>
      <Drawer />
      <Modal />
    </div>
  )
}

export default WidgetPage
