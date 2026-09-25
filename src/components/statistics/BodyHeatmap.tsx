'use client';

import React, { useState } from 'react';
import Card from '@/components/ui/Card';

export interface InjuryPoint {
  id: string;
  location: string;
  side?: string | null;
  injury_type?: string;
  severity?: string;
  status: string;
  player_name: string;
  team_name: string;
  days_missed: number;
}

interface BodyHeatmapProps {
  injuries: InjuryPoint[];
}

type BodyZone = 
  | 'head'
  | 'shoulder'
  | 'elbow'
  | 'wrist'
  | 'spine'
  | 'groin'
  | 'thigh_quad'
  | 'thigh_hamstring'
  | 'knee'
  | 'calf'
  | 'ankle'
  | 'foot';

interface ZoneMeta {
  id: BodyZone;
  label: string;
  matchedLocations: string[];
  subLabel?: string;
}

const ZONES: ZoneMeta[] = [
  { id: 'head', label: 'Голова / Шия', matchedLocations: ['head'] },
  { id: 'shoulder', label: 'Плечовий пояс', matchedLocations: ['shoulder'] },
  { id: 'spine', label: 'Хребет / Поперек', matchedLocations: ['spine'] },
  { id: 'elbow', label: 'Лікоть', matchedLocations: ['elbow'] },
  { id: 'wrist', label: 'Кисть / Передпліччя', matchedLocations: ['wrist'] },
  { id: 'groin', label: 'Пах / Привідні м-зи', matchedLocations: ['groin'] },
  { id: 'thigh_quad', label: 'Стегно (Квадрицепс)', matchedLocations: ['thigh'], subLabel: 'Передня пов.' },
  { id: 'thigh_hamstring', label: 'Стегно (Гамстрінг)', matchedLocations: ['thigh'], subLabel: 'Задня пов.' },
  { id: 'knee', label: 'Коліно / КСВ / Меніск', matchedLocations: ['knee'] },
  { id: 'calf', label: 'Литка / Ахілл', matchedLocations: ['calf'] },
  { id: 'ankle', label: 'Гомілковостопний суглоб', matchedLocations: ['ankle'] },
  { id: 'foot', label: 'Стопа / Плюсна', matchedLocations: ['foot'] },
];

