import ReactDOM from 'react-dom/client'

import { installTelegramInspectionGuard } from '@shared/utils/telegram-inspection-guard'

import { App } from './app'

void installTelegramInspectionGuard()

const root = ReactDOM.createRoot(document.getElementById('root')!)
root.render(<App />)
