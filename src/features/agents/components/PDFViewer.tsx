"use client";

import { useState, useEffect, useRef } from "react";
import { Download, Loader2, ExternalLink } from "lucide-react";

type PDFViewerProps = {
  pdfData: string; // base64 data URL or ArrayBuffer
  fileName?: string;
};

export const PDFViewer = ({ pdfData, fileName }: PDFViewerProps) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Ensure component only runs on client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Create blob URL from PDF data
  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;

    let blobUrl: string | null = null;

    const createBlobUrl = async () => {
      try {
        setLoading(true);
        setError(null);

        // Convert data URL or base64 to ArrayBuffer
        let arrayBuffer: ArrayBuffer;
        if (typeof pdfData === "string" && pdfData.startsWith("data:")) {
          // Extract base64 part
          const base64 = pdfData.split(",")[1];
          const binaryString = atob(base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          arrayBuffer = bytes.buffer;
        } else if (typeof pdfData === "string") {
          // Assume it's base64 without data URL prefix
          const binaryString = atob(pdfData);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          arrayBuffer = bytes.buffer;
        } else {
          arrayBuffer = pdfData as ArrayBuffer;
        }

        // Create blob and object URL
        const blob = new Blob([arrayBuffer], { type: "application/pdf" });
        blobUrl = URL.createObjectURL(blob);
        setPdfUrl(blobUrl);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load PDF";
        setError(msg);
        console.error("PDF load error:", err);
      } finally {
        setLoading(false);
      }
    };

    void createBlobUrl();

    // Cleanup: revoke object URL when component unmounts or pdfData changes
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [pdfData, mounted]);

  // Don't render until mounted (client-side only)
  if (!mounted) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin mb-4" />
        <p className="text-sm">Initializing PDF viewer...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin mb-4" />
        <p className="text-sm">Loading PDF...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-muted-foreground">
        <p className="text-sm font-semibold text-destructive mb-2">Failed to load PDF</p>
        <p className="text-xs mb-4">{error}</p>
        {pdfUrl && (
          <a
            href={pdfUrl}
            download={fileName || "document.pdf"}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/50 text-primary transition-colors text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </a>
        )}
      </div>
    );
  }

  if (!pdfUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-muted-foreground">
        <p className="text-sm">No PDF data available</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with download button */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border/50 bg-muted/30">
        <span className="text-xs font-medium text-muted-foreground">
          {fileName || "PDF Document"}
        </span>
        <div className="flex items-center gap-2">
          <a
            href={pdfUrl}
            download={fileName || "document.pdf"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:bg-muted transition text-xs font-medium"
            aria-label="Download PDF"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </a>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:bg-muted transition text-xs font-medium"
            aria-label="Open PDF in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open
          </a>
        </div>
      </div>

      {/* PDF iframe */}
      <div className="flex-1 overflow-hidden bg-gray-100 dark:bg-gray-900">
        <iframe
          ref={iframeRef}
          src={pdfUrl}
          className="w-full h-full border-0"
          title={fileName || "PDF Viewer"}
          style={{ minHeight: "600px" }}
        />
      </div>
    </div>
  );
};