export default function BodyHeatmap({ injuries }: BodyHeatmapProps) {
  const [selectedZone, setSelectedZone] = useState<BodyZone | null>(null);
  const [viewMode, setViewMode] = useState<'anterior' | 'posterior'>('anterior');

  const zoneStats = ZONES.reduce<Record<BodyZone, { count: number; days: number; items: InjuryPoint[] }>>((acc, z) => {
    const matching = injuries.filter(i => {
      return z.matchedLocations.includes(i.location);
    });
    acc[z.id] = {
      count: matching.length,
      days: matching.reduce((s, it) => s + (it.days_missed || 0), 0),
      items: matching,
    };
    return acc;
  }, {} as Record<BodyZone, { count: number; days: number; items: InjuryPoint[] }>);

  const maxInjuries = Math.max(1, ...Object.values(zoneStats).map(s => s.count));

  function getZoneFill(zoneId: BodyZone): string {
    const count = zoneStats[zoneId]?.count ?? 0;
    if (count === 0) return '#1e293b'; // slate-800
    const ratio = count / maxInjuries;
    if (ratio >= 0.7) return '#ef4444'; // red-500
    if (ratio >= 0.4) return '#f59e0b'; // amber-500
    if (ratio >= 0.2) return '#3b82f6'; // blue-500
    return '#10b981'; // emerald-500
  }

  const activeZoneObj = selectedZone ? ZONES.find(z => z.id === selectedZone) : null;
  const filteredInjuries = selectedZone ? zoneStats[selectedZone]?.items || [] : injuries;

  return (
    <Card className="border-blue-900/30 bg-slate-900/40 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 mb-4 border-b border-blue-900/20 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🩻</span>
            <h3 className="text-base font-bold text-white">Анатомічна теплова карта уражень (Body Heatmap)</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Інтерактивна 2D візуалізація концентрації травм та пропущених днів за анатомічними зонами
          </p>
        </div>

        <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700/60 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('anterior')}
            className={'px-3 py-1 text-xs font-semibold rounded-md transition-all ' + (viewMode === 'anterior' ? 'bg-primary text-white shadow-sm' : 'text-slate-400 hover:text-white')}
          >
            Передня проекція
          </button>
          <button
            type="button"
            onClick={() => setViewMode('posterior')}
            className={'px-3 py-1 text-xs font-semibold rounded-md transition-all ' + (viewMode === 'posterior' ? 'bg-primary text-white shadow-sm' : 'text-slate-400 hover:text-white')}
          >
            Задня проекція
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-6 flex flex-col items-center justify-center bg-slate-950/60 p-5 rounded-xl border border-blue-950/40 relative min-h-[460px]">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-widest mb-3">
            {viewMode === 'anterior' ? 'Фронтальна проекція (Anterior)' : 'Дорсальна проекція (Posterior)'}
          </div>

          <svg
            viewBox="0 0 240 420"
            className="w-60 md:w-72 h-auto max-h-[400px] select-none filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
          >
            <g opacity="0.15" stroke="#94a3b8" strokeWidth="1.5" fill="none">
              <circle cx="120" cy="35" r="22" />
              <path d="M112 57 L112 68 M128 57 L128 68" />
              <path d="M85 75 L155 75 L150 170 L90 170 Z" />
              <path d="M85 75 L55 145 L45 205" />
              <path d="M155 75 L185 145 L195 205" />
              <path d="M95 170 L90 270 L85 360 L78 395" />
              <path d="M145 170 L150 270 L155 360 L162 395" />
            </g>

            <g
              className="cursor-pointer transition-transform hover:scale-105"
              onClick={() => setSelectedZone(selectedZone === 'head' ? null : 'head')}
            >
              <circle
                cx="120"
                cy="35"
                r="20"
                fill={getZoneFill('head')}
                stroke={selectedZone === 'head' ? '#38bdf8' : '#334155'}
                strokeWidth={selectedZone === 'head' ? 2.5 : 1}
              />
              <text x="120" y="38" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold">
                {zoneStats['head']?.count || 0}
              </text>
            </g>

            <g
              className="cursor-pointer transition-transform hover:scale-105"
              onClick={() => setSelectedZone(selectedZone === 'shoulder' ? null : 'shoulder')}
            >
              <ellipse
                cx="72"
                cy="75"
                rx="14"
                ry="10"
                fill={getZoneFill('shoulder')}
                stroke={selectedZone === 'shoulder' ? '#38bdf8' : '#334155'}
                strokeWidth={selectedZone === 'shoulder' ? 2.5 : 1}
              />
              <ellipse
                cx="168"
                cy="75"
                rx="14"
                ry="10"
                fill={getZoneFill('shoulder')}
                stroke={selectedZone === 'shoulder' ? '#38bdf8' : '#334155'}
                strokeWidth={selectedZone === 'shoulder' ? 2.5 : 1}
              />
              <text x="120" y="78" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold">
                {zoneStats['shoulder']?.count || 0}
              </text>
            </g>

            <g
              className="cursor-pointer transition-transform hover:scale-105"
              onClick={() => setSelectedZone(selectedZone === 'spine' ? null : 'spine')}
            >
              <rect
                x="106"
                y="88"
                width="28"
                height="65"
                rx="6"
                fill={getZoneFill('spine')}
                stroke={selectedZone === 'spine' ? '#38bdf8' : '#334155'}
                strokeWidth={selectedZone === 'spine' ? 2.5 : 1}
              />
              <text x="120" y="125" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold">
                {zoneStats['spine']?.count || 0}
              </text>
            </g>

            <g
              className="cursor-pointer transition-transform hover:scale-105"
              onClick={() => setSelectedZone(selectedZone === 'elbow' ? null : 'elbow')}
            >
              <circle cx="52" cy="145" r="9" fill={getZoneFill('elbow')} stroke={selectedZone === 'elbow' ? '#38bdf8' : '#334155'} strokeWidth="1" />
              <circle cx="188" cy="145" r="9" fill={getZoneFill('elbow')} stroke={selectedZone === 'elbow' ? '#38bdf8' : '#334155'} strokeWidth="1" />
            </g>

            <g
              className="cursor-pointer transition-transform hover:scale-105"
              onClick={() => setSelectedZone(selectedZone === 'wrist' ? null : 'wrist')}
            >
              <circle cx="42" cy="198" r="8" fill={getZoneFill('wrist')} stroke={selectedZone === 'wrist' ? '#38bdf8' : '#334155'} strokeWidth="1" />
              <circle cx="198" cy="198" r="8" fill={getZoneFill('wrist')} stroke={selectedZone === 'wrist' ? '#38bdf8' : '#334155'} strokeWidth="1" />
            </g>

            <g
              className="cursor-pointer transition-transform hover:scale-105"
              onClick={() => setSelectedZone(selectedZone === 'groin' ? null : 'groin')}
            >
              <polygon
                points="95,160 145,160 135,190 105,190"
                fill={getZoneFill('groin')}
                stroke={selectedZone === 'groin' ? '#38bdf8' : '#334155'}
                strokeWidth={selectedZone === 'groin' ? 2.5 : 1}
              />
              <text x="120" y="178" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold">
                {zoneStats['groin']?.count || 0}
              </text>
            </g>

            <g
              className="cursor-pointer transition-transform hover:scale-105"
              onClick={() => {
                const target = viewMode === 'anterior' ? 'thigh_quad' : 'thigh_hamstring';
                setSelectedZone(selectedZone === target ? null : target);
              }}
            >
              <rect
                x="82"
                y="198"
                width="30"
                height="60"
                rx="8"
                fill={getZoneFill(viewMode === 'anterior' ? 'thigh_quad' : 'thigh_hamstring')}
                stroke={(selectedZone === 'thigh_quad' || selectedZone === 'thigh_hamstring') ? '#38bdf8' : '#334155'}
                strokeWidth="1.5"
              />
              <rect
                x="128"
                y="198"
                width="30"
                height="60"
                rx="8"
                fill={getZoneFill(viewMode === 'anterior' ? 'thigh_quad' : 'thigh_hamstring')}
                stroke={(selectedZone === 'thigh_quad' || selectedZone === 'thigh_hamstring') ? '#38bdf8' : '#334155'}
                strokeWidth="1.5"
              />
              <text x="97" y="232" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold">
                {zoneStats[viewMode === 'anterior' ? 'thigh_quad' : 'thigh_hamstring']?.count || 0}
              </text>
              <text x="143" y="232" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold">
                {zoneStats[viewMode === 'anterior' ? 'thigh_quad' : 'thigh_hamstring']?.count || 0}
              </text>
            </g>

            <g
              className="cursor-pointer transition-transform hover:scale-105"
              onClick={() => setSelectedZone(selectedZone === 'knee' ? null : 'knee')}
            >
              <ellipse
                cx="96"
                cy="272"
                rx="14"
                ry="12"
                fill={getZoneFill('knee')}
                stroke={selectedZone === 'knee' ? '#38bdf8' : '#334155'}
                strokeWidth={selectedZone === 'knee' ? 2.5 : 1}
              />
              <ellipse
                cx="144"
                cy="272"
                rx="14"
                ry="12"
                fill={getZoneFill('knee')}
                stroke={selectedZone === 'knee' ? '#38bdf8' : '#334155'}
                strokeWidth={selectedZone === 'knee' ? 2.5 : 1}
              />
              <text x="96" y="275" textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="bold">
                {zoneStats['knee']?.count || 0}
              </text>
              <text x="144" y="275" textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="bold">
                {zoneStats['knee']?.count || 0}
              </text>
            </g>

            <g
              className="cursor-pointer transition-transform hover:scale-105"
              onClick={() => setSelectedZone(selectedZone === 'calf' ? null : 'calf')}
            >
              <rect
                x="84"
                y="293"
                width="24"
                height="50"
                rx="6"
                fill={getZoneFill('calf')}
                stroke={selectedZone === 'calf' ? '#38bdf8' : '#334155'}
                strokeWidth="1"
              />
              <rect
                x="132"
                y="293"
                width="24"
                height="50"
                rx="6"
                fill={getZoneFill('calf')}
                stroke={selectedZone === 'calf' ? '#38bdf8' : '#334155'}
                strokeWidth="1"
              />
              <text x="96" y="322" textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="bold">
                {zoneStats['calf']?.count || 0}
              </text>
              <text x="144" y="322" textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="bold">
                {zoneStats['calf']?.count || 0}
              </text>
            </g>

            <g
              className="cursor-pointer transition-transform hover:scale-105"
              onClick={() => setSelectedZone(selectedZone === 'ankle' ? null : 'ankle')}
            >
              <circle
                cx="94"
                cy="358"
                r="10"
                fill={getZoneFill('ankle')}
                stroke={selectedZone === 'ankle' ? '#38bdf8' : '#334155'}
                strokeWidth={selectedZone === 'ankle' ? 2.5 : 1}
              />
              <circle
                cx="146"
                cy="358"
                r="10"
                fill={getZoneFill('ankle')}
                stroke={selectedZone === 'ankle' ? '#38bdf8' : '#334155'}
                strokeWidth={selectedZone === 'ankle' ? 2.5 : 1}
              />
              <text x="120" y="362" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold">
                {zoneStats['ankle']?.count || 0}
              </text>
            </g>

            <g
              className="cursor-pointer transition-transform hover:scale-105"
              onClick={() => setSelectedZone(selectedZone === 'foot' ? null : 'foot')}
            >
              <ellipse
                cx="90"
                cy="385"
                rx="12"
                ry="7"
                fill={getZoneFill('foot')}
                stroke={selectedZone === 'foot' ? '#38bdf8' : '#334155'}
                strokeWidth="1"
              />
              <ellipse
                cx="150"
                cy="385"
                rx="12"
                ry="7"
                fill={getZoneFill('foot')}
                stroke={selectedZone === 'foot' ? '#38bdf8' : '#334155'}
                strokeWidth="1"
              />
            </g>
          </svg>

          <div className="flex items-center gap-3 mt-4 text-[10px] text-slate-400 font-mono">
            <span>Інтенсивність:</span>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-slate-800 border border-slate-700" title="0 травм"></span>
              <span>0</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-500" title="Низька"></span>
              <span>Низька</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-blue-500" title="Помірна"></span>
              <span>Помірна</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-500" title="Підвищена"></span>
              <span>Підвищена</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-red-500" title="Критична"></span>
              <span>Критична</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-6 space-y-4">
          {activeZoneObj ? (
            <div className="bg-slate-800/80 p-4 rounded-xl border border-blue-500/30">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-sky-400 tracking-wider">Обрана анатомічна зона</span>
                  <h4 className="text-base font-bold text-white mt-0.5">{activeZoneObj.label}</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedZone(null)}
                  className="text-xs text-slate-400 hover:text-white px-2 py-1 bg-slate-700/60 rounded"
                >
                  ✕ Скинути фільтр
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-700/60">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">Кількість травм</div>
                  <div className="text-xl font-bold font-mono text-white">{zoneStats[activeZoneObj.id]?.count || 0}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">Пропущено днів</div>
                  <div className="text-xl font-bold font-mono text-red-400">{zoneStats[activeZoneObj.id]?.days || 0} дн.</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-800/30 p-3 rounded-lg border border-slate-700/40 text-xs text-slate-400 flex items-center gap-2">
              <span>💡</span>
              <span>Натисніть на будь-яку ділянку тіла на карті або в списку для деталізації травм</span>
            </div>
          )}

          <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
            {ZONES.map(z => {
              const stat = zoneStats[z.id];
              const isSelected = selectedZone === z.id;
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => setSelectedZone(isSelected ? null : z.id)}
                  className={'w-full flex items-center justify-between p-2 rounded-lg text-left transition-all border ' + (isSelected ? 'bg-blue-900/30 border-sky-500/50' : 'bg-slate-800/40 hover:bg-slate-800/80 border-transparent')}
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: getZoneFill(z.id) }}
                    />
                    <span className="text-xs font-medium text-slate-200 truncate">{z.label}</span>
                    {z.subLabel && <span className="text-[10px] text-slate-500">({z.subLabel})</span>}
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-right">
                    <span className="text-xs font-mono font-bold text-white">{stat?.count || 0}</span>
                    <span className="text-[10px] font-mono text-slate-400 w-14">{stat?.days || 0} дн.</span>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedZone && (
            <div className="mt-4 pt-4 border-t border-slate-800">
              <div className="text-xs font-semibold text-slate-300 mb-2">
                Зафіксовані епізоди ({filteredInjuries.length}):
              </div>
              {filteredInjuries.length === 0 ? (
                <div className="text-xs text-slate-500 italic py-2">Травм у даній зоні не зареєстровано</div>
              ) : (
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                  {filteredInjuries.map(i => (
                    <div key={i.id} className="p-2 rounded bg-slate-950/40 border border-slate-800 text-xs flex justify-between items-center">
                      <div>
                        <div className="font-bold text-white">{i.player_name}</div>
                        <div className="text-[10px] text-slate-400">{i.team_name} · {i.side ? (i.side === 'left' ? 'Ліва' : 'Права') : ''}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold text-red-400">{i.days_missed} дн.</div>
                        <div className="text-[9px] uppercase tracking-wider text-slate-500">{i.status}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
