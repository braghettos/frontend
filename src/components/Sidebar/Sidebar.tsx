import logo from '../../assets/images/logo_big.svg'
import { useConfigContext } from '../../context/ConfigContext'
import WidgetRenderer from '../WidgetRenderer'

import styles from './Sidebar.module.css'

const Sidebar = () => {
  const { config } = useConfigContext()

  return (
    <div className={styles.sidebar}>
      <div className={styles.logo}>
        <img
          alt='Krateo DevOpsApp'
          className={styles.image}
          height={48}
          src={logo}
        />
      </div>

      <div className={styles.content}>
        <WidgetRenderer key={'sidebar'} widgetEndpoint={config!.api.INIT} />
      </div>
    </div>
  )
}

export default Sidebar
