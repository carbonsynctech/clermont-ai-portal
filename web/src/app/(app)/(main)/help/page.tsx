import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqItems = [
  {
    value: "jobs",
    trigger: "How do background jobs work?",
    content:
      "Every AI stage runs through the worker and returns a job ID immediately. Keep the project page open while polling completes, then review output before triggering the next stage.",
  },
  {
    value: "versions",
    trigger: "How should I use versions during review?",
    content:
      "Treat each version as immutable history. Continue editing from the active version, and use diff views to compare stage outputs before approving changes.",
  },
  {
    value: "sources",
    trigger: "What if source material was uploaded incorrectly?",
    content:
      "Upload corrected files, then rerun generation stages so source chunks and summaries are refreshed before synthesis and downstream edits.",
  },
  {
    value: "fact-check",
    trigger: "When should I trust fact-check results?",
    content:
      "Use Step 8 findings as a verification aid, then confirm high-impact claims in your own source documents before final export.",
  },
];

export default function HelpPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Help</h1>
        <p className="text-sm text-muted-foreground">
          Practical guidance for moving through the 12-step memo workflow from brief creation to
          final PDF export.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Quick start</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
          <p>
            Start by creating a project and completing the brief. Upload source material next, then
            run each stage in order while reviewing outputs at the natural checkpoints.
          </p>
          <Separator />
          <ol className="list-decimal space-y-2 pl-5">
            <li>Open Dashboard and create or select a project.</li>
            <li>Complete brief setup and persona selection checkpoints.</li>
            <li>Upload source material before draft and synthesis stages.</li>
            <li>Use Human Review to make final inline edits.</li>
            <li>Run critique integration, then export to PDF.</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stage guide</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
          <div>
            <h2 className="text-foreground font-medium">Planning and drafting (Steps 1–5)</h2>
            <p>
              Define task intent, select personas, and upload complete sources before generating
              parallel drafts and synthesis.
            </p>
          </div>
          <Separator />
          <div>
            <h2 className="text-foreground font-medium">Style and validation (Steps 6–9)</h2>
            <p>
              Apply style-guide editing, review fact-check notes, and complete the final style pass
              before manual review.
            </p>
          </div>
          <Separator />
          <div>
            <h2 className="text-foreground font-medium">Review, polish, and export (Steps 6–12)</h2>
            <p>
              Edit inline, select critiques intentionally, integrate only relevant feedback, and
              export once content is client-ready.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Troubleshooting and FAQ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
          <div>
            <h2 className="text-foreground font-medium">Common issue checks</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>If a stage appears stuck, wait briefly and retry from the project pipeline page.</li>
              <li>If results look incomplete, confirm source files uploaded successfully.</li>
              <li>If you need deeper context, open the project audit log for action and model history.</li>
            </ul>
          </div>
          <Separator />
          <Accordion type="multiple" className="w-full" defaultValue={["jobs"]}>
            {faqItems.map((item) => (
              <AccordionItem key={item.value} value={item.value}>
                <AccordionTrigger>{item.trigger}</AccordionTrigger>
                <AccordionContent>{item.content}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
