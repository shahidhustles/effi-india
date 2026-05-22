import { ShieldAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import { signOut } from "../actions"

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-6">
      <Card className="w-full max-w-md border-[#D9E3EA] shadow-sm">
        <CardHeader>
          <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-[#FCE7E7] text-[#B42318]">
            <ShieldAlert className="size-5" />
          </div>
          <CardTitle className="text-xl text-[#1E293B]">Access restricted</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-[#64748B]">
          <p>Your email is signed in but is not on the dashboard admin allowlist.</p>
          <form action={signOut}>
            <Button variant="outline">Sign out</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
