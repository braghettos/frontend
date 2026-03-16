import { Typography } from 'antd'
import Linkify from 'linkify-react'

import type { WidgetProps } from '../../types/Widget'

import styles from './Paragraph.module.css'
import type { Paragraph as WidgetType } from './Paragraph.type'

export type ParagraphWidgetData = WidgetType['spec']['widgetData']

const Paragraph = ({ uid, widgetData }: WidgetProps<ParagraphWidgetData>) => {
  const { text } = widgetData

  return (
    <Typography.Paragraph className={styles.paragraph} key={uid}>
      <Linkify
        options={{
          rel: 'noopener noreferrer',
          target: '_blank',
        }}
      >
        {text}
      </Linkify>
    </Typography.Paragraph>
  )
}

export default Paragraph
