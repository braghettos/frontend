import { App, Result } from 'antd'
import { useCallback } from 'react'

export interface CatchError {
  name?: string
  data?: {
    message?: string
  }
  message?: string
  status?: number
  code?: number
}

const useCatchError = () => {
  const { notification } = App.useApp()

  const catchError = useCallback((error?: CatchError, type: 'result' | 'notification' = 'notification') => {
    let message: string = error?.message || "Ops! Something didn't work"
    let description: React.ReactNode = 'Unable to complete the operation, please try later'

    if ((error?.status === 401 || error?.code === 401)) {
      description = error?.data?.message || 'You are not authorized to access this page.'
      window.location.replace('/login')
    } else if (error?.status === 500 || error?.code === 500) {
      message = 'Internal Server Error'
      description = error?.data?.message || 'The server encountered an unexpected condition.'
    } else if ((/^4\d{2}$/).test(String(error?.status)) || (/^4\d{2}$/).test(String(error?.code))) {
      if (error?.data?.message) {
        message = 'There was an error processing your request'
      }
      description = error?.data?.message || 'Please check your input or permissions.'
    }

    switch (type) {
      case 'result':
        return <Result status='error' subTitle={description} title={message} />
      case 'notification':
      default:
        notification.error({
          description,
          duration: 4,
          key: 'unique',
          message,
        })
    }
  }, [notification])

  return { catchError }
}

export default useCatchError
