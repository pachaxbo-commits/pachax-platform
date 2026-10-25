import React from 'react'
import ReactDOM from 'react-dom/client'
import '../index.css'
import { DemoOnlyApp } from './DemoOnlyApp'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DemoOnlyApp />
  </React.StrictMode>,
)
