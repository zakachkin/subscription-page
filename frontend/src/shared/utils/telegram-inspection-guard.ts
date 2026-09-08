type TelegramWebApp = {
    initData?: string
    isActive?: boolean
    platform?: string
    close?: () => void
    disableClosingConfirmation?: () => void
    showAlert?: (message: string, callback?: () => void) => void
}

type TelegramWindow = Window & {
    Telegram?: {
        WebApp?: TelegramWebApp
    }
}

const TELEGRAM_SDK_URL = 'https://telegram.org/js/telegram-web-app.js?63'
const INSPECTION_MESSAGE = 'Произошёл сбой в WebApp.'
const DEBUGGER_DELAY_THRESHOLD_MS = 180
const VIEWPORT_DELTA_THRESHOLD_PX = 160
const CHECK_INTERVAL_MS = 1250

const DESKTOP_PLATFORMS = new Set(['macos', 'tdesktop', 'web', 'weba', 'webk', 'windows'])

function hasTelegramLaunchParams() {
    const locationData = `${window.location.search}${window.location.hash}`

    return /(?:^|[?#&])tgWebApp(?:Data|Version|Platform|ThemeParams)=/.test(locationData)
}

function getTelegramWebApp() {
    return (window as TelegramWindow).Telegram?.WebApp
}

async function loadTelegramSdk() {
    if (getTelegramWebApp()) {
        return
    }

    await new Promise<void>((resolve) => {
        const existingScript = document.querySelector<HTMLScriptElement>(
            `script[src^="https://telegram.org/js/telegram-web-app.js"]`
        )

        if (existingScript) {
            if (getTelegramWebApp()) {
                resolve()
                return
            }

            existingScript.addEventListener('load', () => resolve(), { once: true })
            existingScript.addEventListener('error', () => resolve(), { once: true })
            return
        }

        const script = document.createElement('script')
        script.src = TELEGRAM_SDK_URL
        script.async = true
        script.addEventListener('load', () => resolve(), { once: true })
        script.addEventListener('error', () => resolve(), { once: true })
        document.head.appendChild(script)
    })
}

function isDesktopTelegram(platform?: string) {
    return platform ? DESKTOP_PLATFORMS.has(platform.toLowerCase()) : false
}

function isDevToolsShortcut(event: KeyboardEvent) {
    const key = event.key.toUpperCase()

    if (event.key === 'F12') {
        return true
    }

    return (event.ctrlKey || event.metaKey) && event.shiftKey && ['C', 'I', 'J'].includes(key)
}

function debuggerWasPaused() {
    const startedAt = performance.now()

    // Intentionally pauses only when a debugger is attached and breakpoints are enabled.
    // eslint-disable-next-line no-debugger
    debugger

    return performance.now() - startedAt > DEBUGGER_DELAY_THRESHOLD_MS
}

export async function installTelegramInspectionGuard() {
    if (!hasTelegramLaunchParams()) {
        return
    }

    const handleContextMenu = (event: MouseEvent) => {
        event.preventDefault()
        event.stopImmediatePropagation()
    }

    document.addEventListener('contextmenu', handleContextMenu, true)

    await loadTelegramSdk()

    const webApp = getTelegramWebApp()

    if (!webApp || typeof webApp.close !== 'function') {
        window.addEventListener(
            'pagehide',
            () => document.removeEventListener('contextmenu', handleContextMenu, true),
            { once: true }
        )
        return
    }

    const hasTelegramSession = Boolean(webApp.initData) || hasTelegramLaunchParams()

    if (!hasTelegramSession) {
        document.removeEventListener('contextmenu', handleContextMenu, true)
        return
    }

    let isClosing = false
    let viewportHits = 0

    const initialWidthGap = Math.max(0, window.outerWidth - window.innerWidth)
    const initialHeightGap = Math.max(0, window.outerHeight - window.innerHeight)

    const closeWebApp = () => {
        try {
            webApp.disableClosingConfirmation?.()
            webApp.close?.()
        } finally {
            document.documentElement.style.visibility = 'hidden'
        }
    }

    const triggerInspectionFailure = () => {
        if (isClosing) {
            return
        }

        isClosing = true
        document.documentElement.style.visibility = 'hidden'

        try {
            if (typeof webApp.showAlert === 'function') {
                webApp.showAlert(INSPECTION_MESSAGE, closeWebApp)
                return
            }
        } catch {
            // Fall through to a direct close for older or unsupported clients.
        }

        closeWebApp()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
        if (!isDevToolsShortcut(event)) {
            return
        }

        event.preventDefault()
        event.stopImmediatePropagation()
        triggerInspectionFailure()
    }

    window.addEventListener('keydown', handleKeyDown, true)

    const inspectionTimer = window.setInterval(() => {
        if (isClosing || document.visibilityState !== 'visible' || webApp.isActive === false) {
            return
        }

        if (debuggerWasPaused()) {
            triggerInspectionFailure()
            return
        }

        if (!isDesktopTelegram(webApp.platform)) {
            return
        }

        const widthGap = Math.max(0, window.outerWidth - window.innerWidth)
        const heightGap = Math.max(0, window.outerHeight - window.innerHeight)
        const viewportChangedByInspector =
            widthGap - initialWidthGap > VIEWPORT_DELTA_THRESHOLD_PX ||
            heightGap - initialHeightGap > VIEWPORT_DELTA_THRESHOLD_PX

        viewportHits = viewportChangedByInspector ? viewportHits + 1 : 0

        if (viewportHits >= 2) {
            triggerInspectionFailure()
        }
    }, CHECK_INTERVAL_MS)

    window.addEventListener(
        'pagehide',
        () => {
            window.clearInterval(inspectionTimer)
            window.removeEventListener('keydown', handleKeyDown, true)
            document.removeEventListener('contextmenu', handleContextMenu, true)
        },
        { once: true }
    )
}
