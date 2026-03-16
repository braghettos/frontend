import { ConfigProvider } from 'antd'
import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App.tsx'
import PALETTE from './theme/palette.ts'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider theme={{ token: {
      colorBgBase: PALETTE.panelbg,
      colorBorder: PALETTE.border,
      colorError: PALETTE.error,
      colorInfo: PALETTE.info,
      colorLink: PALETTE.primary,
      colorPrimary: PALETTE.primary,
      colorSuccess: PALETTE.success,
      colorSuccessBg: PALETTE.success,
      colorTextBase: PALETTE.text,
      colorWarning: PALETTE.warning,
      colorWhite: PALETTE.light,
      fontFamily: 'Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif',
    } }}>
      <App />
    </ConfigProvider>
  </React.StrictMode>
)
