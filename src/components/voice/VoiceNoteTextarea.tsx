"use client";

import { useState, useEffect, useRef } from "react";

type Props = {
  value: string;
  onChange: (val: string) => void;
  label?: string;
  placeholder?: string;
  rows?: number;
  className?: string;
  id?: string;
};

export default function VoiceNoteTextarea({
  value,
  onChange,
  label = "Клінічні нотатки лікаря:",
  placeholder = "Введіть текст або натисніть «Диктувати голосом»...",
  rows = 4,
  className = "",
  id = "voice-textarea",
}: Props) {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [hasUsedVoice, setHasUsedVoice] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        setIsSupported(true);
        const recognition = new SpeechRecognition();
        recognition.lang = "uk-UA";
        recognition.continuous = true;
        recognition.interimResults = false;

        recognition.onresult = (event: any) => {
          let transcript = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
          }

          if (transcript.trim()) {
            setHasUsedVoice(true);
            // Додаємо розпізнаний текст до наявного поля
            onChange(value ? `${value.trim()} ${transcript.trim()}` : transcript.trim());
          }
        };

        recognition.onerror = (event: any) => {
          if (event.error !== "no-speech") {
            setVoiceError(`Помилка розпізнавання: ${event.error}`);
          }
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, [value, onChange]);

  const toggleListening = () => {
    if (!recognitionRef.current) return;

    setVoiceError(null);
    if (isListening) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err: any) {
        setVoiceError("Не вдалося запустити мікрофон");
        setIsListening(false);
      }
    }
  };

  return (
    <div className={`space-y-2 text-xs ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="block font-bold text-slate-300">
          {label}
        </label>

        {/* Кнопка голосу показується ТІЛЬКИ якщо Web Speech API підтримується */}
        {isSupported && (
          <button
            type="button"
            onClick={toggleListening}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border font-semibold text-[11px] transition shadow-sm ${
              isListening
                ? "bg-rose-500/20 border-rose-500/50 text-rose-300 animate-pulse"
                : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-sky-300"
            }`}
          >
            <span className={isListening ? "animate-bounce" : ""}>🎙️</span>
            <span>{isListening ? "Зупинити диктування" : "Диктувати голосом (uk-UA)"}</span>
          </button>
        )}
      </div>

      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-slate-900 border rounded-xl p-3 text-white text-xs leading-relaxed transition focus:ring-2 focus:ring-sky-500 ${
          isListening ? "border-rose-500/60 ring-1 ring-rose-500/40" : "border-slate-700"
        }`}
      />

      {/* Помилка мікрофона */}
      {voiceError && (
        <div className="p-2 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-[11px]">
          ⚠️ {voiceError}
        </div>
      )}

      {/* Позначка клінічної перевірки (Вимога ТЗ) */}
      {(hasUsedVoice || isListening) && (
        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] flex items-center gap-2 animate-in fade-in">
          <span>⚠️</span>
          <span>
            <strong>Перевірте розпізнаний текст:</strong> медичні назви, латинські анатомічні терміни та дозування можуть потребувати ручного редагування.
          </span>
        </div>
      )}
    </div>
  );
}
