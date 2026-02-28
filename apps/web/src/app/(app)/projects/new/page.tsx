import { BriefWizard } from "@/components/brief/brief-wizard";

export const metadata = { title: "New Project" };

export default function NewProjectPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">New Project</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Fill in the brief to generate your investment memo.
        </p>
      </div>
      <BriefWizard />
    </div>
  );
}
