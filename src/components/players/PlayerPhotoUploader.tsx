"use client";

import { useState, useRef, useTransition } from "react";
import Image from "next/image";
import { savePlayerPhotoAction } from "@/actions/save-player-photo-action";

type Props = {
  playerId: string;
  playerName: string;
  initialPhotoUrl?: string | null;
  initials: string;
};

export default function PlayerPhotoUploader({
  playerId,
  playerName,
  initialPhotoUrl,
  initials,
}: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialPhotoUrl || null);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Стискаємо та масштабуємо фото на клієнті в Canvas до 400x400 (WebP/JPEG якість 0.85)
  // Це забезпечує ідеальну швидкість завантаження та компактність у базі даних
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMsg("Будь ласка, оберіть файл зображення (JPG, PNG або WebP).");
      return;
    }

    setErrorMsg(null);
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.85);

        startTransition(async () => {
          const res = await savePlayerPhotoAction({
            playerId,
            photoUrl: compressedBase64,
          });

          if (res.error) {
            setErrorMsg(res.error);
          } else {
            setPhotoUrl(compressedBase64);
          }
        });
      };
      img.src = event.target?.result as string;
    };

    reader.readAsDataURL(file);
  };

  return (
    <div className="relative group shrink-0">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <div
        onClick={() => fileInputRef.current?.click()}
        title="Натисніть, щоб завантажити або змінити фото гравця"
        className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-slate-800 via-slate-900 to-sky-950 border-2 border-sky-500/30 flex items-center justify-center font-black font-mono text-xl md:text-2xl text-sky-300 shadow-xl shadow-sky-500/10 overflow-hidden cursor-pointer relative hover:border-sky-400 transition-all group"
      >
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt={playerName}
            fill
            sizes="80px"
            className="object-cover"
          />
        ) : (
          <span>{initials}</span>
        )}

        {/* Напівпрозорий оверлей при наведенні для камери */}
        <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white backdrop-blur-xs">
          <span className="text-sm">📷</span>
          <span className="text-[8px] font-bold text-sky-300 uppercase tracking-wider mt-0.5">
            {photoUrl ? "Змінити" : "Додати"}
          </span>
        </div>

        {isPending && (
          <div className="absolute inset-0 bg-slate-950/80 flex items-center justify-center text-sky-400">
            <span className="w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      <div
        onClick={() => fileInputRef.current?.click()}
        className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-slate-900 border-2 border-sky-500/40 hover:border-sky-400 flex items-center justify-center text-[10px] text-sky-300 cursor-pointer shadow-md transition-all hover:scale-110"
        title="Завантажити фото"
      >
        📷
      </div>

      {errorMsg && (
        <div className="absolute top-full left-0 mt-2 z-50 p-2 bg-rose-950 border border-rose-500/40 rounded-xl text-[10px] text-rose-300 shadow-xl whitespace-nowrap">
          {errorMsg}
        </div>
      )}
    </div>
  );
}
