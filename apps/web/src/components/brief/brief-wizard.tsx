"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BriefStep1 } from "./brief-step-1";
import { BriefStep2 } from "./brief-step-2";
import { BriefStep3 } from "./brief-step-3";

const STEPS = [
  { title: "Company & Deal", description: "Basic information about the company and deal." },
  { title: "Objectives", description: "Define the key question and target audience." },
  { title: "Review & Submit", description: "Add tone guidance and confirm your inputs." },
];

interface FormData {
  companyName: string;
  sector: string;
  dealType: string;
  dealSizeUsd: string;
  keyQuestion: string;
  targetAudience: string;
  toneInstructions: string;
  additionalContext: string;
}

const INITIAL: FormData = {
  companyName: "",
  sector: "",
  dealType: "",
  dealSizeUsd: "",
  keyQuestion: "",
  targetAudience: "",
  toneInstructions: "",
  additionalContext: "",
};

function isStep1Valid(data: FormData) {
  return data.companyName.trim() !== "" && data.sector !== "" && data.dealType !== "";
}

function isStep2Valid(data: FormData) {
  return data.keyQuestion.trim() !== "" && data.targetAudience !== "";
}

export function BriefWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormData>(INITIAL);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentStep = STEPS[step - 1];

  function canProceed() {
    if (step === 1) return isStep1Valid(data);
    if (step === 2) return isStep2Valid(data);
    return true;
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${data.companyName} – ${data.dealType}`,
          briefData: {
            companyName: data.companyName,
            sector: data.sector,
            dealType: data.dealType,
            ...(data.dealSizeUsd ? { dealSizeUsd: Number(data.dealSizeUsd) } : {}),
            keyQuestion: data.keyQuestion,
            targetAudience: data.targetAudience,
            ...(data.toneInstructions ? { toneInstructions: data.toneInstructions } : {}),
            ...(data.additionalContext ? { additionalContext: data.additionalContext } : {}),
          },
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Failed to create project");
        return;
      }

      const project = (await res.json()) as { id: string };
      router.push(`/projects/${project.id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium border-2 transition-colors ${
                i + 1 < step
                  ? "bg-primary border-primary text-primary-foreground"
                  : i + 1 === step
                  ? "border-primary text-primary"
                  : "border-muted-foreground/30 text-muted-foreground/40"
              }`}
            >
              {i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-px w-8 ${i + 1 < step ? "bg-primary" : "bg-muted-foreground/30"}`}
              />
            )}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{currentStep?.title}</CardTitle>
          <CardDescription>{currentStep?.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === 1 && (
            <BriefStep1
              data={{ companyName: data.companyName, sector: data.sector, dealType: data.dealType, dealSizeUsd: data.dealSizeUsd }}
              onChange={(s1) => setData((d) => ({ ...d, ...s1 }))}
            />
          )}
          {step === 2 && (
            <BriefStep2
              data={{ keyQuestion: data.keyQuestion, targetAudience: data.targetAudience }}
              onChange={(s2) => setData((d) => ({ ...d, ...s2 }))}
            />
          )}
          {step === 3 && (
            <BriefStep3
              data={{ toneInstructions: data.toneInstructions, additionalContext: data.additionalContext }}
              allData={data}
              onChange={(s3) => setData((d) => ({ ...d, ...s3 }))}
            />
          )}
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 1}
          >
            Back
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed()}>
              Next
            </Button>
          ) : (
            <Button onClick={() => void handleSubmit()} disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create Project"}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
