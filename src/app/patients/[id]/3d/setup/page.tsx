"use client";

import { ChangeEvent, FormEvent, useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";

type ReconstructionType = "breast" | "face" | "body";

// Maximum file size in bytes (1MB) - Vercel has a 4.5MB body limit
const MAX_FILE_SIZE = 1 * 1024 * 1024;
// Target quality for JPEG compression
const COMPRESSION_QUALITY = 0.8;
// Maximum image dimension
const MAX_IMAGE_DIMENSION = 2048;

/**
 * Compress an image file if it exceeds the max size
 * Returns the original file if compression is not needed or fails
 */
async function compressImage(file: File): Promise<File> {
  // Skip if already small enough
  if (file.size <= MAX_FILE_SIZE) {
    console.log(`[Image Compress] File ${file.name} already small (${(file.size / 1024).toFixed(1)}KB), skipping compression`);
    return file;
  }

  console.log(`[Image Compress] Compressing ${file.name} from ${(file.size / 1024 / 1024).toFixed(2)}MB`);

  return new Promise((resolve) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      // Calculate new dimensions while maintaining aspect ratio
      let { width, height } = img;
      
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        if (width > height) {
          height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
          width = MAX_IMAGE_DIMENSION;
        } else {
          width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
          height = MAX_IMAGE_DIMENSION;
        }
      }

      canvas.width = width;
      canvas.height = height;

      if (!ctx) {
        console.warn('[Image Compress] Canvas context not available, using original');
        resolve(file);
        return;
      }

      // Draw and compress
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            console.warn('[Image Compress] Compression failed, using original');
            resolve(file);
            return;
          }

          const compressedFile = new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });

          console.log(`[Image Compress] Compressed ${file.name}: ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(compressedFile.size / 1024).toFixed(1)}KB`);
          resolve(compressedFile);
        },
        'image/jpeg',
        COMPRESSION_QUALITY
      );
    };

    img.onerror = () => {
      console.warn('[Image Compress] Failed to load image, using original');
      resolve(file);
    };

    // Load the image
    img.src = URL.createObjectURL(file);
  });
}

interface PatientImage {
  name: string;
  path: string;
  url: string;
  created_at?: string;
}

