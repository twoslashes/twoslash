// https://vitepress.dev/guide/custom-theme
import Theme from 'vitepress/theme'
import TwoslashFloatingVue from 'vitepress-plugin-twoslash/client'
import type { EnhanceAppContext } from 'vitepress'

import 'vitepress-plugin-twoslash/style.css'
import 'uno.css'
import './styles/index.scss'

export default {
  extends: Theme,
  enhanceApp({ app }: EnhanceAppContext) {
    app.use(TwoslashFloatingVue as any)
  },
}
