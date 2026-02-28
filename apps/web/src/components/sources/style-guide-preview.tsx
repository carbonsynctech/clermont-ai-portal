"use client";

import { useState, useEffect, useCallback } from "react";
import { Type, Palette, Layers, Check, ChevronDown, ChevronUp, Sparkles, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useJobStatus } from "@/hooks/use-job-status";
import {
  ColorPicker,
  ColorPickerAlphaSlider,
  ColorPickerArea,
  ColorPickerContent,
  ColorPickerEyeDropper,
  ColorPickerFormatSelect,
  ColorPickerHueSlider,
  ColorPickerInput,
  ColorPickerTrigger,
} from "@/components/ui/color-picker";

// ── Typography scale ──────────────────────────────────────────────────────────

const TYPOGRAPHY_SCALE = [
  { label: "H1", className: "text-3xl font-bold tracking-tight", sample: "Section Heading" },
  { label: "H2", className: "text-2xl font-semibold tracking-tight", sample: "Sub-Section Title" },
  { label: "H3", className: "text-xl font-semibold", sample: "Topic Heading" },
  { label: "H4", className: "text-lg font-medium", sample: "Sub-Topic" },
  { label: "Body", className: "text-base font-normal leading-relaxed", sample: "Standard paragraph text used for the main content of the document." },
  { label: "Small", className: "text-sm font-normal text-muted-foreground", sample: "Supporting detail and reference text throughout each section." },
  { label: "Caption", className: "text-xs font-normal text-muted-foreground", sample: "Figure captions, footnotes, and source citations." },
];

// ── Colour palette ────────────────────────────────────────────────────────────

const DEFAULT_COLOR_PALETTE = [
  { name: "Primary", hex: "#0F2A4A", description: "Deep Navy" },
  { name: "Secondary", hex: "#1A5276", description: "Corp. Blue" },
  { name: "Accent", hex: "#C9A84C", description: "Gold" },
  { name: "Neutral", hex: "#374151", description: "Charcoal" },
  { name: "Muted", hex: "#9CA3AF", description: "Slate Gray" },
  { name: "Surface", hex: "#F8FAFC", description: "Off White" },
];

// ── Cover image types ─────────────────────────────────────────────────────────

type CoverStyle = "corporate" | "modern" | "minimal" | "bold";

interface CoverImageItem {
  style: CoverStyle;
  signedUrl: string;
  mimeType: string;
}

interface CoverImagesResponse {
  styleGuideId: string;
  images: CoverImageItem[];
  selectedStyle: CoverStyle | null;
  generatedAt: string;
}

// ── Main component ────────────────────────────────────────────────────────────

interface StyleGuidePreviewProps {
  projectId: string;
  projectTitle: string;
  companyName?: string;
  onGeneratingChange?: (generating: boolean) => void;
}

