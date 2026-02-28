"use client";

import { useState } from "react";
import Link from "next/link";
import { PipelineStepNav } from "./pipeline-step-nav";
import { DefineTaskStep } from "./steps/define-task-step";
import { StepTrigger } from "./step-trigger";
import { PersonaSelector } from "@/components/personas/persona-selector";
import { MaterialUpload } from "@/components/sources/material-upload";
import { StyleGuideUpload } from "@/components/sources/style-guide-upload";
import { VersionsPanel } from "@/components/versions/versions-panel";
import { InlineEditor } from "@/components/review/inline-editor";
import { CritiqueSelector } from "@/components/review/critique-selector";
import { Badge } from "@/components/ui/badge";
import type {
  Stage,
  Persona,
  SourceMaterial,
  Version,
  StyleGuide,
  Project,
} from "@repo/db";
import type { ProjectBriefData } from "@repo/db";

const STEP_TITLES: Record<number, string> = {
  1: "Define Task",
  2: "Select Personas",
  3: "Source Material",
  4: "Generate Drafts",
  5: "Synthesize",
  6: "Style Guide",
  7: "Edit for Style",
  8: "Fact-Check",
  9: "Final Polish",
  10: "Human Review",
  11: "Devil's Advocate",
  12: "Integrate Critiques",
  13: "Export",
};

const STEP_PHASES: Record<number, string> = {
  1: "Setup Phase", 2: "Setup Phase", 3: "Setup Phase",
  4: "Generate Phase", 5: "Generate Phase",
  6: "Polish Phase", 7: "Polish Phase", 8: "Polish Phase", 9: "Polish Phase",
  10: "Review Phase", 11: "Review Phase", 12: "Review Phase", 13: "Review Phase",
};

interface PipelineViewProps {
  project: Project;
  stages: Stage[];
  personas: Persona[];
  materials: SourceMaterial[];
  versions: Version[];
  latestStyleGuide: StyleGuide | null;
  initialStep: number;
  step10DraftContent: string | null;
}

