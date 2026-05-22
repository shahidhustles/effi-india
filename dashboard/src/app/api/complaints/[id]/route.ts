import { NextResponse, type NextRequest } from "next/server"

import { requireAdmin } from "@/lib/dashboard/auth"
import { getComplaintDetail } from "@/lib/dashboard/data"

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  await requireAdmin()

  const { id } = await context.params

  try {
    const detail = await getComplaintDetail(id)
    return NextResponse.json(detail)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load complaint detail",
      },
      { status: 500 }
    )
  }
}
