"use client";

import { useActionState } from "react";
import { loginAction, type AuthState } from "@/actions/auth-actions";
import Link from "next/link";
import Image from "next/image";
import Card, { Button, Input } from "@/components/ui/Card";

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState<AuthState, FormData>(loginAction, {});

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-5">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Image src="/logo-chr.png" alt="ФК Чорноморець" width={64} height={64} className="mx-auto rounded-full ring-2 ring-brand-blue/30 mb-4" />
          <h1 className="text-xl font-bold text-white">Медичний штаб</h1>
          <p className="text-xs text-slate-400 mt-1">ФК «Чорноморець» · Увійдіть до системи</p>
        </div>

        <Card className="p-6">
          <form action={formAction} className="space-y-4">
            <Input
              label="Email"
              name="email"
              type="email"
              required
              placeholder="doctor@chornomorets.com"
            />
            <Input
              label="Пароль"
              name="password"
              type="password"
              required
              placeholder="••••••"
            />

            {state.error && (
              <div className="text-sm text-status-danger bg-status-danger/10 border border-status-danger/20 rounded-lg px-3 py-2">
                {state.error}
              </div>
            )}

            <Button type="submit" isLoading={isPending} className="w-full">
              Увійти
            </Button>
          </form>
        </Card>

        <p className="text-center text-xs text-slate-500">
          Немає акаунту? <Link href="/register" className="text-brand-blue hover:text-brand-blue-light transition-colors">Зареєструватися</Link>
        </p>
      </div>
    </div>
  );
}
