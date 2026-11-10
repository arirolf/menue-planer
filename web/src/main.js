import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { restoreColors } from './lib/theme.js'

// Before the first paint, so there's no flash of the default colors
restoreColors()

const app = mount(App, {
  target: document.getElementById('app'),
})

export default app
