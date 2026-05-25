"use client";

import { useCallback, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
import { X, Check, Loader2 } from "lucide-react";
import ModalPortal from "@/components/ModalPortal";

interface AvatarCropModalProps {
  isOpen: boolean;
  imageSrc: string;
  onClose: () => void;
  onConfirm: (croppedBlob: Blob) => void;
  isUploading?: boolean;
}

/**
 * Crops the image based on the pixel crop area and returns a compressed JPEG blob.
 */
async function getCroppedBlob(
  imageSrc: string,
  pixelCrop: Area,
  quality = 0.7
): Promise<Blob> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
    image.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  const size = Math.min(pixelCrop.width, pixelCrop.height);
  // Output at 400x400 for a clean avatar
  const outputSize = 400;
  canvas.width = outputSize;
  canvas.height = outputSize;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  // Draw circular clip
  ctx.beginPath();
  ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    size,
    size,
    0,
    0,
    outputSize,
    outputSize
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas export failed"));
      },
      "image/jpeg",
      quality
    );
  });
}

export default function AvatarCropModal({
  isOpen,
  imageSrc,
  onClose,
  onConfirm,
  isUploading = false,
}: AvatarCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!croppedAreaPixels) return;
    setIsProcessing(true);
    try {
      const blob = await getCroppedBlob(imageSrc, croppedAreaPixels, 0.7);
      onConfirm(blob);
    } catch (err) {
      console.error("Crop failed:", err);
    } finally {
      setIsProcessing(false);
    }
  }, [croppedAreaPixels, imageSrc, onConfirm]);

  if (!isOpen) return null;

  const busy = isProcessing || isUploading;
  const statusText = isUploading
    ? "Uploading..."
    : isProcessing
    ? "Processing..."
    : null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
        <div
          className="relative flex flex-col w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="text-base font-semibold text-slate-900">
              Crop Profile Photo
            </h3>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition disabled:opacity-50"
            >
              <X size={18} />
            </button>
          </div>

          {/* Crop area */}
          <div className="relative w-full bg-slate-950" style={{ height: 340 }}>
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              style={{
                containerStyle: { background: "#0f172a" },
              }}
            />
          </div>

          {/* Zoom slider */}
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-100">
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-slate-400 shrink-0">Zoom</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                disabled={busy}
                className="flex-1 h-1.5 rounded-full appearance-none bg-slate-200 accent-slate-900 cursor-pointer disabled:opacity-50"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-white">
            {statusText ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 size={14} className="animate-spin" />
                {statusText}
              </div>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="px-4 py-2 text-sm font-medium text-slate-600 rounded-lg hover:bg-slate-100 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={busy}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
              >
                <Check size={14} />
                {busy ? "Processing..." : "Save Photo"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
