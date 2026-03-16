import type { IconProp } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { AutoComplete, Form, Input, InputNumber, Select, Switch, Tag, Tooltip } from 'antd'

import { getResourceFields } from '../../resourceSchemas'
import type { BlueprintEdge, BlueprintNode, ResourceNodeData } from '../../types'

import styles from './PropertyPanel.module.css'

const HELM_SNIPPETS = [
  { label: '.Values.<resource>.<field>', value: '{{ .Values. }}' },
  { label: '| default "value"', value: '| default "" }}' },
  { label: '| quote', value: '| quote }}' },
  { label: '| upper', value: '| upper }}' },
  { label: '| lower', value: '| lower }}' },
  { label: '| trim', value: '| trim }}' },
  { label: '| b64enc', value: '| b64enc }}' },
  { label: '| b64dec', value: '| b64dec }}' },
  { label: '| toYaml', value: '| toYaml }}' },
  { label: '| toJson', value: '| toJson }}' },
  { label: '| nindent N', value: '| nindent 4 }}' },
  { label: '| indent N', value: '| indent 4 }}' },
  { label: '| required "msg"', value: '| required "field is required" }}' },
  { label: '| ternary "a" "b"', value: '| ternary "a" "b" }}' },
  { label: 'printf "%s-%s"', value: '{{ printf "%s-%s" }}' },
  { label: '.Release.Name', value: '{{ .Release.Name }}' },
  { label: '.Release.Namespace', value: '{{ .Release.Namespace }}' },
  { label: '.Chart.Name', value: '{{ .Chart.Name }}' },
  { label: 'include "chart.fullname" .', value: '{{ include "chart.fullname" . }}' },
  { label: 'if .Values.<field>', value: '{{- if .Values. }}...{{- end }}' },
  { label: 'with .Values.<field>', value: '{{- with .Values. }}...{{- end }}' },
  { label: 'range .Values.<list>', value: '{{- range .Values. }}...{{- end }}' },
  { label: 'coalesce (first non-empty)', value: '{{ coalesce .Values. "fallback" }}' },
  { label: 'cat (concat strings)', value: '{{ cat .Values. "-suffix" }}' },
]

interface PropertyPanelProps {
  edges: BlueprintEdge[]
  node: BlueprintNode | undefined
  nodes: BlueprintNode[]
  onClearHelmExpression: (nodeId: string, fieldName: string) => void
  onSetHelmExpression: (nodeId: string, fieldName: string, expression: string) => void
  onUpdateNodeData: (nodeId: string, data: Partial<ResourceNodeData>) => void
}