export function PipelineView({
  project,
  stages,
  personas,
  materials,
  versions,
  latestStyleGuide,
  initialStep,
  step10DraftContent,
}: PipelineViewProps) {
  const [activeStep, setActiveStep] = useState(initialStep);

  const stageMap = Object.fromEntries(stages.map((s) => [s.stepNumber, s]));
  const brief = project.briefData as ProjectBriefData | null;

  const selectedPersonas = personas
    .filter((p) => p.isSelected)
    .sort((a, b) => (a.selectionOrder ?? 0) - (b.selectionOrder ?? 0));
  const personaDrafts = versions.filter((v) => v.versionType === "persona_draft");
  const factCheckVersion = versions.filter((v) => v.versionType === "fact_checked").at(-1);

  function handleStepClick(step: number) {
    setActiveStep(step);
  }

  function renderStepContent() {
    const step = activeStep;
    const stage = stageMap[step];
    const status = stage?.status ?? "pending";

    switch (step) {
      case 1:
        return (
          <DefineTaskStep
            projectId={project.id}
            projectTitle={project.title}
            briefData={brief}
            stage1Status={status}
            masterPrompt={project.masterPrompt ?? null}
          />
        );

      case 2:
        const canRunStep2 = stageMap[1]?.status === "completed";
        return (
          <div className="space-y-5">
            {!canRunStep2 && <PrerequisiteNotice message="Complete Step 1 to run this step." />}
            {status === "completed" && selectedPersonas.length > 0 && (
              <div className="rounded-xl border bg-card p-6 space-y-3">
                <h3 className="font-medium text-sm">Selected Personas</h3>
                <div className="space-y-2">
                  {selectedPersonas.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs h-5 px-1.5 shrink-0">{i + 1}</Badge>
                      <span className="text-sm text-foreground">{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {status === "awaiting_human" && (
              <PersonaSelector projectId={project.id} personas={personas} />
            )}
            {(status === "pending" || !stage) && (
              <div className="rounded-xl border bg-card p-6">
                <StepTrigger
                  projectId={project.id}
                  stepNumber={2}
                  label="Suggest Expert Personas"
                  currentStatus={status}
                  disabled={!canRunStep2}
                  disabledReason="Complete Step 1 to run this step."
                />
              </div>
            )}
          </div>
        );

      case 3:
        const canRunStep3 = stageMap[2]?.status === "completed";
        return (
          <div className="rounded-xl border bg-card p-6">
            {!canRunStep3 && <PrerequisiteNotice message="Complete Step 2 to run this step." />}
            {status === "completed" ? (
              <div className="space-y-2">
                <h3 className="font-medium text-sm mb-3">Uploaded Files</h3>
                {materials.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <span className="truncate text-foreground">{m.originalFilename}</span>
                    <span className="text-muted-foreground shrink-0 ml-2">{m.chunkCount} chunks</span>
                  </div>
                ))}
              </div>
            ) : (
              <MaterialUpload projectId={project.id} materials={materials} />
            )}
          </div>
        );

      case 4:
        const canRunStep4 = stageMap[3]?.status === "completed";
        return (
          <div className="rounded-xl border bg-card p-6 space-y-4">
            {!canRunStep4 && <PrerequisiteNotice message="Complete Step 3 to run this step." />}
            {status === "completed" && personaDrafts.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-medium text-sm mb-1">Generated Drafts</h3>
                {personaDrafts.map((v) => (
                  <div key={v.id} className="flex items-center justify-between text-sm">
                    <span className="truncate text-foreground">{v.internalLabel}</span>
                    <span className="text-muted-foreground shrink-0 ml-2">
                      {v.wordCount?.toLocaleString() ?? "–"} words
                    </span>
                  </div>
                ))}
              </div>
            )}
            {status !== "completed" && (
              <StepTrigger
                projectId={project.id}
                stepNumber={4}
                label="Generate Persona Drafts (×5 parallel)"
                currentStatus={status}
                disabled={!canRunStep4}
                disabledReason="Complete Step 3 to run this step."
              />
            )}
          </div>
        );

      case 5:
        const canRunStep5 = stageMap[4]?.status === "completed";
        return (
          <div className="rounded-xl border bg-card p-6 space-y-4">
            {!canRunStep5 && <PrerequisiteNotice message="Complete Step 4 to run this step." />}
            {status === "completed" && (
              <p className="text-sm text-muted-foreground">
                Synthesis complete —{" "}
                {versions.find((v) => v.versionType === "synthesis")?.wordCount?.toLocaleString() ?? "?"} words.
              </p>
            )}
            {status !== "completed" && (
              <StepTrigger
                projectId={project.id}
                stepNumber={5}
                label="Synthesise Drafts"
                currentStatus={status}
                disabled={!canRunStep5}
                disabledReason="Complete Step 4 to run this step."
              />
            )}
          </div>
        );

      case 6:
      case 7:
        const canRunStep67 = stageMap[5]?.status === "completed";
        return (
          <div className="rounded-xl border bg-card p-6 space-y-4">
            {!canRunStep67 && <PrerequisiteNotice message="Complete Step 5 to run this step." />}
            {stageMap[7]?.status === "completed" ? (
              <p className="text-sm text-muted-foreground">
                Styled V2 —{" "}
                {versions.find((v) => v.versionType === "styled")?.wordCount?.toLocaleString() ?? "?"} words.
              </p>
            ) : (
              <>
                <StyleGuideUpload projectId={project.id} existingStyleGuide={latestStyleGuide} />
                {latestStyleGuide && (
                  <StepTrigger
                    projectId={project.id}
                    stepNumber={7}
                    label="Apply Style Guide & Edit"
                    currentStatus={stageMap[7]?.status ?? "pending"}
                    disabled={!canRunStep67}
                    disabledReason="Complete Step 5 to run this step."
                  />
                )}
              </>
            )}
          </div>
        );

      case 8:
        const canRunStep8 = stageMap[7]?.status === "completed";
        return (
          <div className="rounded-xl border bg-card p-6 space-y-4">
            {!canRunStep8 && <PrerequisiteNotice message="Complete Step 7 to run this step." />}
            {status === "completed" && factCheckVersion && (
              <p className="text-sm text-muted-foreground">{factCheckVersion.internalLabel}</p>
            )}
            {status !== "completed" && (
              <StepTrigger
                projectId={project.id}
                stepNumber={8}
                label="Fact-Check with Gemini"
                currentStatus={status}
                disabled={!canRunStep8}
                disabledReason="Complete Step 7 to run this step."
              />
            )}
          </div>
        );

      case 9:
        const canRunStep9 = stageMap[8]?.status === "completed";
        return (
          <div className="rounded-xl border bg-card p-6 space-y-4">
            {!canRunStep9 && <PrerequisiteNotice message="Complete Step 8 to run this step." />}
            {status === "completed" && (
              <p className="text-sm text-muted-foreground">
                Final Styled V4 —{" "}
                {versions.find((v) => v.versionType === "final_styled")?.wordCount?.toLocaleString() ?? "?"} words.
              </p>
            )}
            {status !== "completed" && (
              <StepTrigger
                projectId={project.id}
                stepNumber={9}
                label="Apply Final Style Pass"
                currentStatus={status}
                disabled={!canRunStep9}
                disabledReason="Complete Step 8 to run this step."
              />
            )}
          </div>
        );

      case 10:
        const canRunStep10 = stageMap[9]?.status === "completed";
        return (
          <div className="rounded-xl border bg-card p-6 space-y-4">
            {!canRunStep10 && <PrerequisiteNotice message="Complete Step 9 to run this step." />}
            {status !== "completed" && (
              <InlineEditor
                projectId={project.id}
                initialContent={step10DraftContent ?? versions.find((v) => v.versionType === "final_styled")?.content ?? ""}
                versionLabel="Final Styled V4"
              />
            )}
            {status === "completed" && (
              <p className="text-sm text-muted-foreground">
                Human Review V5 — approved and locked.
              </p>
            )}
          </div>
        );

      case 11:
        const canRunStep11 = stageMap[10]?.status === "completed";
        return (
          <div className="rounded-xl border bg-card p-6 space-y-4">
            {!canRunStep11 && <PrerequisiteNotice message="Complete Step 10 to run this step." />}
            {(status === "pending" || status === "running" || !stage) && (
              <StepTrigger
                projectId={project.id}
                stepNumber={11}
                label="Generate Devil's Advocate Critiques"
                currentStatus={status}
                disabled={!canRunStep11}
                disabledReason="Complete Step 10 to run this step."
              />
            )}
            {status === "awaiting_human" && (
              <CritiqueSelector
                projectId={project.id}
                redReport={versions.find((v) => v.versionType === "red_report")?.content ?? ""}
              />
            )}
            {status === "completed" && (
              <p className="text-sm text-muted-foreground">
                Critiques confirmed — proceeding to integration.
              </p>
            )}
          </div>
        );

      case 12:
        const canRunStep12 = stageMap[11]?.status === "completed";
        return (
          <div className="rounded-xl border bg-card p-6 space-y-4">
            {!canRunStep12 && <PrerequisiteNotice message="Complete Step 11 to run this step." />}
            {status !== "completed" && (
              <StepTrigger
                projectId={project.id}
                stepNumber={12}
                label="Integrate Critiques with Extended Thinking"
                currentStatus={status}
                disabled={!canRunStep12}
                disabledReason="Complete Step 11 to run this step."
              />
            )}
            {status === "completed" && (
              <p className="text-sm text-muted-foreground">Final V6 — critique integration complete.</p>
            )}
          </div>
        );

      case 13:
        const canRunStep13 = stageMap[12]?.status === "completed";
        return (
          <div className="rounded-xl border bg-card p-6 space-y-4">
            {!canRunStep13 && <PrerequisiteNotice message="Complete Step 12 to run this step." />}
            {status !== "completed" && (
              <StepTrigger
                projectId={project.id}
                stepNumber={13}
                label="Generate HTML Export"
                currentStatus={status}
                disabled={!canRunStep13}
                disabledReason="Complete Step 12 to run this step."
              />
            )}
            {status === "completed" && (
              <div className="flex items-center gap-3">
                <Link
                  href={`/api/projects/${project.id}/export`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Download PDF
                </Link>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Completion banner */}
      {project.status === "completed" && (
        <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900 px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-green-800 dark:text-green-300">
              Investment memo complete
            </p>
            <p className="text-sm text-green-700/80 dark:text-green-400/80 mt-0.5">
              All 13 pipeline steps finished.
            </p>
          </div>
          <Link
            href={`/api/projects/${project.id}/export`}
            className="inline-flex items-center gap-1.5 rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 transition-colors shrink-0"
          >
            Download PDF
          </Link>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[260px_1fr]">
        {/* Left: step nav */}
        <PipelineStepNav
          projectId={project.id}
          stages={stages}
          activeStep={activeStep}
          currentStep={project.currentStage}
          onStepClick={handleStepClick}
        />

        {/* Right: active step content */}
        <div>
          {/* Step header */}
          <div className="mb-6">
            <p className="text-sm text-muted-foreground mb-1">
              Step {activeStep} of 13 &bull; {STEP_PHASES[activeStep]}
            </p>
            <h1 className="text-2xl font-bold tracking-tight">{STEP_TITLES[activeStep]}</h1>
          </div>

          {renderStepContent()}
        </div>
      </div>

      {/* Versions panel */}
      {versions.length > 0 && (
        <div className="rounded-xl border bg-card p-6">
          <h2 className="text-base font-semibold mb-4">Output Versions</h2>
          <p className="text-sm text-muted-foreground mb-4">
            All AI-generated versions for this project. Click View to read, Compare to diff.
          </p>
          <VersionsPanel versions={versions} />
        </div>
      )}
    </div>
  );
}

function PrerequisiteNotice({ message }: { message: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2">
      <p className="text-sm text-muted-foreground">{message} Preview mode is enabled for navigation/testing.</p>
    </div>
  );
}
