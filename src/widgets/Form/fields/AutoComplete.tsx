import { LoadingOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import type { FormInstance } from 'antd'
import { AutoComplete as AntDAutoComplete, Form, Spin } from 'antd'
import useApp from 'antd/es/app/useApp'
import type { DefaultOptionType } from 'antd/es/select'
import debounce from 'lodash/debounce'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useConfigContext } from '../../../context/ConfigContext'
import type { ResourcesRefs } from '../../../types/Widget'
import type { FormWidgetData } from '../Form'

import { getOptionsFromResourceRefId } from './utils'

interface AutoCompleteProps {
  data: NonNullable<FormWidgetData['autocomplete']>[number]
  form: FormInstance
  resourcesRefs: ResourcesRefs
  initialValue?: DefaultOptionType | undefined
  options?: DefaultOptionType[] | undefined
}

const AutoComplete = ({ data, form, initialValue, options, resourcesRefs }: AutoCompleteProps) => {
  const { notification } = useApp()
  const { config } = useConfigContext()
  const { extra, name, resourceRefId } = data

  const [searchValue, setSearchValue] = useState<string>('')
  const [debouncedValue, setDebouncedValue] = useState<string>('')
  const [inputValue, setInputValue] = useState<string>('')

  const formValue = Form.useWatch<DefaultOptionType | undefined>(name, form)

  const initialValueAppliedRef = useRef(false)
  const isTypingRef = useRef(false)

  const queryValue = useMemo(() => debouncedValue || initialValue?.value, [debouncedValue, initialValue])

  const debouncedUpdate = useMemo(() => debounce((val: string) => setDebouncedValue(val), 500), [])

  useEffect(() => {
    debouncedUpdate(searchValue)
    return () => debouncedUpdate.cancel()
  }, [searchValue, debouncedUpdate])

  const { data: queriedOptions = [], isLoading } = useQuery<DefaultOptionType[]>({
    enabled: !!(queryValue && resourceRefId && config),
    queryFn: () =>
      getOptionsFromResourceRefId(queryValue as string, resourceRefId, resourcesRefs, extra?.key, notification, config),
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey: ['autocomplete-options', resourceRefId, queryValue, extra?.key],
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  })

  const finalOptions = useMemo(() => options ?? queriedOptions, [options, queriedOptions])

  // Apply initial value once
  useEffect(() => {
    if (!initialValue || initialValueAppliedRef.current) {
      return
    }

    if (form.isFieldTouched(name)) {
      initialValueAppliedRef.current = true
      return
    }

    form.setFieldsValue({ [name]: initialValue })
    setInputValue(initialValue.label as string)

    initialValueAppliedRef.current = true
  }, [initialValue, form, name])

  // Sync inputValue with formValue only if user is not typing
  useEffect(() => {
    if (isTypingRef.current) {
      return
    }

    if (!formValue || typeof formValue !== 'object' || !('label' in formValue)) {
      setInputValue('')
      return
    }

    const { label } = formValue
    setInputValue(typeof label === 'string' ? label : '')
  }, [formValue])

  // Validate current value silently
  useEffect(() => {
    if (!initialValueAppliedRef.current) {
      return
    }

    const currentValue = form.getFieldValue(name) as DefaultOptionType | undefined
    if (!currentValue || finalOptions.length === 0) {
      return
    }

    const optionExists = finalOptions.some(({ value }) => String(value) === String(currentValue.value))
    if (!optionExists) {
      form.setFieldsValue({ [name]: undefined })
    }
  }, [finalOptions, form, name])

  const handleSelect = (_: string, { label, value }: DefaultOptionType) => {
    isTypingRef.current = false
    form.setFieldsValue({ [name]: { label: label as string, value } })
    setInputValue(label as string)
  }

  const handleChange = (val: string) => {
    isTypingRef.current = true
    setInputValue(val)
    setSearchValue(val)
  }

  return (
    <AntDAutoComplete
      filterOption={(inputValue, option) => {
        if (!option || typeof option.label !== 'string') { return false }
        return option.label.toUpperCase().includes(inputValue.toUpperCase())
      }}
      onChange={handleChange}
      onSelect={handleSelect}
      options={finalOptions}
      placeholder='Start typing...'
      suffixIcon={isLoading ? <Spin indicator={<LoadingOutlined />} size='small' /> : null}
      value={searchValue || inputValue}
    />
  )
}

export default AutoComplete
