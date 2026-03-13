import { DefineTaskStep } from "./steps/define-task-step";
import { StepTrigger } from "./step-trigger";
import { SelectPersonasStep } from "./steps/select-personas-step";
import { SynthesisStep } from "./steps/synthesis-step";
import { ExportStep } from "./steps/export-step";
import { StyleEditStep } from "./steps/style-edit-step";
import { IntegrateCritiquesStep } from "./steps/integrate-critiques-step";
import { MarkdownVersionPanel } from "./markdown-version-panel";
import { MaterialUpload } from "@/components/sources/material-upload";
import { StylePresetSelector } from "@/components/sources/style-preset-selector";
import { StyleGuidePreview } from "@/components/sources/style-guide-preview";
import { InlineEditor } from "@/components/review/inline-editor";
import { CritiqueSelector } from "@/components/review/critique-selector";
import { FactCheckReviewStep } from "@/components/review/fact-check-review";
import { Users, BookOpen, Eye } from "lucide-react";
import { getStep8DraftFromMetadata } from "./pipeline-constants";
import type { PipelineViewProps } from "./pipeline-constants";
import type { PipelineState } from "./use-pipeline-state";
import type { ProjectBriefData } from "@repo/db";

interface PipelineStepContentProps {
  props: PipelineViewProps;
  state: PipelineState;
}

