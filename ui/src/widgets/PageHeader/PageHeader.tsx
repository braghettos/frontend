import { Flex, Tag, Typography } from 'antd'

import WidgetRenderer from '../../components/WidgetRenderer'
import { getTagStyle } from '../../theme/palette'
import type { WidgetProps } from '../../types/Widget'
import { getEndpointUrl } from '../../utils/utils'

import styles from './PageHeader.module.css'
import type { PageHeader as WidgetType } from './PageHeader.type'

export type PageHeaderWidgetData = NonNullable<WidgetType['spec']>['widgetData']

/**
 * The one page header.
 *
 * Every page needs the same thing — a title, sometimes a count, sometimes a status, sometimes a
 * subtitle, and the page's actions — and until now every page built it from a bespoke nest of
 * Flexes wrapping Paragraphs, Tags and Buttons. They diverged, visibly: five pages each named the
 * same concept differently (`…-titleline`, `…-title-line`, `…-title-stack`) and one reached for a
 * Row where the rest used a Flex. Nobody decided the headers should differ; there was nothing to
 * reuse, so each page built one.
 *
 * Several composition rules become structural here rather than remaining things an author has to
 * remember:
 *   - there is no eyebrow field, so a page cannot grow a redundant label above its title
 *   - there is no back-link field: the breadcrumb is the one way back
 *   - `counter` renders in brackets beside the title, on the title's own type step
 *   - the title, its counter and its tags share one baseline-centred row
 *   - actions are right-aligned in the same row, so a page cannot scatter them
 *
 * What it deliberately does NOT do: decide which action is primary. That lives on the Button CR,
 * because only the author knows which one a page is for. The layout affords exactly one.
 */
const PageHeader = ({ resourcesRefs, uid, widgetData }: WidgetProps<PageHeaderWidgetData>) => {
  const { counter, items, subtitle, tags, title } = widgetData

  return (
    <div className={styles.header} key={uid}>
      <Flex align='center' className={styles.top} gap='middle' justify='space-between' wrap>
        <Flex align='center' className={styles.titleLine} gap='small' wrap>
          <Typography.Title className={styles.title} level={1}>
            {title}
            {counter !== undefined && (
              // Beside the title and on its type step — a count is part of the title, not a
              // separate fact competing with it.
              <span className={styles.counter}>({counter})</span>
            )}
          </Typography.Title>

          {(tags ?? []).map(({ color, label }, index) => (
            // Colour resolves through the shared palette, never an antd preset: the same name
            // must render the same hex here as it does in a Table cell or a status pill.
            <Tag key={`${uid}-tag-${index}`} style={color ? getTagStyle(color) : undefined}>{label}</Tag>
          ))}
        </Flex>

        {(items ?? []).length > 0 && (
          <Flex align='center' className={styles.actions} gap='small' wrap>
            {(items ?? []).map(({ resourceRefId }, index) => {
              const endpoint = getEndpointUrl(resourceRefId, resourcesRefs)
              if (!endpoint) {
                // Loud rather than silent: a header action that resolves to nothing simply
                // vanishes, and an author reading the page has no way to tell it was ever meant
                // to be there.
                console.error(`PageHeader "${title}": action "${resourceRefId}" has no matching entry in resourcesRefs — it will not render.`)
                return null
              }
              return <WidgetRenderer key={`${uid}-action-${index}`} widgetEndpoint={endpoint} />
            }).filter(Boolean)}
          </Flex>
        )}
      </Flex>

      {subtitle && <Typography.Paragraph className={styles.subtitle}>{subtitle}</Typography.Paragraph>}
    </div>
  )
}

export default PageHeader
