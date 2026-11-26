"use client";

import React, { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onScan: (decodedText: string) => void;
  title?: string;
}

export default function QrScannerModal({
  isOpen,
  onClose,
  onScan,
  title = "Сканування QR-коду",
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const handledRef = useRef<boolean>(false);

  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState<boolean>(true);

  useEffect(() => {
    if (!isOpen) return;

    handledRef.current = false;
    setError(null);
    setIsStarting(true);

    let cancelled = false;

    const stopCamera = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };

    const startCamera = async () => {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        setIsStarting(false);
        setError(
          "Камера недоступна в цьому браузері. Вставте персональне посилання вручну нижче."
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stopCamera();
          return;
        }

        video.srcObject = stream;
        await video.play();
        setIsStarting(false);

        const BarcodeDetectorCtor = (window as unknown as {
          BarcodeDetector?: new (opts?: { formats?: string[] }) => {
            detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
          };
        }).BarcodeDetector;
        const detector = BarcodeDetectorCtor
          ? new BarcodeDetectorCtor({ formats: ["qr_code"] })
          : null;

        let busy = false;

        const tick = async () => {
          if (cancelled || handledRef.current) return;

          if (
            video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA &&
            video.videoWidth > 0 &&
            video.videoHeight > 0 &&
            !busy
          ) {
            busy = true;
            try {
              let found: string | null = null;

              if (detector) {
                try {
                  const codes = await detector.detect(video);
                  if (codes && codes.length > 0 && codes[0].rawValue) {
                    found = codes[0].rawValue;
                  }
                } catch {
                  // Fallback to jsQR below
                }
              }

              if (!found) {
                const canvas = canvasRef.current || document.createElement("canvas");
                canvasRef.current = canvas;
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext("2d", { willReadFrequently: true });
                if (ctx) {
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                  const qr = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: "dontInvert",
                  });
                  if (qr?.data) {
                    found = qr.data;
                  }
                }
              }

              if (found && !handledRef.current) {
                handledRef.current = true;
                stopCamera();
                onScan(found);
                return;
              }
            } finally {
              busy = false;
            }
          }

          rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      } catch (err: unknown) {
        if (cancelled) return;
        setIsStarting(false);
        const name = err instanceof Error ? err.name : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setError(
            "Доступ до камери заборонено. Дозвольте камеру в налаштуваннях або вставте посилання вручну."
          );
        } else {
          setError(
            "Не вдалося відкрити камеру. Спробуйте вставити персональне посилання вручну."
          );
        }
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [isOpen, onScan]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-sky-500/40 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl relative">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <span>📷</span>
            <span>{title}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-base px-2 py-1 rounded-lg hover:bg-slate-800"
            aria-label="Закрити"
          >
            ✕
          </button>
        </div>

        {error ? (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200 leading-relaxed text-center">
            {error}
          </div>
        ) : (
          <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 aspect-square flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="w-full h-full object-cover"
            />
            <div className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-sky-400/70 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)]" />
            {isStarting && (
              <div className="absolute inset-0 bg-slate-950/80 flex items-center justify-center text-xs text-slate-300 font-medium">
                Запуск камери...
              </div>
            )}
          </div>
        )}

        <p className="text-[11px] text-slate-400 text-center leading-snug">
          Наведіть камеру на ваш персональний QR-код із картки або з екрана тренера/лікаря.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors"
        >
          Скасувати
        </button>
      </div>
    </div>
  );
}
