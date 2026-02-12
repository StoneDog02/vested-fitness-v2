import { useState } from "react";
import Modal from "./Modal";
import Button from "./Button";

interface FullScreenImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  imageAlt?: string;
  dateTaken?: string;
  notes?: string;
  comparisonMode?: boolean;
  comparisonPhotos?: [ProgressPhoto, ProgressPhoto] | null;
}

interface ProgressPhoto {
  id: string;
  photo_url: string;
  notes?: string;
  created_at: string;
}

export default function FullScreenImageModal({
  isOpen,
  onClose,
  imageUrl,
  imageAlt = "Full screen image",
  dateTaken,
  notes,
  comparisonMode = false,
  comparisonPhotos,
}: FullScreenImageModalProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const safeFilename = (s: string) =>
    s.replace(/[/\\?*:|\s]/g, '-').replace(/-+/g, '-');

  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadingComparison, setIsDownloadingComparison] = useState(false);

  const canShareFile = (file: File) =>
    typeof navigator !== "undefined" &&
    navigator.canShare?.({ files: [file] }) === true;

  const saveOrShareBlob = (blob: Blob, filename: string, title = "Progress photo") => {
    const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
    if (canShareFile(file)) {
      navigator.share({ files: [file], title }).catch(() => {
        triggerBlobDownload(blob, filename);
      });
    } else {
      triggerBlobDownload(blob, filename);
    }
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const res = await fetch(imageUrl, { mode: "cors" });
      if (!res.ok) throw new Error("Failed to fetch image");
      const blob = await res.blob();
      const filename = `progress-photo-${dateTaken ? safeFilename(formatDate(dateTaken)) : Date.now()}.jpg`;
      saveOrShareBlob(blob, filename);
    } catch (e) {
      console.error("Download failed:", e);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadComparison = async () => {
    if (!comparisonPhotos) return;
    const [left, right] = comparisonPhotos;
    const loadImage = (url: string): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = url;
      });
    setIsDownloadingComparison(true);
    try {
      const [img1, img2] = await Promise.all([
        loadImage(left.photo_url),
        loadImage(right.photo_url),
      ]);
      const maxH = Math.max(img1.naturalHeight, img2.naturalHeight);
      const w1 = (img1.naturalWidth / img1.naturalHeight) * maxH;
      const w2 = (img2.naturalWidth / img2.naturalHeight) * maxH;
      const dividerWidth = 4;
      const totalWidth = w1 + dividerWidth + w2;
      const canvas = document.createElement("canvas");
      canvas.width = totalWidth;
      canvas.height = maxH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, totalWidth, maxH);
      ctx.drawImage(img1, 0, 0, w1, maxH);
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillRect(w1, 0, dividerWidth, maxH);
      ctx.drawImage(img2, w1 + dividerWidth, 0, w2, maxH);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillText(formatDate(left.created_at), 8, 24);
      ctx.fillText(formatDate(right.created_at), w1 + dividerWidth + 8, 24);
      const filename = `progress-comparison-${safeFilename(formatDate(left.created_at))}-vs-${safeFilename(formatDate(right.created_at))}.jpg`;
      canvas.toBlob(
        (blob) => {
          if (blob) saveOrShareBlob(blob, filename, "Progress comparison");
          setIsDownloadingComparison(false);
        },
        "image/jpeg",
        0.92
      );
    } catch (e) {
      console.error("Comparison download failed (e.g. CORS):", e);
      setIsDownloadingComparison(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      size="full"
      hideCloseButton
    >
      <div className="relative w-full h-full flex flex-col">
        {/* Full-screen image container */}
        <div className="flex-1 relative bg-black">
          {comparisonMode && comparisonPhotos ? (
            <div className="w-full h-full flex">
              {/* Left image */}
              <div className="w-1/2 h-full relative">
                <img
                  src={comparisonPhotos[0].photo_url}
                  alt="Comparison - first"
                  className="w-full h-full object-contain"
                />
                <div className="absolute top-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-sm">
                  {formatDate(comparisonPhotos[0].created_at)}
                </div>
              </div>
              
              {/* Divider */}
              <div className="w-1 bg-white/20"></div>
              
              {/* Right image */}
              <div className="w-1/2 h-full relative">
                <img
                  src={comparisonPhotos[1].photo_url}
                  alt="Comparison - second"
                  className="w-full h-full object-contain"
                />
                <div className="absolute top-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-sm">
                  {formatDate(comparisonPhotos[1].created_at)}
                </div>
              </div>
            </div>
          ) : (
            <img
              src={imageUrl}
              alt={imageAlt}
              className="w-full h-full object-contain"
            />
          )}
          
          {/* Overlay controls */}
          <div className="absolute top-4 right-4 flex space-x-2">
            {comparisonMode && comparisonPhotos ? (
              <button
                onClick={handleDownloadComparison}
                disabled={isDownloadingComparison}
                className="bg-black/50 hover:bg-black/70 text-white rounded-full p-3 transition-colors disabled:opacity-60"
                title="Download comparison"
              >
                {isDownloadingComparison ? (
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
              </button>
            ) : !comparisonMode ? (
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="bg-black/50 hover:bg-black/70 text-white rounded-full p-3 transition-colors disabled:opacity-60"
                title="Download"
              >
                {isDownloading ? (
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
              </button>
            ) : null}
            <button
              onClick={onClose}
              className="bg-black/50 hover:bg-black/70 text-white rounded-full p-3 transition-colors"
              title="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Info panel at bottom */}
        {(dateTaken || notes || (comparisonMode && comparisonPhotos)) && (
          <div className="bg-white dark:bg-night border-t border-gray-200 dark:border-gray-700 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex-1">
                {comparisonMode && comparisonPhotos ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Left Photo:
                      </span>
                      <span className="text-sm text-gray-900 dark:text-gray-100 ml-2">
                        {formatDate(comparisonPhotos[0].created_at)}
                      </span>
                      {comparisonPhotos[0].notes && (
                        <div className="mt-1">
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            Notes:
                          </span>
                          <span className="text-sm text-gray-900 dark:text-gray-100 ml-2">
                            {comparisonPhotos[0].notes}
                          </span>
                        </div>
                      )}
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Right Photo:
                      </span>
                      <span className="text-sm text-gray-900 dark:text-gray-100 ml-2">
                        {formatDate(comparisonPhotos[1].created_at)}
                      </span>
                      {comparisonPhotos[1].notes && (
                        <div className="mt-1">
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            Notes:
                          </span>
                          <span className="text-sm text-gray-900 dark:text-gray-100 ml-2">
                            {comparisonPhotos[1].notes}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    {dateTaken && (
                      <div className="mb-2 sm:mb-0">
                        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          Date Taken:
                        </span>
                        <span className="text-sm text-gray-900 dark:text-gray-100 ml-2">
                          {formatDate(dateTaken)}
                        </span>
                      </div>
                    )}
                    {notes && (
                      <div>
                        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          Notes:
                        </span>
                        <span className="text-sm text-gray-900 dark:text-gray-100 ml-2">
                          {notes}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="flex space-x-2">
                {comparisonMode && comparisonPhotos ? (
                  <Button
                    variant="secondary"
                    onClick={handleDownloadComparison}
                    disabled={isDownloadingComparison}
                    size="sm"
                  >
                    {isDownloadingComparison ? "Preparing…" : "Download comparison"}
                  </Button>
                ) : !comparisonMode ? (
                  <Button
                    variant="secondary"
                    onClick={handleDownload}
                    disabled={isDownloading}
                    size="sm"
                  >
                    {isDownloading ? "Preparing…" : "Download"}
                  </Button>
                ) : null}
                <Button
                  variant="primary"
                  onClick={onClose}
                  size="sm"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
} 