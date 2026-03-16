import type { IconProp } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Tabs, Tooltip } from 'antd'
import { useMemo } from 'react'
import { CopyToClipboard } from 'react-copy-to-clipboard-ts'
import SyntaxHighlighter from 'react-syntax-highlighter'
import { vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs'

import { generateChart } from '../../helm/generateChart'
import type { BlueprintBuilderState, GeneratedFile } from '../../types'

import styles from './HelmPreview.module.css'

interface HelmPreviewProps {
  activeTab: string
  onTabChange: (tab: string) => void
  state: BlueprintBuilderState
}

const HelmPreview = ({ activeTab, onTabChange, state }: HelmPreviewProps) => {
  const generatedFiles: GeneratedFile[] = useMemo(
    () => generateChart(state),
    [state]
  )

  if (state.nodes.length === 0) {
    return (
      <div className={styles.emptyPreview}>
        Add resources to the canvas to preview the generated Helm chart
      </div>
    )
  }

  const tabItems = generatedFiles.map((file) => ({
    children: (
      <div className={styles.codeBlock}>
        <SyntaxHighlighter
          language='yaml'
          style={vs2015}
          wrapLongLines
        >
          {file.content}
        </SyntaxHighlighter>
      </div>
    ),
    key: file.path,
    label: file.path.split('/').pop(),
  }))

  return (
    <div className={styles.preview}>
      <Tabs
        activeKey={activeTab || generatedFiles[0]?.path}
        items={tabItems}
        onChange={onTabChange}
        size='small'
        tabBarExtraContent={
          <div className={styles.tabExtra}>
            <CopyToClipboard
              text={generatedFiles.find((file) => file.path === activeTab)?.content ?? ''}
            >
              <Tooltip title='Copy to clipboard'>
                <Button
                  icon={<FontAwesomeIcon icon={'fa-copy' as IconProp} />}
                  size='small'
                  type='text'
                />
              </Tooltip>
            </CopyToClipboard>
          </div>
        }
        type='card'
      />
    </div>
  )
}

export default HelmPreview
