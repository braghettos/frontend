import { Button, DatePicker, Form, Input, Radio, Select, Space } from 'antd'
import { useEffect } from 'react'

import { useFilter } from '../../components/FiltesProvider/FiltersProvider'
import type { WidgetProps } from '../../types/Widget'
import { closeDrawer } from '../Drawer/Drawer'

import type { Filters as WidgetType } from './Filters.type'

export type FiltersWidgetData = WidgetType['spec']['widgetData']
type FieldType = FiltersWidgetData['fields'][number]

const renderFilterField = ({ options, type }: FieldType) => {
  switch (type) {
    case 'string':
      if (options) {
        if (options.length > 4) {
          return (
            <Select
              allowClear
              options={options.map(option => ({ label: option, value: option }))}
            />
          )
        }

        return (
          <Radio.Group>
            {options.map((option) => (
              <Radio key={`radio_${option}`} value={option}>
                {option}
              </Radio>
            ))}
          </Radio.Group>
        )
      }

      return <Input />

    case 'number':
      return <Input type='number' />

    case 'boolean':
      return (
        <Select>
          <Select.Option value='true'>true</Select.Option>
          <Select.Option value='false'>false</Select.Option>
        </Select>
      )

    case 'date':
      return <DatePicker allowClear />

    case 'daterange':
      return <DatePicker.RangePicker allowClear />

    default:
      return null
  }
}

const Filters = ({ widgetData }: WidgetProps<FiltersWidgetData>) => {
  const { fields, prefix } = widgetData
  const { clearFilters, getFilters, setFilters } = useFilter()

  const [filterForm] = Form.useForm()

  const onReset = () => {
    filterForm.resetFields()
    clearFilters(prefix)
    closeDrawer()
  }

  const onSubmit = (values: Record<string, unknown>) => {
    setFilters(
      prefix,
      Object.keys(values).map(fieldName => {
        const field = fields.find(({ name }) => name.join('.') === fieldName)
        return {
          fieldName: Array.isArray(fieldName) ? fieldName : [fieldName],
          fieldType: field?.type ?? 'string',
          fieldValue: values[fieldName],
        }
      })
    )
    closeDrawer()
  }

  useEffect(() => {
    const filters = getFilters(prefix)
    if (filters) {
      filters.forEach(({ fieldName, fieldValue }) =>
        filterForm.setFieldValue(fieldName, fieldValue)
      )
    }
  }, [filterForm, getFilters, prefix])

  return (
    <>
      <Form
        autoComplete='off'
        form={filterForm}
        layout='vertical'
        name='filterForm'
        onFinish={onSubmit}
      >
        {fields.map((field) => (
          <Form.Item
            key={field.name.join('.')}
            label={field.label}
            name={field.name.join('.')}
            tooltip={field.description}
          >
            {renderFilterField(field)}
          </Form.Item>
        ))}
      </Form>
      <Space>
        <Button onClick={onReset} type='default'>Reset</Button>
        <Button onClick={() => filterForm.submit()} type='primary'>Apply</Button>
      </Space>
    </>
  )
}

export default Filters
