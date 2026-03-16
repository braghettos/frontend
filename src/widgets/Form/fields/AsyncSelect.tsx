import { LoadingOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Form, type FormInstance, Select, Spin } from 'antd'
import useApp from 'antd/es/app/useApp'
import type { DefaultOptionType } from 'antd/es/select'
import { useEffect, useMemo, useRef } from 'react'

import { useConfigContext } from '../../../context/ConfigContext'
import type { ResourcesRefs } from '../../../types/Widget'
import type { FormWidgetData } from '../Form'

import { getOptionsFromResourceRefId } from './utils'

type AsyncSelectProps = {
  data: NonNullable<FormWidgetData['dependencies']>[number]
  form: FormInstance
  resourcesRefs: ResourcesRefs
  initialValue?: DefaultOptionType | undefined
}

const AsyncSelect = ({ data, form, initialValue, resourcesRefs }: AsyncSelectProps) => {
  const { notification } = useApp()
  const { config } = useConfigContext()

  const { dependsOn, extra: { key }, name, resourceRefId } = data

  const dependFieldValue = Form.useWatch<string | DefaultOptionType | undefined>(dependsOn.name, form)
  const prevDependRef = useRef<typeof dependFieldValue | undefined>(undefined)

  const queryValue = useMemo(() => {
    if (dependFieldValue) {
      return typeof dependFieldValue === 'object' ? dependFieldValue.value : dependFieldValue
    }

    if (initialValue) {
      return initialValue.value
    }

    return undefined
  }, [dependFieldValue, initialValue])

  // Reset when dependency changes — but do not clear initialValue that matches current value
  useEffect(() => {
    const currentValue = form.getFieldValue(name) as DefaultOptionType | undefined

    const prev = prevDependRef.current
    prevDependRef.current = dependFieldValue

    const prevValComparable = prev && (typeof prev === 'object' ? prev.value : prev)
    const currValComparable = dependFieldValue && (typeof dependFieldValue === 'object' ? dependFieldValue.value : dependFieldValue)

    if (prevValComparable !== undefined && prevValComparable !== currValComparable) {
      if (currentValue !== undefined) {
        form.setFieldValue(name, undefined)
      }
    }
  }, [dependFieldValue, form, name])

  const { data: options = [], isLoading } = useQuery<DefaultOptionType[]>({
    enabled: !!(queryValue && config),
    queryFn: () => getOptionsFromResourceRefId(queryValue as string, resourceRefId, resourcesRefs, key, notification, config),
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey: ['async-select-options', resourceRefId, dependFieldValue, key],
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  })

  const formValue = Form.useWatch<DefaultOptionType | undefined>(name, form)

  const value = useMemo(() => {
    if (!formValue) { return undefined }
    if (options.length === 0) { return undefined }

    const optionExists = options.some(({ value }) => String(value) === String(formValue.value),)

    if (!optionExists) {
      console.warn(`Value does not exist in options for "${name}"`, formValue)
    }

    return optionExists ? String(formValue.value) : undefined
  }, [formValue, name, options])

  // Sets initial value if present and validates it against options
  useEffect(() => {
    const currentValue = form.getFieldValue(name) as DefaultOptionType | undefined

    if (options.length === 0) {
      if (currentValue !== undefined) {
        form.setFieldValue(name, undefined)
      }

      return
    }

    const valueToCheck = currentValue ?? initialValue
    if (!valueToCheck) {
      return
    }

    const optionExists = options.some(({ value }) => String(value) === String(valueToCheck.value))

    if (optionExists) {
      if (!currentValue) {
        form.setFieldValue(name, valueToCheck)
      }
    } else {
      console.warn(`Initial value does not exist in options for "${name}"`, initialValue)
      form.setFieldValue(name, undefined)
    }
  }, [options, initialValue, form, name])

  const handleChange = (_: string | undefined, option?: DefaultOptionType) => {
    if (!option) {
      form.setFieldsValue({ [name]: undefined })
      return
    }

    form.setFieldsValue({ [name]: { label: option.label as string, value: option.value } })
  }

  if (!dependFieldValue) {
    return <Select disabled options={[]} />
  }

  return (
    <Select
      allowClear
      onChange={handleChange}
      options={options}
      suffixIcon={isLoading ? <Spin indicator={<LoadingOutlined />} size='small' /> : null}
      value={value}
    />
  )
}

export default AsyncSelect
