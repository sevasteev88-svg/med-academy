import Link from "next/link";
import { getPublicConsentPageData } from "@/actions/consent-actions";
import PublicConsentPortalClient from "@/components/consents/PublicConsentPortalClient";

export const dynamic = "force-dynamic";

export default async function PublicConsentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getPublicConsentPageData(token);

  if ("error" in data && data.error) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-4">
        <div className="max-w-md w-full p-6 rounded-2xl bg-slate-900 border border-rose-500/30 text-center space-y-4">
          <div className="text-3xl">🔒</div>
          <h1 className="text-lg font-black text-white">
            Посилання на згоду недійсне або застаріло
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed">{data.error}</p>
          <div className="pt-2">
            <Link
              href="/privacy"
              className="text-xs font-semibold text-sky-400 hover:underline"
            >
              Переглянути Політику конфіденційності (/privacy) →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PublicConsentPortalClient
      rawToken={token}
      initialData={data as any}
    />
  );
}
