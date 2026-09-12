import type { IconProp } from '@fortawesome/fontawesome-svg-core'

import { useThemeMode } from '../../context/ThemeModeContext'
import HeaderIconButton from '../HeaderIconButton'

/** Header control that toggles the app between light and dark color modes. */
const ThemeToggle = () => {
  const { mode, toggle } = useThemeMode()
  const isDark = mode === 'dark'

  return (
    // #80 §0.10: `fa-sun` at 16px read as a gear/cog — the conventional half-stroke "contrast"
    // glyph is an unambiguous theme toggle, and the tooltip conveys the direction.
    // #80 §0.7: geometry now comes from HeaderIconButton, not an inline 36×36 that happened to
    // match the bell's CSS-module 36×36 by coincidence.
    <HeaderIconButton
      ariaLabel='Toggle color theme'
      icon={['fas', 'circle-half-stroke'] as IconProp}
      onClick={toggle}
      tooltip={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    />
  )
}

export default ThemeToggle
