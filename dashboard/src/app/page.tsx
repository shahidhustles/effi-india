import { requireAdmin } from "@/lib/dashboard/auth"
import { getAdminComplaintFeed } from "@/lib/dashboard/data"

import { DashboardBoard } from "@/components/dashboard/dashboard-board"

export const dynamic = "force-dynamic"

export default async function Home() {
  const user = await requireAdmin()
  const complaints = await getAdminComplaintFeed()

  return (
    <DashboardBoard
      initialRows={complaints}
      adminEmail={user.email ?? "admin"}
    />
  )
}
