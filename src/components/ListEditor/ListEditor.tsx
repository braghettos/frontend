import { DeleteOutlined, PlusCircleOutlined } from '@ant-design/icons'
import { Button, Input, List, Space, Typography } from 'antd'
import { useEffect, useState } from 'react'

type ListEditorType = {
  data?: string[]
  onChange: (data: string[]) => void
}

const ListEditor = ({ data = [], onChange }: ListEditorType) => {
  const [currentString, setCurrentString] = useState<string>()
  const [list, setList] = useState<string[]>(data)

  useEffect(() => {
    setList(data)
  }, [data])

  const onAdd = () => {
    if (currentString && currentString !== '') {
      const newList = [...list, currentString]
      onChange(newList)
      setList(newList)
    }
  }

  const onRemove = (index: number) => {
    const newList = list.filter((_, i) => i !== index)
    onChange(newList)
    setList(newList)
  }

  return (
    <Space direction='vertical' style={{ width: '100%' }}>
      <Space.Compact style={{ width: '100%' }}>
        <Input onChange={(value) => setCurrentString(value.target.value)} />
        <Button onClick={onAdd} type='primary'>
          <PlusCircleOutlined />
        </Button>
      </Space.Compact>
      <List
        dataSource={list}
        renderItem={(item, index) => (
          <List.Item actions={[<Button icon={<DeleteOutlined />} onClick={() => onRemove(index)} shape='circle' type='text' />]}>
            <Typography.Text>{item}</Typography.Text>
          </List.Item>
        )}
      />
    </Space>
  )
}

export default ListEditor
