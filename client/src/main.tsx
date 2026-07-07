import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('ROOT_ELEMENT_MISSING: expected #root in index.html')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