export function StyleGuidePreview({ projectId, projectTitle, companyName, onGeneratingChange }: StyleGuidePreviewProps) {
  const [typographyOpen, setTypographyOpen] = useState(true);
  const [colorsOpen, setColorsOpen] = useState(true);
  const [colorPalette, setColorPalette] = useState(DEFAULT_COLOR_PALETTE);

  // Cover image state
  const [jobId, setJobId] = useState<string | null>(null);
  const [coverImages, setCoverImages] = useState<CoverImageItem[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<CoverStyle | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  // Poll the generation job
  const { status: jobStatus, isPolling, error: jobError } = useJobStatus(jobId);

  const handleColorChange = useCallback((index: number, newHex: string) => {
    setColorPalette((prev) =>
      prev.map((c, i) => (i === index ? { ...c, hex: newHex } : c))
    );
  }, []);

  // Fetch existing cover images on mount
  useEffect(() => {
    async function fetchImages() {
      try {
        const res = await fetch(`/api/projects/${projectId}/cover-images`);
        if (!res.ok) return;
        const data = (await res.json()) as CoverImagesResponse;
        if (data.images.length > 0) {
          setCoverImages(data.images);
          setSelectedStyle(data.selectedStyle);
        }
      } catch {
        // silently ignore — user can regenerate
      } finally {
        setHasFetched(true);
      }
    }
    void fetchImages();
  }, [projectId]);

  // When job completes, fetch the generated images
  useEffect(() => {
    if (jobStatus !== "completed") return;
    setJobId(null);

    async function loadImages() {
      try {
        const res = await fetch(`/api/projects/${projectId}/cover-images`);
        if (!res.ok) return;
        const data = (await res.json()) as CoverImagesResponse;
        setCoverImages(data.images);
        setSelectedStyle(data.selectedStyle);
      } catch {
        setGenerateError("Images generated but failed to load. Please refresh.");
      }
    }
    void loadImages();
  }, [jobStatus, projectId]);

  async function triggerGenerate() {
    setIsTriggering(true);
    setGenerateError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/cover-images`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setGenerateError(body.error ?? "Failed to start generation");
        return;
      }
      const data = (await res.json()) as { jobId: string; status: string };
      setJobId(data.jobId);
    } catch {
      setGenerateError("Network error — could not start generation.");
    } finally {
      setIsTriggering(false);
    }
  }

  async function selectCoverStyle(style: CoverStyle) {
    setSelectedStyle(style);
    try {
      await fetch(`/api/projects/${projectId}/cover-images`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedStyle: style }),
      });
    } catch {
      // optimistic update stays; silently ignore
    }
  }

  const isGenerating = isTriggering || (jobId !== null && (jobStatus === "pending" || jobStatus === "running" || isPolling));
  const hasFailed = jobStatus === "failed" && jobId === null && !isGenerating;

  useEffect(() => {
    onGeneratingChange?.(isGenerating);
  }, [isGenerating, onGeneratingChange]);

  return (
    <div className="space-y-3 mt-4">
      {/* Typography */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors text-left"
          onClick={() => setTypographyOpen((o) => !o)}
        >
          <div className="flex items-center gap-2">
            <Type className="size-4 text-muted-foreground" />
            <span className="font-medium text-base text-foreground">Typography</span>
          </div>
          {typographyOpen
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />
          }
        </button>

        {typographyOpen && (
          <div className="border-t divide-y">
            {TYPOGRAPHY_SCALE.map(({ label, className, sample }) => (
              <div key={label} className="flex items-baseline gap-4 px-4 py-3">
                <span className="text-xs text-muted-foreground w-12 shrink-0 tabular-nums">{label}</span>
                <span className={className}>{sample}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Colour Palette */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors text-left"
          onClick={() => setColorsOpen((o) => !o)}
        >
          <div className="flex items-center gap-2">
            <Palette className="size-4 text-muted-foreground" />
            <span className="font-medium text-base text-foreground">Colour Palette</span>
          </div>
          {colorsOpen
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />
          }
        </button>

        {colorsOpen && (
          <div className="border-t px-4 py-4">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
              {colorPalette.map(({ name, hex, description }, index) => (
                <ColorPicker
                  key={name}
                  defaultFormat="hex"
                  defaultValue={hex}
                  onValueChange={(newColor) => handleColorChange(index, newColor)}
                >
                  <div className="flex flex-col items-center gap-1.5">
                    <ColorPickerTrigger asChild>
                      <button
                        type="button"
                        className="w-10 h-10 rounded-lg shadow-sm border border-black/5 cursor-pointer transition-transform hover:scale-110 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        style={{ backgroundColor: hex }}
                      />
                    </ColorPickerTrigger>
                    <div className="text-center">
                      <div className="text-xs font-medium leading-tight">{name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono leading-tight">{hex}</div>
                      <div className="text-[10px] text-muted-foreground leading-tight">{description}</div>
                    </div>
                  </div>
                  <ColorPickerContent>
                    <ColorPickerArea />
                    <div className="flex items-center gap-2">
                      <ColorPickerEyeDropper />
                      <div className="flex flex-1 flex-col gap-2">
                        <ColorPickerHueSlider />
                        <ColorPickerAlphaSlider />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <ColorPickerFormatSelect />
                      <ColorPickerInput />
                    </div>
                  </ColorPickerContent>
                </ColorPicker>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Cover Design */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <Layers className="size-4 text-muted-foreground" />
          <span className="font-medium text-base text-foreground">Cover Design</span>
          {coverImages.length > 0 && !isGenerating && (
            <button
              type="button"
              onClick={() => void triggerGenerate()}
              className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="Regenerate cover images"
            >
              <RefreshCw className="h-3 w-3" />
              Regenerate
            </button>
          )}
        </div>

        <div className="px-4 py-4">
          {/* Generating state */}
          {isGenerating && (
            <div className="flex flex-col items-center justify-center gap-3 py-8">
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-primary animate-pulse" />
                </div>
                <Loader2 className="h-12 w-12 text-primary/30 animate-spin absolute inset-0" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">Generating cover images…</p>
                <p className="text-xs text-muted-foreground mt-1">
                  AI is designing 4 cover styles. This takes about 30–60 seconds.
                </p>
              </div>
            </div>
          )}

          {/* Error state */}
          {!isGenerating && (generateError ?? (hasFailed ? jobError : null)) && (
            <div className="flex items-start gap-3 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 mb-4">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div className="text-sm text-destructive">
                {generateError ?? jobError ?? "Generation failed."}
              </div>
            </div>
          )}

          {/* No images yet — show generate button */}
          {!isGenerating && hasFetched && coverImages.length === 0 && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="text-center">
                <p className="text-sm font-medium">No cover images yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Generate 4 AI cover designs tailored to {companyName ?? projectTitle}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void triggerGenerate()}
                disabled={isTriggering}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles className="h-4 w-4" />
                Generate Cover Images
              </button>
            </div>
          )}

          {/* Images grid */}
          {!isGenerating && coverImages.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-3">
                Select a cover style to use for your document export.
              </p>
              <div className="flex flex-wrap gap-4">
                {coverImages.map((img) => (
                  <button
                    key={img.style}
                    type="button"
                    onClick={() => void selectCoverStyle(img.style)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl p-2 transition-all cursor-pointer",
                      selectedStyle === img.style
                        ? "bg-primary/5 ring-2 ring-primary ring-offset-2"
                        : "ring-1 ring-border hover:ring-primary/40 hover:bg-muted/40"
                    )}
                  >
                    <div
                      className="relative rounded overflow-hidden shadow-md bg-muted"
                      style={{ width: 90, height: 127 }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.signedUrl}
                        alt={`${img.style} cover design`}
                        className="w-full h-full object-cover"
                      />
                      {selectedStyle === img.style && (
                        <div
                          className="absolute inset-0 flex items-center justify-center"
                          style={{ backgroundColor: "rgba(0,0,0,0.12)" }}
                        >
                          <div className="bg-primary text-primary-foreground rounded-full p-0.5">
                            <Check className="h-3 w-3" />
                          </div>
                        </div>
                      )}
                    </div>
                    <span className={cn(
                      "text-xs font-medium capitalize",
                      selectedStyle === img.style ? "text-primary" : "text-muted-foreground"
                    )}>
                      {img.style}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
