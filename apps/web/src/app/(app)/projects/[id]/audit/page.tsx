import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { projects, auditLogs } from "@repo/db";
import { eq, and, desc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { AuditFilterBar } from "./audit-filter-bar";
import { summarizeTokenUsage } from "@/lib/token-usage-cost";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string }>;
}

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getActionCategory(action: string): "human" | "ai" | "system" {
  if (action.startsWith("human_") || action.includes("approved") || action.includes("selected") || action.includes("created") || action.includes("submitted") || action.includes("uploaded") || action.includes("acknowledged")) {
    return "human";
  }
  if (action.startsWith("agent_")) return "ai";
  return "system";
}

function categoryVariant(cat: "human" | "ai" | "system") {
  if (cat === "human") return "default" as const;
  if (cat === "ai") return "secondary" as const;
  return "outline" as const;
}

function formatUsd(value: number): string {
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default async function AuditPage({ params, searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { id } = await params;
  const { filter } = await searchParams;

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, id), eq(projects.ownerId, user.id)),
  });

  if (!project) notFound();

  const logs = await db.query.auditLogs.findMany({
    where: eq(auditLogs.projectId, id),
    orderBy: [desc(auditLogs.createdAt)],
    limit: 200,
  });

  const filteredLogs =
    filter && filter !== "all"
      ? logs.filter((log) => getActionCategory(log.action) === filter)
      : logs;

  const tokenSummary = summarizeTokenUsage(
    logs.map((log) => ({
      modelId: log.modelId,
      inputTokens: log.inputTokens,
      outputTokens: log.outputTokens,
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Audit Log</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{project.title}</p>
        </div>
        <Link
          href={`/projects/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to project
        </Link>
      </div>

      {/* Filter bar (client component) */}
      <AuditFilterBar activeFilter={filter ?? "all"} />

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border bg-card px-3 py-2.5">
          <p className="text-xs text-muted-foreground">Total tokens</p>
          <p className="text-lg font-semibold">{tokenSummary.totalTokens.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            In {tokenSummary.totalInputTokens.toLocaleString()} • Out {tokenSummary.totalOutputTokens.toLocaleString()}
          </p>
        </div>
        <div className="rounded-md border bg-card px-3 py-2.5">
          <p className="text-xs text-muted-foreground">Estimated AI cost</p>
          <p className="text-lg font-semibold">{formatUsd(tokenSummary.estimatedCostUsd)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Based on priced model mappings
          </p>
        </div>
        <div className="rounded-md border bg-card px-3 py-2.5">
          <p className="text-xs text-muted-foreground">Model usage tracked</p>
          <p className="text-lg font-semibold">{tokenSummary.models.length.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {tokenSummary.unpricedInputTokens + tokenSummary.unpricedOutputTokens > 0
              ? `${(
                  tokenSummary.unpricedInputTokens + tokenSummary.unpricedOutputTokens
                ).toLocaleString()} tokens unpriced`
              : "All logged tokens priced"}
          </p>
        </div>
      </div>

      {tokenSummary.models.length > 0 && (
        <div className="rounded-md border overflow-hidden">
          <div className="px-3 py-2 border-b bg-muted/40 text-xs font-medium text-muted-foreground">
            Usage by model
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/20">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Model</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Input</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Output</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Total</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Estimated Cost</th>
                </tr>
              </thead>
              <tbody>
                {tokenSummary.models.map((model) => (
                  <tr key={model.modelId} className="border-b last:border-0">
                    <td className="px-3 py-2 font-mono text-muted-foreground">{model.modelId}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{model.inputTokens.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{model.outputTokens.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{model.totalTokens.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {model.isPriced ? formatUsd(model.estimatedCostUsd) : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground w-28">Timestamp</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Action</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground w-12">Step</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground w-40">Model</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground w-20">Tokens In</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground w-20">Tokens Out</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Payload</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    No audit entries found.
                  </td>
                </tr>
              )}
              {filteredLogs.map((log) => {
                const cat = getActionCategory(log.action);
                const payloadStr = log.payload ? JSON.stringify(log.payload) : "";
                const payloadPreview = payloadStr.length > 80 ? payloadStr.slice(0, 80) + "…" : payloadStr;
                return (
                  <tr key={log.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      <span title={new Date(log.createdAt).toLocaleString()}>
                        {formatRelativeTime(new Date(log.createdAt))}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={categoryVariant(cat)} className="text-[10px] h-4 px-1.5 font-mono">
                        {log.action}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-center text-muted-foreground">
                      {log.stepNumber ?? "–"}
                    </td>
                    <td className="px-3 py-2 font-mono text-muted-foreground truncate max-w-40">
                      {log.modelId ?? "–"}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {log.inputTokens?.toLocaleString() ?? "–"}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {log.outputTokens?.toLocaleString() ?? "–"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {payloadStr ? (
                        <details>
                          <summary className="cursor-pointer font-mono select-none">
                            {payloadPreview}
                          </summary>
                          <pre className="mt-1 text-[10px] bg-muted rounded p-2 overflow-x-auto max-w-sm whitespace-pre-wrap break-all">
                            {JSON.stringify(log.payload, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span>–</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-right">
        Showing {filteredLogs.length} of {logs.length} entries (max 200)
      </p>
    </div>
  );
}