export function PipelineStepContent({ props, state }: PipelineStepContentProps) {
  const { project, personas, materials, latestStyleGuide, factCheckFindings, factCheckApprovedFindingIds, factCheckApprovedIssues, factCheckAppliedCorrections, coverImageUrl } = props;
  const {
    activeStep, stageMap, brief, getLatestVersion, sourceSynthesisVersion, factCheckVersion,
    setStep1Running, setStep4Running, setStep5Running, setStep6Running,
    setStep8Running, setStep9Running,
    editorRef, handleStep7ContentChange,
    setStep8SelectedCritiques, setStep8Draft, persistStep8Draft,
    documentColors, liveCoverImageUrl, setLiveCoverImageUrl,
    resolvedPresetId, handlePresetSelect,
    step11FormatRunId,
    setCoverImagesGenerating,
    activeStep: step,
  } = state;

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
          masterPrompt={project.master_prompt ?? null}
          onRunningChange={setStep1Running}
        />
      );

    case 2: {
      const s2Status = stageMap[2]?.status ?? "pending";
      return (
        <SelectPersonasStep
          projectId={project.id}
          stage1Status={stageMap[1]?.status ?? "pending"}
          stage2Status={s2Status}
          projectPersonas={personas}
        />
      );
    }

    case 3:
      return <MaterialUpload projectId={project.id} materials={materials} />;

    case 4: {
      const canRunStep4 = stageMap[3]?.status === "completed";
      return (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              <h3 className="font-medium text-base text-foreground">Persona Drafts</h3>
            </div>
            <p className="text-base text-muted-foreground">
              Each of the 5 selected personas will independently analyse the source material and
              produce a full draft document from their unique perspective. All 5 drafts run in
              parallel, then get synthesised in Step 5.
            </p>
            <StepTrigger
              projectId={project.id}
              stepNumber={4}
              label="Generate Persona Drafts (×5 parallel)"
              currentStatus={status}
              disabled={!canRunStep4}
              disabledReason="Complete Step 3 to run this step."
              onRunningChange={setStep4Running}
            />
          </div>
        </div>
      );
    }

    case 5:
      return (
        <SynthesisStep
          projectId={project.id}
          stage4Status={stageMap[4]?.status ?? "pending"}
          stage5Status={status}
          synthesisVersion={getLatestVersion("synthesis")}
          onRunningChange={setStep5Running}
        />
      );

    case 6: {
      const canRunStep6 = stageMap[5]?.status === "completed";
      if (factCheckVersion && (status === "awaiting_human" || status === "completed")) {
        return (
          <FactCheckReviewStep
            projectId={project.id}
            factCheckFindings={factCheckFindings ?? []}
            sourceVersion={sourceSynthesisVersion}
            factCheckedVersion={factCheckVersion}
            approvedFindingIds={factCheckApprovedFindingIds ?? undefined}
            approvedIssues={factCheckApprovedIssues ?? undefined}
            appliedCorrections={factCheckAppliedCorrections ?? undefined}
            isStepApproved={status === "completed"}
          />
        );
      }
      return (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <MarkdownVersionPanel
            title="Content to Fact-Check (Step 5 Synthesis)"
            content={sourceSynthesisVersion?.content ?? ""}
            wordCount={sourceSynthesisVersion?.word_count ?? undefined}
          />
          <div className="rounded-xl border bg-card p-6 space-y-4 lg:sticky lg:top-4 h-fit">
            <StepTrigger
              projectId={project.id}
              stepNumber={6}
              label="Fact-Check with Gemini"
              currentStatus={status}
              disabled={!canRunStep6}
              disabledReason="Complete Step 5 to run this step."
              onRunningChange={setStep6Running}
            />
          </div>
        </div>
      );
    }

    case 7:
      return (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Eye className="size-4 text-muted-foreground" />
            <h3 className="font-medium text-base text-foreground">Human Review</h3>
          </div>
          <InlineEditor
            ref={editorRef}
            projectId={project.id}
            initialContent={
              getLatestVersion("human_reviewed")?.content
              ?? factCheckVersion?.content
              ?? ""
            }
            compareContent={factCheckVersion?.content ?? ""}
            versionLabel="Final Styled V4"
            hideActions
            onContentChange={handleStep7ContentChange}
            onApproveSuccess={() => state.handleStepClick(8)}
          />
        </div>
      );

    case 8: {
      const canRunStep8 = stageMap[7]?.status === "completed";
      const persistedDraft = getStep8DraftFromMetadata(stageMap[8]?.metadata);
      const redReportContent = persistedDraft ? "" : (getLatestVersion("red_report")?.content ?? "");
      const shouldShowSelector = status === "awaiting_human" || status === "completed" || Boolean(persistedDraft);
      return (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <StepTrigger
              projectId={project.id}
              stepNumber={8}
              label="Generate Devil's Advocate Critiques"
              currentStatus={status}
              disabled={!canRunStep8}
              disabledReason="Complete Step 7 to run this step."
              onRunningChange={setStep8Running}
            />
          </div>
          {shouldShowSelector && (
            <div className="rounded-xl border bg-card p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                Select the critiques you want integrated into the final document. Click a card to select or deselect it. You can also add custom critiques below.
              </p>
              <CritiqueSelector
                projectId={project.id}
                redReport={redReportContent}
                step10Markdown={
                  getLatestVersion("human_reviewed")?.content
                  ?? ""
                }
                onSelectedCritiquesChange={setStep8SelectedCritiques}
                initialCritiques={persistedDraft?.critiques}
                initialSelectedIds={persistedDraft?.selectedIds}
                onDraftChange={(draft) => {
                  setStep8Draft(draft);
                  persistStep8Draft(draft);
                }}
              />
            </div>
          )}
        </div>
      );
    }

    case 9:
      return (
        <IntegrateCritiquesStep
          projectId={project.id}
          finalVersion={getLatestVersion("final")}
          stage11Status={stageMap[8]?.status ?? "pending"}
          stage12Status={status}
          onRunningChange={setStep9Running}
        />
      );

    case 10:
      return (
        <div className="space-y-3">
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <BookOpen className="size-4 text-muted-foreground" />
              <h3 className="font-medium text-base text-foreground">Document Style</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Choose a visual style for your investment memo. This sets the colour palette, typography, and writing tone.
            </p>
            <StylePresetSelector
              projectId={project.id}
              selectedPresetId={resolvedPresetId}
              onSelect={handlePresetSelect}
            />
          </div>
          <StyleGuidePreview
            projectId={project.id}
            projectTitle={project.title}
            companyName={brief?.companyName}
            onGeneratingChange={setCoverImagesGenerating}
            onCoverImageChange={setLiveCoverImageUrl}
          />
        </div>
      );

    case 11:
      return (
        <StyleEditStep
          projectId={project.id}
          projectTitle={project.title}
          companyName={brief?.companyName}
          dealType={brief?.dealType}
          stage5Status={stageMap[5]?.status ?? "pending"}
          stage7Status={status}
          synthesisVersion={getLatestVersion("final")}
          latestStyleGuide={latestStyleGuide}
          coverImageUrl={liveCoverImageUrl}
          colors={documentColors}
          formatRunId={step11FormatRunId}
        />
      );

    case 12: {
      const finalVersion = getLatestVersion("final");
      return (
        <ExportStep
          projectId={project.id}
          projectTitle={project.title}
          companyName={(project.brief_data as ProjectBriefData | null)?.companyName}
          dealType={(project.brief_data as ProjectBriefData | null)?.dealType}
          coverImageUrl={coverImageUrl}
          finalVersion={finalVersion}
          stage12Status={stageMap[11]?.status ?? "pending"}
        />
      );
    }

    default:
      return null;
  }
}
