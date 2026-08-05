import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/tools/license-layout/')({
  beforeLoad: () => {
    throw redirect({ to: '/tools/actual-size-layout', replace: true })
  },
})
