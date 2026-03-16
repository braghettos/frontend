import { useMutation, useQuery } from '@tanstack/react-query'
import { Card, Divider, Result, Skeleton } from 'antd'
import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router'

import logo from '../../assets/images/logo_big.svg'
import { useConfigContext } from '../../context/ConfigContext'
import useCatchError from '../../hooks/useCatchError'

import styles from './Login.module.css'
import type { AuthModeType, FormType, LoginFormType } from './Login.types'
import LoginForm from './LoginForm'
import SocialLogin from './SocialLogin'

const Login = () => {
  const navigate = useNavigate()
  const { catchError } = useCatchError()
  const { config } = useConfigContext()

  const authUrl = `${config!.api.AUTHN_API_BASE_URL}/strategies`

  const {
    data: methods,
    error: isMethodsError,
    isLoading: isMethodLoading,
  } = useQuery({
    queryFn: async () => {
      const res = await fetch(authUrl)
      return await res.json() as AuthModeType[]
    },
    queryKey: ['methods', authUrl],
  })

  const {
    error: isLoginError,
    isPending: isLoginLoading,
    mutateAsync: login,
  } = useMutation({
    mutationFn: async (credentials: { username: string; password: string; path: string }) => {
      const authUrl = `${config!.api.AUTHN_API_BASE_URL}${credentials.path}`

      const response = await fetch(authUrl, {
        headers: {
          Authorization: `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`,
        },
        method: 'GET',
      })

      if (response.ok) {
        const data = await response.json() as AuthModeType[]
        localStorage.setItem('K_user', JSON.stringify(data))
        void navigate('/')
      } else {
        catchError({
          message: `Login error (${response.status}: ${response.statusText})`,
          status: response.status,
        }, 'notification')
      }
    },
  })

  const onFormSubmit = useCallback(async (body: LoginFormType, type: FormType) => {
    const { password, username } = body
    const method = methods?.find(({ kind }) => kind === type)

    if (username && password && method?.path) {
      await login({ password, path: method.path, username })
    } else {
      catchError({ data: { message: 'Wrong username or password, try again with different credentials' }, status: 403 })
    }
  }, [catchError, login, methods])

  const content = useMemo(() => {
    if (isMethodLoading) {
      return <Skeleton active />
    }

    if (isMethodsError) {
      return <Result status='error' subTitle='Unable to retrieve authentication methods' title="Ops! Something didn't work" />
    }

    if (isLoginError) {
      return <Result status='error' subTitle='Error during the login operation' title="Ops! Something didn't work" />
    }

    if (methods) {
      if (methods.length === 0) {
        return (
          <Result
            status='warning'
            subTitle='Please create some authentication methods and try again'
            title='There are no authentication methods'
          />
        )
      }

      return methods.map((method, index) => {
        const { kind } = method

        if (kind === 'basic' || kind === 'ldap') {
          return (
            <div key={`login_${index}`}>
              <LoginForm
                isLoading={isLoginLoading}
                method={method}
                onSubmit={(values) => { void onFormSubmit(values, kind) }}
              />
              {((index + 1) < methods?.length) && <Divider plain>OR</Divider> }
            </div>
          )
        }

        return <SocialLogin key={`login_${index}`} method={method} />
      })
    }
  }, [isMethodLoading, isMethodsError, isLoginError, methods, isLoginLoading, onFormSubmit])

  return (
    <div className={styles.login}>
      <aside className={styles.aside}>
        <img alt='Krateo | PlatformOps' className={styles.image} src={logo} />
      </aside>
      <section className={styles.section}>
        <Card
          className={styles.card}
          classNames={{ body: styles.body, header: styles.header, title: styles.title }}
          title={<span className={styles.title}>Welcome back</span>}
          variant={'borderless'}
        >
          {content}
        </Card>
      </section>
    </div>
  )
}

export default Login
