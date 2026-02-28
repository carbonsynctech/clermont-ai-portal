export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Your active projects will appear here.
        </p>
      </div>
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground text-sm">No projects yet.</p>
        <p className="text-muted-foreground text-xs mt-1">
          Click &ldquo;New Project&rdquo; in the sidebar to get started.
        </p>
      </div>
    </div>
  );
}
