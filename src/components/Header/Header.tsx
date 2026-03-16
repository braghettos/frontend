import { Header as AntdHeader } from 'antd/es/layout/layout'

import Breadcrumb from '../Breadcrumb'
import Notifications from '../Notifications'
import UserMenu from '../UserMenu'

import styles from './Header.module.css'

type HeaderProps = {
  breadcrumbVisible: boolean
}

const Header = ({ breadcrumbVisible = true }: HeaderProps) => {
  return (
    <AntdHeader className={styles.header}>
      <div className={styles.content}>
        <div className={styles.left}>
          {breadcrumbVisible && <Breadcrumb />}
        </div>
        <div className={styles.right}>
          <Notifications />
          <UserMenu />
        </div>
      </div>
    </AntdHeader>
  )
}

export default Header