export default function Patient3DSetupPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [step, setStep] = useState<"select" | "choice" | "form">("select");
  const [type, setType] = useState<ReconstructionType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(false);
  const [existingPlayerId, setExistingPlayerId] = useState<string | null>(null);
  const [leftPreviewUrl, setLeftPreviewUrl] = useState<string | null>(null);
  const [frontPreviewUrl, setFrontPreviewUrl] = useState<string | null>(null);
  const [rightPreviewUrl, setRightPreviewUrl] = useState<string | null>(null);
  const [backPreviewUrl, setBackPreviewUrl] = useState<string | null>(null);
  
  // File selection state
  const [leftFile, setLeftFile] = useState<File | null>(null);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [rightFile, setRightFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  
  // Image picker modal state
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [currentImageField, setCurrentImageField] = useState<"left" | "front" | "right" | "back" | null>(null);
  const [availableImages, setAvailableImages] = useState<PatientImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);

  const patientId = params?.id ?? "";

  async function handleSelect(nextType: ReconstructionType) {
    setError(null);
    setCheckingExisting(true);
    setType(nextType);
    setExistingPlayerId(null);

    try {
      const response = await fetch("/api/crisalix/reconstructions/existing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, reconstructionType: nextType }),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          exists?: boolean;
          playerId?: string | null;
        };

        if (data.exists && data.playerId) {
          setExistingPlayerId(data.playerId);
          setCheckingExisting(false);
          setStep("choice");
          return;
        }
      }
    } catch {
      // ignore and fall back to creating new
    }

    setCheckingExisting(false);
    setStep("form");
  }

  function handleCancel() {
    router.push(`/patients/${patientId}?mode=medical`);
  }

  function handleUseExisting() {
    if (!type || !existingPlayerId) return;

    void (async () => {
      try {
        await fetch("/api/consultations/3d", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientId,
            reconstructionType: type,
            playerId: existingPlayerId,
          }),
        });
      } catch {
      }

      router.push(`/patients/${patientId}?mode=medical&m_tab=3d`);
    })();
  }

  function handleCreateNew() {
    setExistingPlayerId(null);
    setStep("form");
  }

  // Load patient images from documents
  useEffect(() => {
    if (showImagePicker && availableImages.length === 0) {
      loadPatientImages();
    }
  }, [showImagePicker]);

  async function loadPatientImages() {
    setLoadingImages(true);
    try {
      const { data, error } = await supabaseClient.storage
        .from("patient_document")
        .list(patientId, {
          limit: 100,
          sortBy: { column: "created_at", order: "desc" },
        });

      if (!error && data) {
        const imageFiles = data
          .filter((file) => {
            const ext = file.name.split(".").pop()?.toLowerCase();
            return ["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "");
          })
          .map((file) => {
            const fullPath = `${patientId}/${file.name}`;
            const { data: urlData } = supabaseClient.storage
              .from("patient_document")
              .getPublicUrl(fullPath);
            return {
              name: file.name,
              path: fullPath,
              url: urlData.publicUrl,
              created_at: (file as any).created_at,
            };
          });
        setAvailableImages(imageFiles);
      }
    } catch (err) {
      console.error("Failed to load patient images:", err);
    } finally {
      setLoadingImages(false);
    }
  }

  function handleImageChange(
    event: ChangeEvent<HTMLInputElement>,
    kind: "left" | "front" | "right" | "back",
  ) {
    const file = event.target.files?.[0] ?? null;

    const setPreview =
      kind === "left"
        ? setLeftPreviewUrl
        : kind === "front"
          ? setFrontPreviewUrl
          : kind === "right"
            ? setRightPreviewUrl
            : setBackPreviewUrl;
            
    const setFile =
      kind === "left"
        ? setLeftFile
        : kind === "front"
          ? setFrontFile
          : kind === "right"
            ? setRightFile
            : setBackFile;

    setFile(file);
    setPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return file ? URL.createObjectURL(file) : null;
    });
  }
  
  function openImagePicker(kind: "left" | "front" | "right" | "back") {
    setCurrentImageField(kind);
    setShowImagePicker(true);
  }
  
  async function selectExistingImage(image: PatientImage) {
    if (!currentImageField) return;
    
    try {
      console.log("[3D Setup] Selecting image from gallery:", {
        field: currentImageField,
        imageName: image.name,
        imageUrl: image.url,
      });
      
      // Fetch the image as a blob
      const response = await fetch(image.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }
      
      const blob = await response.blob();
      const file = new File([blob], image.name, { type: blob.type });
      
      console.log("[3D Setup] Image converted to File:", {
        name: file.name,
        type: file.type,
        size: file.size,
        field: currentImageField,
      });
      
      const setPreview =
        currentImageField === "left"
          ? setLeftPreviewUrl
          : currentImageField === "front"
            ? setFrontPreviewUrl
            : currentImageField === "right"
              ? setRightPreviewUrl
              : setBackPreviewUrl;
              
      const setFile =
        currentImageField === "left"
          ? setLeftFile
          : currentImageField === "front"
            ? setFrontFile
            : currentImageField === "right"
              ? setRightFile
              : setBackFile;
      
      setFile(file);
      setPreview(image.url);
      setShowImagePicker(false);
      setCurrentImageField(null);
      
      console.log("[3D Setup] Image selection complete for field:", currentImageField);
    } catch (err) {
      console.error("[3D Setup] Failed to select image:", err);
      alert("Failed to load selected image. Please try again.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!type) return;

    setSubmitting(true);
    setError(null);

    try {
      // Build FormData from scratch to ensure gallery images are included
      const formData = new FormData();
      
      // Add patient and reconstruction info
      formData.append("patient_id", String(patientId));
      formData.append("reconstruction_type", type);
      
      // Get provider from form
      const form = event.currentTarget;
      const providerSelect = form.querySelector('select[name="provider"]') as HTMLSelectElement;
      if (providerSelect) {
        formData.append("provider", providerSelect.value);
      }
      
      console.log("[3D Setup] Preparing form submission:", {
        type,
        patientId,
        hasLeftFile: !!leftFile,
        hasFrontFile: !!frontFile,
        hasRightFile: !!rightFile,
        hasBackFile: !!backFile,
      });
      
      // Compress images before upload to stay under Vercel's 4.5MB body limit
      console.log("[3D Setup] Compressing images...");
      
      // Add image files from state (works for both upload and gallery selection)
      if (leftFile) {
        const compressedLeft = await compressImage(leftFile);
        formData.append("left_profile", compressedLeft, compressedLeft.name);
        console.log("[3D Setup] ✓ Added left_profile:", {
          name: compressedLeft.name,
          originalSize: leftFile.size,
          compressedSize: compressedLeft.size,
          type: compressedLeft.type,
        });
      } else {
        console.warn("[3D Setup] ✗ No left_profile file");
      }
      
      if (frontFile) {
        const compressedFront = await compressImage(frontFile);
        formData.append("front_profile", compressedFront, compressedFront.name);
        console.log("[3D Setup] ✓ Added front_profile:", {
          name: compressedFront.name,
          originalSize: frontFile.size,
          compressedSize: compressedFront.size,
          type: compressedFront.type,
        });
      } else {
        console.warn("[3D Setup] ✗ No front_profile file");
      }
      
      if (rightFile) {
        const compressedRight = await compressImage(rightFile);
        formData.append("right_profile", compressedRight, compressedRight.name);
        console.log("[3D Setup] ✓ Added right_profile:", {
          name: compressedRight.name,
          originalSize: rightFile.size,
          compressedSize: compressedRight.size,
          type: compressedRight.type,
        });
      } else {
        console.warn("[3D Setup] ✗ No right_profile file");
      }
      
      if (type === "body" && backFile) {
        const compressedBack = await compressImage(backFile);
        formData.append("back_profile", compressedBack, compressedBack.name);
        console.log("[3D Setup] ✓ Added back_profile:", {
          name: compressedBack.name,
          originalSize: backFile.size,
          compressedSize: compressedBack.size,
          type: compressedBack.type,
        });
      }
      
      // Add measurements based on reconstruction type
      if (type === "breast") {
        const nippleInput = form.querySelector('input[name="nipple_to_nipple_cm"]') as HTMLInputElement;
        if (nippleInput?.value) {
          formData.append("nipple_to_nipple_cm", nippleInput.value);
          console.log("[3D Setup] Added measurement: nipple_to_nipple_cm =", nippleInput.value);
        }
      } else if (type === "face") {
        const pupilInput = form.querySelector('input[name="pupillary_distance_cm"]') as HTMLInputElement;
        if (pupilInput?.value) {
          formData.append("pupillary_distance_cm", pupilInput.value);
          console.log("[3D Setup] Added measurement: pupillary_distance_cm =", pupilInput.value);
        }
      } else if (type === "body") {
        const hiplineInput = form.querySelector('input[name="hipline_cm"]') as HTMLInputElement;
        if (hiplineInput?.value) {
          formData.append("hipline_cm", hiplineInput.value);
          console.log("[3D Setup] Added measurement: hipline_cm =", hiplineInput.value);
        }
      }
      
      // Log final FormData contents
      console.log("[3D Setup] Final FormData entries:");
      for (const [key, value] of formData.entries()) {
        if (value instanceof File) {
          console.log(`  - ${key}: File(${value.name}, ${value.size} bytes, ${value.type})`);
        } else {
          console.log(`  - ${key}: ${value}`);
        }
      }
      
      console.log("[3D Setup] Submitting to /api/crisalix/patients...");

      const response = await fetch("/api/crisalix/patients", {
        method: "POST",
        body: formData,
      });

      console.log("[3D Setup] Response status:", response.status);

      if (!response.ok) {
        let message = "Failed to create 3D reconstruction.";
        let needsReauth = false;
        
        try {
          const data = (await response.json()) as { error?: string; needsReauth?: boolean };
          if (data?.error) message = data.error;
          needsReauth = data?.needsReauth ?? false;
          
          console.error("[3D Setup] API error:", { message, needsReauth, status: response.status });
        } catch (parseError) {
          console.error("[3D Setup] Failed to parse error response:", parseError);
        }
        
        if (needsReauth) {
          message += " Redirecting to re-authenticate...";
          setError(message);
          setTimeout(() => {
            router.push(`/patients/${patientId}/3d`);
          }, 2000);
        } else {
          setError(message);
        }
        
        setSubmitting(false);
        return;
      }

      const data = (await response.json()) as {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        patient?: { player_id?: string | null } & Record<string, any>;
      };
      const playerId = data.patient?.player_id ?? null;

      console.log("[3D Setup] Success! Player ID:", playerId);

      if (playerId) {
        console.log("[3D Setup] Creating consultation record...");
        try {
          await fetch("/api/consultations/3d", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              patientId,
              reconstructionType: type,
              playerId,
            }),
          });
          console.log("[3D Setup] Consultation record created");
        } catch (err) {
          console.error("[3D Setup] Failed to create consultation:", err);
        }
      }

      console.log("[3D Setup] Redirecting to patient page with 3D player...");
      router.push(
        `/patients/${patientId}?mode=medical&m_tab=3d&show3d=1&cr_player_id=${playerId}&cr_type=${type}`,
      );
    } catch (err) {
      console.error("[3D Setup] Unexpected error:", err);
      setError("An unexpected error occurred. Please try again.");
      setSubmitting(false);
    }
  }

  const title =
    type === "breast"
      ? "Breast (Mammo)"
      : type === "face"
        ? "Face"
        : type === "body"
          ? "Body"
          : "";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4 py-6">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        {step === "select" ? (
          <div className="p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Select Reconstruction Type
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Select which reconstruction type to view:
                </p>
              </div>
              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <button
                type="button"
                onClick={() => handleSelect("breast")}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-slate-700 shadow-sm hover:border-sky-300 hover:bg-sky-50 disabled:opacity-60"
                disabled={checkingExisting}
              >
                <span className="font-medium">Breast (Mammo)</span>
                <span className="rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-semibold text-white">
                  Setup Required
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSelect("face")}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-slate-700 shadow-sm hover:border-sky-300 hover:bg-sky-50 disabled:opacity-60"
                disabled={checkingExisting}
              >
                <span className="font-medium">Face</span>
                <span className="rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-semibold text-white">
                  Setup Required
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSelect("body")}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-slate-700 shadow-sm hover:border-sky-300 hover:bg-sky-50 disabled:opacity-60"
                disabled={checkingExisting}
              >
                <span className="font-medium">Body</span>
                <span className="rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-semibold text-white">
                  Setup Required
                </span>
              </button>
            </div>

            <div className="mt-5 flex items-center justify-between">
              {checkingExisting ? (
                <p className="text-[11px] text-slate-500">
                  Checking for existing 3D simulations...
                </p>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex items-center rounded-full bg-slate-200 px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : step === "choice" ? (
          <div className="p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Existing 3D reconstruction found
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  This patient already has a 3D simulation for this reconstruction type. You can
                  load the existing 3D or create a new one.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </div>

            <div className="mt-2 space-y-3 text-xs">
              <button
                type="button"
                onClick={handleUseExisting}
                className="flex w-full items-center justify-between rounded-xl border border-sky-300 bg-sky-600 px-4 py-3 text-left text-slate-50 shadow-sm hover:bg-sky-700"
              >
                <div>
                  <p className="text-xs font-semibold">Load existing 3D simulation</p>
                  <p className="mt-0.5 text-[11px] text-sky-100">
                    Open the Crisalix viewer with the last saved 3D for this type.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={handleCreateNew}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-slate-700 shadow-sm hover:border-amber-300 hover:bg-amber-50"
              >
                <div>
                  <p className="text-xs font-semibold">Create a new 3D simulation</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Start a new 3D reconstruction using the photos and measurements you
                    provide.
                  </p>
                </div>
              </button>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex items-center rounded-full bg-slate-200 px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  3D Reconstruction Setup
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Configure the reconstruction details and upload the required images.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </div>

            <div className="grid gap-4 text-xs md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-[11px] font-semibold text-slate-700">
                  Reconstruction Type <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  readOnly
                  value={title}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[11px] font-semibold text-slate-700">
                  Provider <span className="text-red-500">*</span>
                </label>
                <select
                  name="provider"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"
                  defaultValue="Provider 4"
                >
                  <option value="Provider 1">Provider 1</option>
                  <option value="Provider 2">Provider 2</option>
                  <option value="Provider 3">Provider 3</option>
                  <option value="Provider 4">Provider 4</option>
                </select>
              </div>
            </div>

            <div className="mt-4 space-y-2 text-xs">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Required Images
              </h3>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="block text-[11px] font-medium text-slate-700">
                    Left Profile <span className="text-red-500">*</span>
                  </label>
                  {leftPreviewUrl ? (
                    <div className="relative overflow-hidden rounded-lg border-2 border-emerald-400 bg-slate-50">
                      <img
                        src={leftPreviewUrl}
                        alt="Left profile preview"
                        className="h-32 w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setLeftPreviewUrl(null);
                          setLeftFile(null);
                        }}
                        className="absolute top-1 right-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <label className="flex-1 cursor-pointer">
                        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-sky-400 bg-gradient-to-br from-sky-50 to-white px-3 py-3 text-center hover:border-sky-500 hover:from-sky-100 hover:to-sky-50 transition-all">
                          <svg className="h-6 w-6 text-sky-600 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <span className="text-[11px] font-semibold text-sky-700">Upload</span>
                          <span className="text-[9px] text-slate-500 mt-0.5">New file</span>
                        </div>
                        <input
                          type="file"
                          name="left_profile"
                          accept="image/*"
                          className="sr-only"
                          onChange={(event) => handleImageChange(event, "left")}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => openImagePicker("left")}
                        className="flex-1 flex flex-col items-center justify-center rounded-lg border border-dashed border-emerald-400 bg-gradient-to-br from-emerald-50 to-white px-3 py-3 text-center hover:border-emerald-500 hover:from-emerald-100 hover:to-emerald-50 transition-all"
                      >
                        <svg className="h-6 w-6 text-emerald-600 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-[11px] font-semibold text-emerald-700">Select</span>
                        <span className="text-[9px] text-slate-500 mt-0.5">From docs</span>
                      </button>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="block text-[11px] font-medium text-slate-700">
                    Front/Portrait <span className="text-red-500">*</span>
                  </label>
                  {frontPreviewUrl ? (
                    <div className="relative overflow-hidden rounded-lg border-2 border-emerald-400 bg-slate-50">
                      <img
                        src={frontPreviewUrl}
                        alt="Front/portrait preview"
                        className="h-32 w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setFrontPreviewUrl(null);
                          setFrontFile(null);
                        }}
                        className="absolute top-1 right-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <label className="flex-1 cursor-pointer">
                        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-sky-400 bg-gradient-to-br from-sky-50 to-white px-3 py-3 text-center hover:border-sky-500 hover:from-sky-100 hover:to-sky-50 transition-all">
                          <svg className="h-6 w-6 text-sky-600 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <span className="text-[11px] font-semibold text-sky-700">Upload</span>
                          <span className="text-[9px] text-slate-500 mt-0.5">New file</span>
                        </div>
                        <input
                          type="file"
                          name="front_profile"
                          accept="image/*"
                          className="sr-only"
                          onChange={(event) => handleImageChange(event, "front")}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => openImagePicker("front")}
                        className="flex-1 flex flex-col items-center justify-center rounded-lg border border-dashed border-emerald-400 bg-gradient-to-br from-emerald-50 to-white px-3 py-3 text-center hover:border-emerald-500 hover:from-emerald-100 hover:to-emerald-50 transition-all"
                      >
                        <svg className="h-6 w-6 text-emerald-600 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-[11px] font-semibold text-emerald-700">Select</span>
                        <span className="text-[9px] text-slate-500 mt-0.5">From docs</span>
                      </button>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="block text-[11px] font-medium text-slate-700">
                    Right Profile <span className="text-red-500">*</span>
                  </label>
                  {rightPreviewUrl ? (
                    <div className="relative overflow-hidden rounded-lg border-2 border-emerald-400 bg-slate-50">
                      <img
                        src={rightPreviewUrl}
                        alt="Right profile preview"
                        className="h-32 w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setRightPreviewUrl(null);
                          setRightFile(null);
                        }}
                        className="absolute top-1 right-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <label className="flex-1 cursor-pointer">
                        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-sky-400 bg-gradient-to-br from-sky-50 to-white px-3 py-3 text-center hover:border-sky-500 hover:from-sky-100 hover:to-sky-50 transition-all">
                          <svg className="h-6 w-6 text-sky-600 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <span className="text-[11px] font-semibold text-sky-700">Upload</span>
                          <span className="text-[9px] text-slate-500 mt-0.5">New file</span>
                        </div>
                        <input
                          type="file"
                          name="right_profile"
                          accept="image/*"
                          className="sr-only"
                          onChange={(event) => handleImageChange(event, "right")}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => openImagePicker("right")}
                        className="flex-1 flex flex-col items-center justify-center rounded-lg border border-dashed border-emerald-400 bg-gradient-to-br from-emerald-50 to-white px-3 py-3 text-center hover:border-emerald-500 hover:from-emerald-100 hover:to-emerald-50 transition-all"
                      >
                        <svg className="h-6 w-6 text-emerald-600 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-[11px] font-semibold text-emerald-700">Select</span>
                        <span className="text-[9px] text-slate-500 mt-0.5">From docs</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {type === "body" ? (
                <div className="mt-3 grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="block text-[11px] font-medium text-slate-700">
                      Back Profile <span className="text-red-500">*</span>
                    </label>
                    {backPreviewUrl ? (
                      <div className="relative overflow-hidden rounded-lg border-2 border-emerald-400 bg-slate-50">
                        <img
                          src={backPreviewUrl}
                          alt="Back profile preview"
                          className="h-32 w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setBackPreviewUrl(null);
                            setBackFile(null);
                          }}
                          className="absolute top-1 right-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <label className="flex-1 cursor-pointer">
                          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-sky-400 bg-gradient-to-br from-sky-50 to-white px-3 py-3 text-center hover:border-sky-500 hover:from-sky-100 hover:to-sky-50 transition-all">
                            <svg className="h-6 w-6 text-sky-600 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            <span className="text-[11px] font-semibold text-sky-700">Upload</span>
                            <span className="text-[9px] text-slate-500 mt-0.5">New file</span>
                          </div>
                          <input
                            type="file"
                            name="back_profile"
                            accept="image/*"
                            className="sr-only"
                            onChange={(event) => handleImageChange(event, "back")}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => openImagePicker("back")}
                          className="flex-1 flex flex-col items-center justify-center rounded-lg border border-dashed border-emerald-400 bg-gradient-to-br from-emerald-50 to-white px-3 py-3 text-center hover:border-emerald-500 hover:from-emerald-100 hover:to-emerald-50 transition-all"
                        >
                          <svg className="h-6 w-6 text-emerald-600 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-[11px] font-semibold text-emerald-700">Select</span>
                          <span className="text-[9px] text-slate-500 mt-0.5">From docs</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 space-y-2 text-xs">
              {type === "breast" && (
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">
                    Nipple to Nipple Distance (cm) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="nipple_to_nipple_cm"
                    placeholder="e.g., 18.5"
                    required
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                </div>
              )}

              {type === "face" && (
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">
                    Pupillary Distance (cm) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="pupillary_distance_cm"
                    placeholder="e.g., 6.3"
                    required
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                </div>
              )}

              {type === "body" && (
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">
                    Hipline (cm) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="hipline_cm"
                    placeholder="e.g., 95.0"
                    required
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                </div>
              )}
            </div>

            {error ? (
              <p className="mt-3 text-[11px] text-red-600">{error}</p>
            ) : null}

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex items-center rounded-full bg-slate-200 px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center rounded-full bg-sky-600 px-4 py-1.5 text-xs font-medium text-white shadow-[0_10px_25px_rgba(15,23,42,0.22)] hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Creating..." : "Create 3D Reconstruction"}
              </button>
            </div>
          </form>
        )}
      </div>
      
      {/* Image Picker Modal */}
      {showImagePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl max-h-[80vh] rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Select Image from Documents
                </h3>
                <p className="text-sm text-emerald-100 mt-0.5">
                  Choose an existing image from patient documents
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowImagePicker(false);
                  setCurrentImageField(null);
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {loadingImages ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
                  <p className="mt-4 text-sm text-slate-600">Loading images...</p>
                </div>
              ) : availableImages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <svg className="h-16 w-16 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="mt-4 text-sm font-medium text-slate-700">No images found</p>
                  <p className="mt-1 text-xs text-slate-500">Upload images to the Documents tab first</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {availableImages.map((image) => (
                    <button
                      key={image.path}
                      type="button"
                      onClick={() => selectExistingImage(image)}
                      className="group relative overflow-hidden rounded-lg border-2 border-slate-200 bg-slate-50 hover:border-emerald-500 hover:shadow-lg transition-all"
                    >
                      <div className="aspect-square relative">
                        <img
                          src={image.url}
                          alt={image.name}
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="absolute bottom-0 left-0 right-0 p-2 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-xs font-medium truncate">{image.name}</p>
                        </div>
                      </div>
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-emerald-500 text-white shadow-lg">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-200 px-6 py-4 bg-slate-50">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-600">
                  {availableImages.length} image{availableImages.length !== 1 ? 's' : ''} available
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowImagePicker(false);
                    setCurrentImageField(null);
                  }}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
