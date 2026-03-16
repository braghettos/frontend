import { DeleteOutlined, EditOutlined, PlusCircleOutlined } from '@ant-design/icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { FormInstance } from 'antd'
import { Button, Drawer, List, Popover, Tag, Typography, Form, Flex } from 'antd'
import type { JSONSchema4 } from 'json-schema'
import React, { useEffect, useState, useMemo, useCallback } from 'react'

import { getDefaultsFromSchema } from '../../widgets/Form/utils'

import styles from './ListObjectFields.module.css'

type ListObjectFieldsProps = {
  container: HTMLElement
  value?: unknown[]
  onChange?: (values: unknown[]) => void
  fields: React.ReactNode[] | ((formInstance: FormInstance) => React.ReactNode[])
  displayField: string
  schema: JSONSchema4
}

const ListObjectFields = ({
  container,
  displayField,
  fields,
  onChange,
  schema,
  value = [],
}: ListObjectFieldsProps) => {
  const [open, setOpen] = useState<boolean>(false)
  const [list, setList] = useState<unknown[]>(value)
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [form] = Form.useForm()

  useEffect(() => {
    if (JSON.stringify(value) !== JSON.stringify(list)) {
      setList(value)
    }
  }, [value, list])

  const onAdd = useCallback(() => {
    setEditIndex(null)
    form.resetFields()

    const defaultValues = getDefaultsFromSchema(schema)
    form.setFieldsValue(defaultValues)

    setOpen(true)
  }, [form, schema])

  const onEdit = useCallback((index: number) => {
    const item = list[index]
    if (item && typeof item === 'object') {
      setEditIndex(index)
      setOpen(true)

      // This is instrumental to make sure that form fields are synced when opening the drawer
      setTimeout(() => {
        form.setFieldsValue(item)
      }, 0)
    }
  }, [list, form])

  const onRemove = useCallback((index: number) => {
    const newList = list.filter((_, i) => i !== index)
    setList(newList)
    onChange?.(newList)
  }, [list, onChange])

  const onSubmit = useCallback((values: unknown) => {
    const newList: unknown[] = editIndex !== null
      ? list.map((item, index) => (index === editIndex ? values : item))
      : [...list, values]

    setList(newList)
    onChange?.(newList)
    setOpen(false)
    setEditIndex(null)
    form.resetFields()
  }, [editIndex, list, onChange, form])

  const getValue = useCallback((item: unknown, index: number): React.ReactNode => {
    if (!displayField) {
      return `object item #${index + 1}`
    }

    return displayField.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object' && key in acc) {
        const value = (acc as Record<string, unknown>)[key]

        if (value === undefined || value === null) {
          return (
            <Flex align='center' gap={5}>
              <FontAwesomeIcon color='orange' icon='triangle-exclamation' />
              <Typography.Text>object item #{index + 1}</Typography.Text>
            </Flex>
          )
        }

        // { label, value } support
        if (typeof value === 'object' && 'label' in value) {
          const { label } = (value as { label?: unknown })
          if (typeof label === 'string' || typeof label === 'number') {
            return label
          }
        }

        // primitive fallback
        return value
      }

      return undefined
    }, item) as React.ReactNode
  }, [displayField])

  const getPopoverContent = useCallback((obj: unknown, path: string = ''): React.ReactNode[] => {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) =>
        getPopoverContent(value, path ? `${path}.${key}` : key)
      )
    }
    return [<div key={path}><strong>{path}</strong>: {typeof obj === 'string' ? obj : String(obj)}</div>]
  }, [])

  const fieldsMemo = useMemo(() => fields, [fields])

  return (
    <div className={styles.listObjectFields}>
      <List
        dataSource={list}
        footer={
          <Button onClick={onAdd} type='primary'>
            <PlusCircleOutlined /> Add element
          </Button>
        }
        locale={{ emptyText: <></> }}
        renderItem={(item, index) => (
          <List.Item
            actions={[
              <Button icon={<EditOutlined />} key='edit' onClick={() => onEdit(index)} shape='circle' type='text' />,
              <Button icon={<DeleteOutlined />} key='delete' onClick={() => onRemove(index)} shape='circle' type='text' />,
            ]}
            key={index}
          >
            {(typeof item === 'object' && item !== null)
              ? (
                <Popover content={<div>{getPopoverContent(item)}</div>}>
                  <Tag>{getValue(item, index)}</Tag>
                </Popover>
              )
              : null
            }
          </List.Item>
        )}
      />

      <Drawer
        closable={false}
        extra={
          <Button onClick={() => form.submit()} type='primary'>
            Submit
          </Button>
        }
        getContainer={() => container}
        onClose={() => setOpen(false)}
        open={open}
        style={{ position: 'absolute' }}
        title={editIndex !== null ? 'Edit element' : 'Add element'}
      >
        <Form
          autoComplete='off'
          form={form}
          layout='vertical'
          name='formObjects'
          onFinish={onSubmit}
        >
          {typeof fieldsMemo === 'function' ? fieldsMemo(form) : fieldsMemo}
        </Form>
      </Drawer>
    </div>
  )
}

export default ListObjectFields
