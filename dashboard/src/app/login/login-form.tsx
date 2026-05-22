"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { sendMagicLink, type LoginState } from "./actions"

const initialState: LoginState = {
  status: "idle",
  message: "",
}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button className="w-full bg-[#185079] hover:bg-[#16476c]" disabled={pending}>
      <Mail className="size-4" />
      {pending ? "Sending link" : "Send magic link"}
    </Button>
  )
}

export function LoginForm() {
  const [state, formAction] = useActionState(sendMagicLink, initialState)

  return (
    <Card className="w-full max-w-sm border-[#D9E3EA] shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl text-[#1E293B]">
          Admin sign in
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="admin@example.com"
              required
            />
          </div>
          <SubmitButton />
          {state.message ? (
            <p
              className={
                state.status === "error"
                  ? "text-sm text-[#B42318]"
                  : "text-sm text-[#166534]"
              }
            >
              {state.message}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  )
}
