import {
    IconBrandDiscord,
    IconBrandTelegram,
    IconBrandVk,
    IconCopy,
    IconLink,
    IconMessageChatbot
} from '@tabler/icons-react'
import { ActionIcon, Button, Group, Image, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useClipboard } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { renderSVG } from 'uqr'
import { joinURL } from 'ufo'

import { constructSubscriptionUrl } from '@shared/utils/construct-subscription-url'
import { useSubscription } from '@entities/subscription-info-store'
import { vibrate } from '@shared/utils/vibrate'
import { useTranslation } from '@shared/hooks'

import classes from './subscription-link.module.css'

interface IProps {
    hideGetLink: boolean
    supportUrl: string
}

async function createHappLink(apiUrl: string, url: string): Promise<string> {
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
    })

    if (!response.ok) {
        throw new Error(`Happ link proxy responded with ${response.status}`)
    }

    const data: unknown = await response.json()

    if (data && typeof data === 'object') {
        const link = (data as Record<string, unknown>).link

        if (typeof link === 'string' && link.startsWith('happ://')) {
            return link
        }
    }

    throw new Error('Happ link proxy returned an invalid link')
}

export const SubscriptionLinkWidget = ({ supportUrl, hideGetLink }: IProps) => {
    const { t, baseTranslations } = useTranslation()
    const subscription = useSubscription()
    const clipboard = useClipboard({ timeout: 10000 })

    const subscriptionUrl = constructSubscriptionUrl(
        window.location.href,
        subscription.user.shortUuid
    )
    const happLinkApiUrl = joinURL(subscriptionUrl, 'happ-crypt5')

    const getHappLink = async () => createHappLink(happLinkApiUrl, subscriptionUrl)

    const showHappLinkError = (error: unknown) => {
        notifications.show({
            title: 'Happ link error',
            message: error instanceof Error ? error.message : 'Failed to create Happ link',
            color: 'red'
        })
    }

    const handleCopy = async (link?: string) => {
        try {
            const linkToCopy = link ?? (await getHappLink())

            notifications.show({
                title: t(baseTranslations.linkCopied),
                message: t(baseTranslations.linkCopiedToClipboard),
                color: 'cyan'
            })
            clipboard.copy(linkToCopy)
        } catch (error) {
            showHappLinkError(error)
        }
    }

    const renderSupportLink = (supportUrl: string) => {
        const iconConfig = {
            't.me': { icon: IconBrandTelegram, color: '#0088cc' },
            'discord.com': { icon: IconBrandDiscord, color: '#5865F2' },
            'vk.com': { icon: IconBrandVk, color: '#0077FF' }
        }

        const matchedPlatform = Object.entries(iconConfig).find(([domain]) =>
            supportUrl.includes(domain)
        )

        const { icon: Icon, color } = matchedPlatform
            ? matchedPlatform[1]
            : { icon: IconMessageChatbot, color: 'cyan' }

        return (
            <ActionIcon
                c={color}
                component="a"
                href={supportUrl}
                radius="md"
                rel="noopener noreferrer"
                size="xl"
                style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                }}
                target="_blank"
                variant="default"
            >
                <Icon />
            </ActionIcon>
        )
    }

    const handleGetLink = async () => {
        vibrate('tap')

        let happLink: string

        try {
            happLink = await getHappLink()
        } catch (error) {
            showHappLinkError(error)
            return
        }

        const subscriptionQrCode = renderSVG(happLink, {
            whiteColor: '#161B22',
            blackColor: '#22d3ee'
        })

        modals.open({
            centered: true,
            title: t(baseTranslations.getLink),
            classNames: {
                content: classes.modalContent,
                header: classes.modalHeader,
                title: classes.modalTitle
            },
            children: (
                <Stack align="center">
                    <Image
                        src={`data:image/svg+xml;utf8,${encodeURIComponent(subscriptionQrCode)}`}
                        style={{ borderRadius: 'var(--mantine-radius-md)' }}
                    />
                    <Text c="white" fw={600} size="lg" ta="center">
                        {t(baseTranslations.scanQrCode)}
                    </Text>
                    <Text c="dimmed" size="sm" ta="center">
                        {t(baseTranslations.scanQrCodeDescription)}
                    </Text>

                    <Button
                        fullWidth
                        leftSection={<IconCopy />}
                        onClick={() => handleCopy(happLink)}
                        radius="md"
                        variant="light"
                    >
                        {t(baseTranslations.copyLink)}
                    </Button>
                </Stack>
            )
        })
    }

    return (
        <Group gap="xs" ml="auto" wrap="nowrap">
            {!hideGetLink && (
                <ActionIcon
                    className={classes.actionIcon}
                    onClick={handleGetLink}
                    radius="md"
                    size="xl"
                    variant="default"
                >
                    <IconLink />
                </ActionIcon>
            )}

            {supportUrl !== '' && renderSupportLink(supportUrl)}
        </Group>
    )
}
