import { LoadingOutlined } from '@ant-design/icons'
import { Divider, Empty, Spin, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'

import { useFilter } from '../../components/FiltesProvider/FiltersProvider'
import RichRow from '../../components/RichRow'
import { useConfigContext } from '../../context/ConfigContext'
import type { WidgetProps } from '../../types/Widget'
import type { SSEK8sEvent } from '../../utils/types'
import { formatISODate } from '../../utils/utils'

import type { EventList as WidgetType } from './EventList.type'

export type EventListWidgetData = WidgetType['spec']['widgetData']

const EventList = ({ uid, widgetData }: WidgetProps<EventListWidgetData>) => {
  const { events, prefix, sseEndpoint, sseTopic } = widgetData

  const { config } = useConfigContext()
  const { getFilteredData } = useFilter()
  const [loading, setLoading] = useState<boolean>(!!sseEndpoint && !!sseTopic)

  const [eventList, setEventList] = useState<SSEK8sEvent[]>(events || [])

  useEffect(() => {
    if (!sseEndpoint || !sseTopic) { return }

    const timeout = setTimeout(() => setLoading(false), 10000)

    if (sseEndpoint.startsWith('krateo-test-mock')) {
      let counter = 0
      const maxEvents = 5
      const interval = setInterval(() => {
        if (counter >= maxEvents) {
          clearInterval(interval)
          setLoading(false)
          return
        }

        const fakeEvent: SSEK8sEvent = {
          eventTime: new Date().toISOString(),
          involvedObject: {
            apiVersion: 'v1',
            kind: 'Pod',
            name: 'example-pod',
            namespace: 'default',
            uid: 'mock-obj',
          },
          message: `Simulated Kubernetes event #${counter + 1}`,
          metadata: {
            creationTimestamp: new Date().toISOString(),
            name: `mock-event-${Date.now()}`,
            namespace: 'default',
            uid: `mock-${Date.now()}`,
          },
          reason: 'MockEvent',
          source: { component: 'mock-generator' },
          type: 'Normal',
        }

        setEventList((prev) => [fakeEvent, ...prev].slice(0, 200))
        setLoading(false)
        counter += 1
      }, 2000)

      return () => {
        clearInterval(interval)
        clearTimeout(timeout)
      }
    }

    const eventsEndpoint = `${config!.api.EVENTS_PUSH_API_BASE_URL}${sseEndpoint.endsWith('/')
      ? sseEndpoint.slice(0, -1)
      : sseEndpoint}`

    try {
      const eventSource = new EventSource(eventsEndpoint, { withCredentials: false })

      eventSource.addEventListener(sseTopic, (event: MessageEvent<string>) => {
        try {
          const data = JSON.parse(event.data) as SSEK8sEvent
          setEventList((prev) => [data, ...prev].slice(0, 200))
          setLoading(false)
        } catch (error) {
          console.error('Error parsing event data:', error)
        }
      })

      eventSource.onerror = (err) => {
        console.warn('SSE connection failed:', err)
        setLoading(false)
        eventSource.close()
      }

      return () => {
        eventSource.close()
        clearTimeout(timeout)
      }
    } catch (error) {
      console.warn('Error initializing SSE connection:', error)
      setLoading(false)
    }
  }, [config, sseEndpoint, sseTopic])

  const filteredEventList = useMemo(() => {
    if (prefix && eventList.length > 0) {
      return getFilteredData(eventList, prefix) as SSEK8sEvent[]
    }

    return eventList
  }, [prefix, eventList, getFilteredData])

  if (loading) {
    return <Spin indicator={<LoadingOutlined />} size='large' spinning />
  }

  if (!filteredEventList.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  return (
    <>
      {filteredEventList.map(
        ({
          eventTime,
          firstTimestamp,
          involvedObject: { apiVersion, kind, name, namespace },
          lastTimestamp,
          message,
          metadata: { uid: rowUid },
          reason,
          type,
        }) => {
          const timestamp = lastTimestamp || firstTimestamp || eventTime

          return (
            <RichRow
              color={type === 'Normal' ? 'blue' : 'orange'}
              icon={'fa-ellipsis-h'}
              key={`${uid}-${rowUid}`}
              primaryText={
                <>
                  <Typography.Text type='secondary'>name:</Typography.Text> <Typography.Text>{name}</Typography.Text>
                  <Divider type='vertical' />
                  <Typography.Text type='secondary'>namespace:</Typography.Text> <Typography.Text>{namespace}</Typography.Text>
                  <Divider type='vertical' />
                  <Typography.Text type='secondary'>kind:</Typography.Text> <Typography.Text>{kind}</Typography.Text>
                  <Divider type='vertical' />
                  <Typography.Text type='secondary'>apiVersion:</Typography.Text> <Typography.Text>{apiVersion}</Typography.Text>
                </>
              }
              secondaryText={timestamp && formatISODate(timestamp, true)}
              subPrimaryText={message}
              subSecondaryText={reason}
            />
          )
        }
      )}
    </>
  )
}

export default EventList
