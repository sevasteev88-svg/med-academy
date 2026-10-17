"use server";

import { logAudit } from "@/lib/audit";

export async function logPdfExportAction(params: {
  entity: string;
  entityId?: string;
  playerId?: string;
  title?: string;
}) {
  return await logAudit({
    action: "export_pdf",
    entity: params.entity || "report",
    entityId: params.entityId,
    playerId: params.playerId,
    meta: {
      title: params.title || "PDF Document",
    },
  });
}