const PropertyPanel = ({
  edges,
  node,
  nodes,
  onClearHelmExpression,
  onSetHelmExpression,
  onUpdateNodeData,
}: PropertyPanelProps) => {
  if (!node) {
    return (
      <div className={styles.empty}>
        <FontAwesomeIcon icon={'fa-hand-pointer' as IconProp} style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }} />
        <div>Select a node on the canvas to edit its properties</div>
      </div>
    )
  }

  const { data } = node
  const fields = getResourceFields(data.kind)

  const connectedEdges = edges.filter(
    (edge) => edge.source === node.id || edge.target === node.id
  )

  const handlePropertyChange = (fieldName: string, value: unknown) => {
    onUpdateNodeData(node.id, {
      properties: { ...data.properties, [fieldName]: value },
    })
  }

  const handleNameChange = (value: string) => {
    onUpdateNodeData(node.id, { resourceName: value })
  }

  const defaultExpression = (fieldName: string) =>
    `{{ .Values.${data.resourceName}.${fieldName} }}`

  const handleToggleHelm = (fieldName: string) => {
    if (data.helmExpressions.has(fieldName)) {
      onClearHelmExpression(node.id, fieldName)
    } else {
      onSetHelmExpression(node.id, fieldName, defaultExpression(fieldName))
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.kindBadge}>{data.kind}</div>
        <Input
          onChange={(inputEvent) => handleNameChange(inputEvent.target.value)}
          placeholder='Resource name'
          size='small'
          value={data.resourceName}
        />
      </div>

      <Form layout='vertical' size='small'>
        {fields.map((field) => {
          const helmExpr = data.helmExpressions.get(field.name)
          const isParameterized = helmExpr !== undefined
          const currentValue = data.properties[field.name] ?? field.defaultValue

          return (
            <Form.Item
              key={field.name}
              label={
                <div className={styles.fieldRow}>
                  <span>{field.label}</span>
                  {field.required && <Tag color='red' style={{ fontSize: 10, lineHeight: '14px', margin: 0, padding: '0 4px' }}>req</Tag>}
                </div>
              }
            >
              <div className={styles.fieldRow}>
                <div className={styles.fieldInput}>
                  {isParameterized ? (
                    <AutoComplete
                      className={styles.helmExprInput}
                      onChange={(val) => onSetHelmExpression(node.id, field.name, val)}
                      options={HELM_SNIPPETS.map((snippet) => ({
                        label: snippet.label,
                        value: snippet.value,
                      }))}
                      value={helmExpr}
                    >
                      <Input.TextArea
                        autoSize={{ maxRows: 4, minRows: 1 }}
                        className={styles.helmExprTextarea}
                        placeholder='{{ .Values.x | upper | quote }}'
                        spellCheck={false}
                      />
                    </AutoComplete>
                  ) : (
                    <>
                      {field.type === 'string' && (
                        <Input
                          onChange={(inputEvent) => handlePropertyChange(field.name, inputEvent.target.value)}
                          placeholder={field.placeholder}
                          value={currentValue as string}
                        />
                      )}
                      {field.type === 'number' && (
                        <InputNumber
                          onChange={(val) => handlePropertyChange(field.name, val)}
                          placeholder={field.placeholder}
                          style={{ width: '100%' }}
                          value={currentValue as number}
                        />
                      )}
                      {field.type === 'boolean' && (
                        <Switch
                          checked={currentValue as boolean}
                          onChange={(val) => handlePropertyChange(field.name, val)}
                        />
                      )}
                      {field.type === 'select' && (
                        <Select
                          onChange={(val) => handlePropertyChange(field.name, val)}
                          options={field.options}
                          style={{ width: '100%' }}
                          value={currentValue as string}
                        />
                      )}
                      {field.type === 'keyValue' && (
                        <Input.TextArea
                          onChange={(inputEvent) => handlePropertyChange(field.name, inputEvent.target.value)}
                          placeholder={'key1: value1\nkey2: value2'}
                          rows={4}
                          value={currentValue as string}
                        />
                      )}
                    </>
                  )}
                </div>
                <Tooltip title={isParameterized ? 'Use static value' : 'Parameterize as Helm expression'}>
                  <span
                    className={styles.helmToggle}
                    data-active={isParameterized}
                    onClick={() => handleToggleHelm(field.name)}
                    role='button'
                    tabIndex={0}
                  >
                    <FontAwesomeIcon icon={'fa-code' as IconProp} />
                  </span>
                </Tooltip>
              </div>
            </Form.Item>
          )
        })}
      </Form>

      {connectedEdges.length > 0 && (
        <>
          <div className={styles.sectionTitle}>Connections</div>
          <div className={styles.edgeList}>
            {connectedEdges.map((edge) => {
              const isSource = edge.source === node.id
              const otherNodeId = isSource ? edge.target : edge.source
              const otherNode = nodes.find((item) => item.id === otherNodeId)
              const direction = isSource ? '\u2192' : '\u2190'

              return (
                <div className={styles.edgeItem} key={edge.id}>
                  <span>{direction}</span>
                  <Tag color='blue' style={{ margin: 0 }}>
                    {edge.data?.relationshipType}
                  </Tag>
                  <span>{otherNode?.data.resourceName ?? 'unknown'}</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default PropertyPanel
