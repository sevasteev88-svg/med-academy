import Card from "@/components/ui/Card";
import { EXAM_GRADE_UA, ROM_GRADE_UA, MUSCLE_TONE_UA } from "@/lib/constants";

type Exam = { id: string; date: string; vas_score: number; edema: string; hematoma: string; rom: string; palpation_pain: string; muscle_tone: string; objective_note: string | null; subjective_note: string | null };

function vasColor(v: number): string { if (v >= 7) return "text-status-danger"; if (v >= 4) return "text-status-warn"; return "text-status-ok"; }
function gradeColor(g: string): string { if (g === "none" || g === "full" || g === "normal") return "text-status-ok"; if (g === "mild" || g === "slightly_limited") return "text-status-warn"; return "text-status-danger"; }

export default function ExaminationHistory({ exams }: { exams: Exam[] }) {
  if (exams.length === 0) return null;
  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Історія оглядів ({exams.length})</h3>
      {exams.length >= 2 && (
        <Card className="mb-3">
          <div className="text-xs text-slate-500 mb-2 font-semibold">Динаміка ВАШ</div>
          <div className="flex items-end gap-1 h-12">
            {[...exams].reverse().map((e) => (
              <div key={e.id} className="flex flex-col items-center gap-0.5 flex-1">
                <span className={`text-[10px] font-bold ${vasColor(e.vas_score)}`}>{e.vas_score}</span>
                <div className="w-full rounded-t" style={{ height: `${Math.max(4, e.vas_score * 10)}%`, backgroundColor: e.vas_score >= 7 ? "#ef4444" : e.vas_score >= 4 ? "#eab308" : "#22c55e", opacity: 0.7 }} />
              </div>
            ))}
          </div>
          <div className="flex gap-1 mt-1">
            {[...exams].reverse().map((e) => (
              <div key={e.id + "-d"} className="flex-1 text-center text-[8px] text-slate-600">{new Date(e.date).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" })}</div>
            ))}
          </div>
        </Card>
      )}
      <div className="space-y-2">
        {exams.map((exam) => (
          <Card key={exam.id}>
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs text-slate-400 font-mono">{new Date(exam.date).toLocaleDateString("uk-UA")}</span>
              <span className={`text-sm font-extrabold font-mono ${vasColor(exam.vas_score)}`}>ВАШ {exam.vas_score}/10</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-[11px]">
              <div><span className="text-slate-600">Набряк: </span><span className={gradeColor(exam.edema)}>{EXAM_GRADE_UA[exam.edema]}</span></div>
              <div><span className="text-slate-600">Гематома: </span><span className={gradeColor(exam.hematoma)}>{EXAM_GRADE_UA[exam.hematoma]}</span></div>
              <div><span className="text-slate-600">Рухи: </span><span className={gradeColor(exam.rom)}>{ROM_GRADE_UA[exam.rom]}</span></div>
              <div><span className="text-slate-600">Пальпація: </span><span className={gradeColor(exam.palpation_pain)}>{EXAM_GRADE_UA[exam.palpation_pain]}</span></div>
              <div><span className="text-slate-600">Тонус: </span><span className={gradeColor(exam.muscle_tone)}>{MUSCLE_TONE_UA[exam.muscle_tone]}</span></div>
            </div>
            {(exam.objective_note || exam.subjective_note) && (
              <div className="mt-2 pt-2 border-t border-blue-900/10 text-xs space-y-1">
                {exam.objective_note && <div><span className="text-slate-600">Об'єктивно: </span><span className="text-slate-300">{exam.objective_note}</span></div>}
                {exam.subjective_note && <div><span className="text-slate-600">Суб'єктивно: </span><span className="text-slate-300">{exam.subjective_note}</span></div>}
              </div>
            )}
          </Card>
        ))}
      </div>
    </section>
  );
}
