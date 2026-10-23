/**
 * ehr-transfer.ts — Типи та константи для експорту та переносу медичної карти гравця (Етап 5.2)
 *
 * Відповідає медичним стандартам FIFA / UEFA Medical Transfer Summary:
 * - Згода гравця (Consent Gate) відповідно до GDPR Art. 9 та ЗУ «Про захист персональних даних»
 * - Модульний вибір розділів (антропометрія, травми, огляди, скринінги, призначення, LSI)
 * - Фільтрація за період (весь час, сезон, останні 12 місяців, довільний діапазон)
 * - PDF з водяним знаком «Конфіденційно» та контрольним хешем
 * - JSON версії 1.0.0 з Dry-Run імпортом та перевіркою конфліктів у приймаючому клубі
 */

export type EhrSection =
  | "anthropometry"
  | "injuries"
  | "examinations"
  | "screenings"
  | "prescriptions"
  | "lsi";

export const EHR_SECTIONS: EhrSection[] = [
  "anthropometry",
  "injuries",
  "examinations",
  "screenings",
  "prescriptions",
  "lsi",
];

export const EHR_SECTION_LABELS: Record<
  EhrSection,
  { label: string; shortLabel: string; icon: string; description: string }
> = {
  anthropometry: {
    label: "Антропометрія та дозрівання",
    shortLabel: "Антропометрія",
    icon: "📏",
    description: "Динаміка зросту, ваги, зрілості (Tanner) та PHV піку швидкості росту",
  },
  injuries: {
    label: "Історія травм та хірургічних втручань",
    shortLabel: "Травми",
    icon: "🩹",
    description: "Діагнози, класифікація MLG-R/BAMIC/Munich, втрачені дні (time-loss) та рецидиви",
  },
  examinations: {
    label: "Клінічні огляди та об'єктивні статуси",
    shortLabel: "Огляди",
    icon: "🩺",
    description: "Оцінка амплітуди рухів (ROM), набряку, м'язового тонусу та болю за ВАШ",
  },
  screenings: {
    label: "Передсезонні диспансерні скринінги",
    shortLabel: "Скринінги",
    icon: "🫀",
    description: "ЕКГ, ЕхоКГ, функціональний кардіо- та ортопедичний допуск до сезону",
  },
  prescriptions: {
    label: "Фармакотерапія та ін'єкційні процедури",
    shortLabel: "Призначення",
    icon: "💊",
    description: "Журнал медикаментів, ін'єкцій, дозувань та антидопінговий контроль (WADA)",
  },
  lsi: {
    label: "Тестування симетрії кінцівок (LSI)",
    shortLabel: "LSI / Симетрія",
    icon: "⚖️",
    description: "Динамометрія, ізокінетичні та стрибкові тести дефіциту кінцівок",
  },
};

export type TransferPurpose =
  | "transfer"
  | "loan"
  | "second_opinion"
  | "national_team"
  | "player_request"
  | "other";

export const TRANSFER_PURPOSE_LABELS: Record<TransferPurpose, string> = {
  transfer: "Офіційний трансфер у новий клуб",
  loan: "Тимчасова оренда (Loan)",
  second_opinion: "Консультація стороннього спеціаліста / Друга думка",
  national_team: "Виклик до національної/молодіжної збірної",
  player_request: "Видача копії картки на особисту вимогу гравця",
  other: "Інша клінічна підстава",
};

export type EhrExportConsent = {
  consent_confirmed: boolean;
  purpose: TransferPurpose;
  recipient_club: string;
  doctor_confirmation_name: string;
  consent_date: string; // YYYY-MM-DD
  notes?: string;
};

export type EhrExportPeriod = "all" | "current_season" | "last_12_months" | "custom";

export type EhrExportOptions = {
  player_id: string;
  sections: EhrSection[];
  period: EhrExportPeriod;
  start_date?: string;
  end_date?: string;
  consent: EhrExportConsent;
};

/**
 * Структура стандартизованого транспортного файлу JSON (EHR Transfer Package)
 */
export type EhrTransferPayload = {
  schema_version: "1.0.0";
  export_id: string;
  export_timestamp: string;
  club_origin: {
    id: string;
    name: string;
  };
  exporting_doctor: {
    id: string;
    name: string;
  };
  consent_record: EhrExportConsent;
  player: {
    first_name: string;
    last_name: string;
    date_of_birth: string;
    position: string;
    dominant_side?: string;
  };
  sections_included: EhrSection[];
  data: {
    anthropometry?: Array<{
      date: string;
      height: number | null;
      weight: number | null;
      fat_percentage?: number | null;
      notes?: string | null;
    }>;
    injuries?: Array<{
      injury_type: string;
      location: string;
      side: string;
      date_of_injury: string;
      actual_return_date: string | null;
      expected_return_date?: string | null;
      severity: string;
      mechanism: string;
      osiics_code?: string | null;
      description?: string | null;
      status: string;
    }>;
    examinations?: Array<{
      date: string;
      pain_vas: number;
      swelling_grade: string;
      rom_grade: string;
      muscle_tone: string;
      palpation_pain: boolean;
      examiner_name?: string | null;
      notes?: string | null;
    }>;
    screenings?: Array<{
      season: string;
      date: string;
      examiner_doctor: string;
      overall_status: string;
      valid_until: string;
      cardio_clearance: boolean;
      restrictions_notes?: string | null;
    }>;
    prescriptions?: Array<{
      date: string;
      medication_name: string;
      dosage: string;
      route: string;
      is_wada_prohibited: boolean;
      prescribed_by: string;
      notes?: string | null;
    }>;
    lsi?: Array<{
      date: string;
      metric_name: string;
      involved_value: number;
      uninvolved_value: number;
      lsi_percentage: number;
      status: string;
      notes?: string | null;
    }>;
  };
  content_sha256: string;
};

/**
 * Звіт валідації та конфліктів при імпорті (Dry-Run report)
 */
export type EhrImportValidationReport = {
  valid: boolean;
  schema_version: string;
  origin_club_name: string;
  exported_at: string;
  player_preview: {
    first_name: string;
    last_name: string;
    date_of_birth: string;
    position: string;
  };
  matching_player: {
    found: boolean;
    existing_player_id?: string;
    existing_player_name?: string;
  };
  counts: {
    anthropometry: number;
    injuries: number;
    examinations: number;
    screenings: number;
    prescriptions: number;
    lsi: number;
    total_records: number;
  };
  errors: string[];
  warnings: string[];
};
