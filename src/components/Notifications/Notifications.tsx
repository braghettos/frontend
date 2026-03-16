import { BellFilled } from '@ant-design/icons'
import { Badge, Button, Drawer, List, Skeleton, Typography } from 'antd'
import { useMemo, useState } from 'react'

import { useGetEvents } from '../../hooks/useGetEvents'
import { formatISODate } from '../../utils/utils'

import styles from './Notifications.module.css'

const Notifications = () => {
  const [drawerVisible, setDrawerVisible] = useState(false)

  const { data: notifications, isLoading } = useGetEvents({ registerToSSE: drawerVisible, topic: 'krateo' })

  const notificationList = useMemo(() => (
    <List
      className={styles.list}
      dataSource={notifications}
      itemLayout='vertical'
      renderItem={({
        firstTimestamp,
        involvedObject: { apiVersion, kind, name, namespace },
        lastTimestamp,
        message,
        metadata: { creationTimestamp, uid },
        reason,
        type,
      }, index) => {
        const timestamp = lastTimestamp || firstTimestamp || creationTimestamp

        return (
          <List.Item
            className={`${styles.listItem} ${index === 0 ? styles.firstElement : ''} ${notifications?.length && index === notifications.length - 1 ? styles.lastElement : ''}`}
            key={uid}
          >
            <Button className={styles.notificationElement} type='link'>
              <div className={styles.space}>
                <div className={styles.titleWrapper}>
                  <Badge
                    color={type === 'Normal' ? '#11B2E2' : '#ffaa00'}
                    text={
                      <Typography.Text className={styles.title} strong>
                        {reason}
                      </Typography.Text>
                    }
                  />
                  <Typography.Paragraph className={styles.timestamp}>
                    {timestamp && formatISODate(timestamp, true)}
                  </Typography.Paragraph>
                </div>
                <Typography.Text className={styles.description}>
                  {message}
                </Typography.Text>
                <Typography.Paragraph className={styles.details}>
                  {`${kind}.${apiVersion}/${namespace}/${name}`}
                </Typography.Paragraph>
              </div>
            </Button>
          </List.Item>
        )
      }}
      size='large'
    />
  ), [notifications])

  return (
    <>
      <Badge
        className={`${styles.badge} ${notifications && notifications?.length > 0 ? styles.hasNotifications : ''}`}
        count={notifications?.length || 0}
      >
        <Button className={styles.icon} icon={<BellFilled />} onClick={() => setDrawerVisible(true)} shape='circle' type='link' />
      </Badge>

      <Drawer className={styles.drawer} onClose={() => setDrawerVisible(false)} open={drawerVisible} title='Notifications' width={550}>
        {isLoading ? <Skeleton active /> : notificationList}
      </Drawer>
    </>
  )
}

export default Notifications
