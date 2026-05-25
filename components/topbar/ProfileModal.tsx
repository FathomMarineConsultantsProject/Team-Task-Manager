"use client";

import { useCallback, useRef, useState } from "react";
import { Camera, Trash2, X } from "lucide-react";
import Modal from "@/components/ui/modal";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/button";
import AvatarCropModal from "@/components/ui/AvatarCropModal";
import { useAppData } from "@/components/providers/AppDataProvider";

/**
 * Auto-compress an image file to a max dimension and JPEG quality.
 * Returns a data URL for the crop preview.
 */
async function compressImageToDataUrl(
  file: File,
  maxDim = 800,
  quality = 0.6
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ProfileModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { supabase, profile, refreshProfile } = useAppData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Crop modal state
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;

      setError(null);

      if (!file.type.startsWith("image/")) {
        setError("Please select an image file.");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError("Image must be under 10MB.");
        return;
      }

      try {
        // Auto-compress before showing crop
        const dataUrl = await compressImageToDataUrl(file, 800, 0.6);
        setCropImageSrc(dataUrl);
        setShowCropModal(true);
      } catch {
        setError("Failed to process image. Please try again.");
      }
    },
    []
  );

  const handleCropConfirm = useCallback(
    async (croppedBlob: Blob) => {
      if (!profile?.id) return;
      setIsUploading(true);
      setError(null);

      try {
        // Delete old avatar if it exists
        if (profile.avatar_url) {
          try {
            const oldPath = profile.avatar_url.split("/avatars/").pop();
            // Strip any query params from old path
            const cleanPath = oldPath?.split("?")[0];
            if (cleanPath) {
              await supabase.storage.from("avatars").remove([cleanPath]);
            }
          } catch {
            // Ignore delete errors
          }
        }

        // Upload cropped avatar
        const filePath = `${profile.id}/avatar.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(filePath, croppedBlob, {
            upsert: true,
            contentType: "image/jpeg",
          });

        if (uploadError) {
          setError(uploadError.message);
          return;
        }

        // Get public URL with cache-bust
        const { data: urlData } = supabase.storage
          .from("avatars")
          .getPublicUrl(filePath);

        const publicUrl = urlData?.publicUrl;
        if (!publicUrl) {
          setError("Failed to get image URL.");
          return;
        }

        // Append timestamp for cache busting
        const cacheBustedUrl = `${publicUrl}?t=${Date.now()}`;

        // Update user record
        const { error: updateError } = await supabase
          .from("users")
          .update({ avatar_url: cacheBustedUrl })
          .eq("id", profile.id);

        if (updateError) {
          setError(updateError.message);
          return;
        }

        await refreshProfile();
        setShowCropModal(false);
        setCropImageSrc(null);
      } catch (err) {
        setError("Upload failed. Please try again.");
        console.error(err);
      } finally {
        setIsUploading(false);
      }
    },
    [profile, supabase, refreshProfile]
  );

  const handleRemoveAvatar = useCallback(async () => {
    if (!profile?.id || !profile.avatar_url) return;
    setError(null);
    setIsRemoving(true);

    try {
      const oldPath = profile.avatar_url.split("/avatars/").pop();
      const cleanPath = oldPath?.split("?")[0];
      if (cleanPath) {
        await supabase.storage.from("avatars").remove([cleanPath]);
      }

      const { error: updateError } = await supabase
        .from("users")
        .update({ avatar_url: null })
        .eq("id", profile.id);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      await refreshProfile();
    } catch (err) {
      setError("Failed to remove photo. Please try again.");
      console.error(err);
    } finally {
      setIsRemoving(false);
    }
  }, [profile, supabase, refreshProfile]);

  return (
    <>
      <Modal title="Profile Settings" isOpen={isOpen} onClose={onClose}>
        <div className="flex flex-col items-center gap-6 py-4">
          {/* Avatar preview */}
          <div className="relative">
            <Avatar
              userId={profile?.id}
              name={profile?.name}
              email={profile?.email}
              avatarUrl={profile?.avatar_url}
              size="2xl"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-white shadow-lg transition hover:bg-slate-700 disabled:opacity-50"
            >
              <Camera size={14} />
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => void handleFileChange(e)}
            className="hidden"
          />

          {/* User info */}
          <div className="text-center">
            <p className="text-lg font-semibold text-slate-900">
              {profile?.name ?? "Unknown"}
            </p>
            <p className="text-sm text-slate-500">{profile?.email ?? ""}</p>
            {profile?.job_role && (
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                {profile.job_role}
              </p>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              <X size={14} />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="rounded-lg px-4 py-2 text-sm"
            >
              {isUploading
                ? "Uploading..."
                : profile?.avatar_url
                ? "Change Photo"
                : "Upload Photo"}
            </Button>

            {profile?.avatar_url && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleRemoveAvatar}
                disabled={isRemoving}
                className="rounded-lg px-4 py-2 text-sm text-red-500 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 size={14} className="mr-1" />
                {isRemoving ? "Removing..." : "Remove"}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* Crop modal — renders on top of everything */}
      {cropImageSrc && (
        <AvatarCropModal
          isOpen={showCropModal}
          imageSrc={cropImageSrc}
          onClose={() => {
            setShowCropModal(false);
            setCropImageSrc(null);
          }}
          onConfirm={(blob) => void handleCropConfirm(blob)}
          isUploading={isUploading}
        />
      )}
    </>
  );
}
