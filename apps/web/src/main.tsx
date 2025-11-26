import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  // StrictMode disabled temporarily for WASM compatibility
  // <React.StrictMode>
    <App />
  // </React.StrictMode>,
)
