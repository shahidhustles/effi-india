"use client"

/* eslint-disable @next/next/no-img-element */

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  Camera,
  CheckCircle2,
  CircleDot,
  Clock3,
  Filter,
  ImageIcon,
  LogOut,
  MapPin,
  Search,
  UsersRound,
} from "lucide-react"

import { updateComplaintStatus, signOut } from "@/app/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type {
  AdminComplaintRow,
  ComplaintCategory,
  ComplaintDetail,
  ComplaintStatus,
} from "@/lib/dashboard/types"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type DashboardBoardProps = {
  initialRows: AdminComplaintRow[]
  adminEmail: string
}

type CategoryFilter = "all" | ComplaintCategory
type StatusFilter = "all" | ComplaintStatus

const categoryLabels: Record<ComplaintCategory, string> = {
  SANITATION: "Sanitation",
  POTHOLE: "Pothole",
  POWER_OUTAGE: "Power outage",
}

const statusLabels: Record<ComplaintStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function getGoogleMapsSearchUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
}

function getGoogleMapsEmbedUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps?q=${latitude},${longitude}&z=16&output=embed`
}

function statusClass(status: ComplaintStatus) {
  if (status === "resolved") {
    return "border-[#BFE3C7] bg-[#E8F5EC] text-[#166534]"
  }

  if (status === "in_progress") {
    return "border-[#F4D28F] bg-[#FFF4D9] text-[#9A6700]"
  }

  return "border-[#B8CBD6] bg-[#bbd6e1] text-[#185079]"
}

function StatusIcon({ status }: { status: ComplaintStatus }) {
  if (status === "resolved") {
    return <CheckCircle2 className="size-3.5" />
  }

  if (status === "in_progress") {
    return <Clock3 className="size-3.5" />
  }

  return <CircleDot className="size-3.5" />
}

function matchesSearch(row: AdminComplaintRow, search: string) {
  const query = search.trim().toLowerCase()

  if (!query) {
    return true
  }

  return [
    row.ticket_number,
    row.summary,
    row.problem_type,
    row.caller_name ?? "",
    categoryLabels[row.category],
  ]
    .join(" ")
    .toLowerCase()
    .includes(query)
}

function DetailSkeleton() {
  return (
    <div className="space-y-4 px-4">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

export function DashboardBoard({ initialRows, adminEmail }: DashboardBoardProps) {
  const router = useRouter()
  const [search, setSearch] = React.useState("")
  const [category, setCategory] = React.useState<CategoryFilter>("all")
  const [status, setStatus] = React.useState<StatusFilter>("all")
  const [priorityOnly, setPriorityOnly] = React.useState(false)
  const [evidenceOnly, setEvidenceOnly] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<ComplaintDetail | null>(null)
  const [detailError, setDetailError] = React.useState<string | null>(null)
  const [isDetailLoading, setIsDetailLoading] = React.useState(false)
  const [isStatusPending, startStatusTransition] = React.useTransition()
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const detailRequestId = React.useRef(0)
  const rows = initialRows

  React.useEffect(() => {
    const supabase = createClient()
    const refresh = () => {
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current)
      }

      refreshTimer.current = setTimeout(() => {
        router.refresh()
      }, 350)
    }

    const channel = supabase
      .channel("admin-dashboard-complaints")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "complaints" },
        refresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "complaint_locations" },
        refresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "complaint_evidence" },
        refresh
      )
      .subscribe()

    return () => {
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current)
      }
      supabase.removeChannel(channel)
    }
  }, [router])

  function openComplaint(id: string) {
    const requestId = detailRequestId.current + 1
    detailRequestId.current = requestId
    setSelectedId(id)
    setDetail(null)
    setIsDetailLoading(true)
    setDetailError(null)

    fetch(`/api/complaints/${id}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null)
          throw new Error(body?.error ?? "Could not load complaint")
        }
        return response.json() as Promise<ComplaintDetail>
      })
      .then((nextDetail) => {
        if (detailRequestId.current === requestId) {
          setDetail(nextDetail)
        }
      })
      .catch((error) => {
        if (detailRequestId.current === requestId) {
          setDetailError(error.message)
        }
      })
      .finally(() => {
        if (detailRequestId.current === requestId) {
          setIsDetailLoading(false)
        }
      })
  }

  const filteredRows = React.useMemo(() => {
    return rows.filter((row) => {
      if (!matchesSearch(row, search)) {
        return false
      }

      if (category !== "all" && row.category !== category) {
        return false
      }

      if (status !== "all" && row.status !== status) {
        return false
      }

      if (priorityOnly && !row.is_cluster_priority) {
        return false
      }

      if (evidenceOnly && !row.photo_url) {
        return false
      }

      return true
    })
  }, [category, evidenceOnly, priorityOnly, rows, search, status])

  const selectedRow = rows.find((row) => row.id === selectedId) ?? null

  const counts = React.useMemo(() => {
    return {
      open: rows.filter((row) => row.status === "open").length,
      priority: rows.filter((row) => row.is_cluster_priority && row.status !== "resolved").length,
      evidence: rows.filter((row) => row.photo_url).length,
    }
  }, [rows])

  function handleStatusChange(nextStatus: ComplaintStatus) {
    if (!selectedId) {
      return
    }

    startStatusTransition(async () => {
      await updateComplaintStatus(selectedId, nextStatus)
      setDetail((currentDetail) =>
        currentDetail ? { ...currentDetail, status: nextStatus } : currentDetail
      )
      router.refresh()
    })
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] text-[#1E293B]">
      <header className="border-b border-[#D9E3EA] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold">Effi India Admin</h1>
            <p className="text-sm text-[#64748B]">{adminEmail}</p>
          </div>
          <form action={signOut}>
            <Button variant="outline" size="sm">
              <LogOut className="size-4" />
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-[#D9E3EA] bg-white p-4">
            <div className="flex items-center gap-2 text-sm text-[#64748B]">
              <CircleDot className="size-4" />
              Open
            </div>
            <div className="mt-2 text-2xl font-semibold">{counts.open}</div>
          </div>
          <div className="rounded-md border border-[#D9E3EA] bg-white p-4">
            <div className="flex items-center gap-2 text-sm text-[#64748B]">
              <UsersRound className="size-4" />
              Escalated
            </div>
            <div className="mt-2 text-2xl font-semibold">{counts.priority}</div>
          </div>
          <div className="rounded-md border border-[#D9E3EA] bg-white p-4">
            <div className="flex items-center gap-2 text-sm text-[#64748B]">
              <Camera className="size-4" />
              Evidence
            </div>
            <div className="mt-2 text-2xl font-semibold">{counts.evidence}</div>
          </div>
        </div>

        <div className="mb-4 rounded-md border border-[#D9E3EA] bg-white p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#64748B]" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
                placeholder="Search ticket, caller, or summary"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Select value={category} onValueChange={(value) => setCategory(value as CategoryFilter)}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  <SelectItem value="SANITATION">Sanitation</SelectItem>
                  <SelectItem value="POTHOLE">Pothole</SelectItem>
                  <SelectItem value="POWER_OUTAGE">Power outage</SelectItem>
                </SelectContent>
              </Select>

              <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant={priorityOnly ? "default" : "outline"}
                onClick={() => setPriorityOnly((value) => !value)}
                className={priorityOnly ? "bg-[#185079] hover:bg-[#16476c]" : ""}
              >
                <Filter className="size-4" />
                Escalated
              </Button>
              <Button
                variant={evidenceOnly ? "default" : "outline"}
                onClick={() => setEvidenceOnly((value) => !value)}
                className={evidenceOnly ? "bg-[#185079] hover:bg-[#16476c]" : ""}
              >
                <ImageIcon className="size-4" />
                Evidence
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-[#D9E3EA] bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#F8FAFC]">
                <TableHead>Ticket</TableHead>
                <TableHead>Problem</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length ? (
                filteredRows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => openComplaint(row.id)}
                  >
                    <TableCell className="font-medium">{row.ticket_number}</TableCell>
                    <TableCell>
                      <div className="max-w-lg">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{categoryLabels[row.category]}</span>
                          {row.photo_url ? (
                            <Camera className="size-4 text-[#4e97bb]" />
                          ) : null}
                        </div>
                        <p className="line-clamp-2 text-sm text-[#64748B]">{row.summary}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {row.is_cluster_priority ? (
                        <Badge className="border-[#F4D28F] bg-[#FFF4D9] text-[#9A6700]">
                          {row.cluster_count} reports
                        </Badge>
                      ) : (
                        <span className="text-sm text-[#64748B]">Standard</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("gap-1 border", statusClass(row.status))}>
                        <StatusIcon status={row.status} />
                        {statusLabels[row.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.latitude != null && row.longitude != null ? (
                        <span className="flex items-center gap-1 text-sm text-[#64748B]">
                          <MapPin className="size-4" />
                          {row.latitude.toFixed(4)}, {row.longitude.toFixed(4)}
                        </span>
                      ) : (
                        <span className="text-sm text-[#64748B]">Missing</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-[#64748B]">
                      {formatTime(row.created_at)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-28 text-center text-[#64748B]">
                    No complaints match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <Sheet
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) {
            detailRequestId.current += 1
            setSelectedId(null)
            setDetail(null)
            setDetailError(null)
            setIsDetailLoading(false)
          }
        }}
      >
        <SheetContent className="w-full overflow-y-auto border-[#D9E3EA] sm:max-w-xl">
          <SheetHeader className="border-b border-[#D9E3EA]">
            <SheetTitle>
              {selectedRow?.ticket_number ?? "Complaint"}
            </SheetTitle>
            <SheetDescription>
              {selectedRow ? `${categoryLabels[selectedRow.category]} · ${formatTime(selectedRow.created_at)}` : ""}
            </SheetDescription>
          </SheetHeader>

          {isDetailLoading ? <DetailSkeleton /> : null}

          {detailError ? (
            <div className="mx-4 rounded-md border border-[#FCE7E7] bg-[#FCE7E7] p-4 text-sm text-[#B42318]">
              {detailError}
            </div>
          ) : null}

          {detail ? (
            <div className="space-y-6 px-4 pb-6">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={cn("gap-1 border", statusClass(detail.status))}>
                    <StatusIcon status={detail.status} />
                    {statusLabels[detail.status]}
                  </Badge>
                  {selectedRow?.is_cluster_priority ? (
                    <Badge className="border-[#F4D28F] bg-[#FFF4D9] text-[#9A6700]">
                      {selectedRow.cluster_count} local reports
                    </Badge>
                  ) : null}
                </div>
                <p className="text-base font-medium">{detail.summary}</p>
                <p className="text-sm leading-6 text-[#64748B]">{detail.description}</p>
              </div>

              <Separator />

              <div className="grid gap-3 text-sm">
                <div className="grid grid-cols-[120px_1fr] gap-3">
                  <span className="text-[#64748B]">Caller</span>
                  <span>{detail.caller_name ?? "Not captured"}</span>
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-3">
                  <span className="text-[#64748B]">Problem type</span>
                  <span>{detail.problem_type}</span>
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-3">
                  <span className="text-[#64748B]">Language</span>
                  <span>{detail.language}</span>
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-3">
                  <span className="text-[#64748B]">Location</span>
                  <span>
                    {detail.location
                      ? `${detail.location.latitude.toFixed(6)}, ${detail.location.longitude.toFixed(6)}`
                      : "Missing"}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-sm font-medium">Status</span>
                <Select
                  value={detail.status}
                  onValueChange={(value) => handleStatusChange(value as ComplaintStatus)}
                  disabled={isStatusPending}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-medium">Map</h2>
                  {detail.location ? (
                    <a
                      href={getGoogleMapsSearchUrl(
                        detail.location.latitude,
                        detail.location.longitude
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-medium text-[#185079] hover:text-[#16476c]"
                    >
                      <MapPin className="size-4" />
                      Open in Google Maps
                    </a>
                  ) : null}
                </div>
                {detail.location ? (
                  <div className="overflow-hidden rounded-md border border-[#D9E3EA] bg-white">
                    <iframe
                      title="Complaint location map"
                      src={getGoogleMapsEmbedUrl(
                        detail.location.latitude,
                        detail.location.longitude
                      )}
                      className="h-64 w-full border-0"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                ) : (
                  <div className="rounded-md border border-[#D9E3EA] p-4 text-sm text-[#64748B]">
                    Location coordinates are not available for this complaint.
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-3">
                <h2 className="text-sm font-medium">Evidence</h2>
                {detail.evidence.length ? (
                  <div className="grid gap-3">
                    {detail.evidence.map((item) => (
                      <a
                        key={item.id}
                        href={item.public_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-md border border-[#D9E3EA]"
                      >
                        <img
                          src={item.public_url}
                          alt="Complaint evidence"
                          className="aspect-video w-full object-cover"
                        />
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-[#D9E3EA] p-4 text-sm text-[#64748B]">
                    No photo evidence for this complaint.
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-3">
                <h2 className="text-sm font-medium">Transcript</h2>
                {detail.transcript.length ? (
                  <div className="space-y-2">
                    {detail.transcript.map((turn) => (
                      <div
                        key={turn.id}
                        className="rounded-md border border-[#D9E3EA] bg-[#F8FAFC] p-3"
                      >
                        <div className="mb-1 text-xs font-medium capitalize text-[#185079]">
                          {turn.speaker}
                        </div>
                        <p className="text-sm leading-6 text-[#1E293B]">{turn.content}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-[#D9E3EA] p-4 text-sm text-[#64748B]">
                    Transcript has not been stored for this complaint.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </main>
  )
}
