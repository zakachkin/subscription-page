import {
    APP_CONFIG_ROUTE_LEADING_PATH,
    SubscriptionPageRawConfigSchema
} from '@remnawave/subscription-page-types'
import { GetSubscriptionInfoByShortUuidCommand } from '@remnawave/backend-contract'
import { Outlet } from 'react-router'
import { useLayoutEffect } from 'react'
import consola from 'consola/browser'
import { ofetch } from 'ofetch'

import {
    useSubscriptionInfoStoreActions,
    useSubscriptionInfoStoreInfo
} from '@entities/subscription-info-store'
import { useAppConfigStoreActions, useIsConfigLoaded } from '@entities/app-config-store'
import { LoadingScreen } from '@shared/ui'

import classes from './root.module.css'

function parseBase64Json<T>(value: string): T {
    const binary = atob(value)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    const json = new TextDecoder('utf-8').decode(bytes)

    return JSON.parse(json) as T
}

export function RootLayout() {
    const subscriptionActions = useSubscriptionInfoStoreActions()
    const configActions = useAppConfigStoreActions()

    const { subscription } = useSubscriptionInfoStoreInfo()
    const isConfigLoaded = useIsConfigLoaded()

    useLayoutEffect(() => {
        const subPageDiv = document.getElementById('sbpg')
        let hasEmbeddedConfig = false

        if (subPageDiv) {
            const panelData = subPageDiv.dataset.panel
            const configData = subPageDiv.dataset.config

            if (panelData) {
                try {
                    const decodedData = parseBase64Json<GetSubscriptionInfoByShortUuidCommand.Response>(
                        panelData
                    )

                    subscriptionActions.setSubscriptionInfo({
                        subscription: decodedData.response
                    })
                } catch (error) {
                    consola.error('Failed to parse embedded subscription data:', error)
                }
            }

            if (configData) {
                hasEmbeddedConfig = true

                try {
                    const decodedConfig = parseBase64Json<unknown>(configData)
                    const parsedConfig = SubscriptionPageRawConfigSchema.safeParse(decodedConfig)

                    if (!parsedConfig.success) {
                        consola.error('Failed to parse embedded app config:', parsedConfig.error)
                    } else {
                        configActions.setConfig(parsedConfig.data)
                    }
                } catch (error) {
                    consola.error('Failed to parse embedded app config:', error)
                }
            }

            subPageDiv.remove()
        }

        const fetchConfig = async () => {
            try {
                const tempConfig = await ofetch<unknown>(
                    `${APP_CONFIG_ROUTE_LEADING_PATH}?v=${Date.now()}`,
                    {
                        parseResponse: (response) => JSON.parse(response)
                    }
                )

                const parsedConfig =
                    await SubscriptionPageRawConfigSchema.safeParseAsync(tempConfig)

                if (!parsedConfig.success) {
                    consola.error('Failed to parse app config:', parsedConfig.error)
                    return
                }

                configActions.setConfig(parsedConfig.data)
            } catch (error) {
                consola.error('Failed to fetch app config:', error)
            }
        }

        if (!hasEmbeddedConfig) {
            fetchConfig()
        }
    }, [])

    if (!isConfigLoaded || !subscription) {
        return (
            <div className={classes.root}>
                <div className="animated-background"></div>
                <div className={classes.content}>
                    <main className={classes.main}>
                        <LoadingScreen height="100vh" />
                    </main>
                </div>
            </div>
        )
    }

    return (
        <div className={classes.root}>
            <div className="animated-background"></div>
            <div className={classes.content}>
                <main className={classes.main}>
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
