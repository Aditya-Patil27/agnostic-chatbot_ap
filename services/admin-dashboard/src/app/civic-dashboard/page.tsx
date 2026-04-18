import { Suspense } from "react";
import dynamicImport from "next/dynamic";

export const dynamic = "force-dynamic";
import { getCivicDashboard, ComplaintDashboardItem } from "@/app/actions/get-civic-dashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/civic/StatusBadge";
import { MeTooButton } from "@/components/MeTooButton";
import { NotificationBell } from "@/components/NotificationBell";
import { AlertCircle, Clock, MapPin, TrendingUp, Users, CheckCircle, Map } from "lucide-react";
import type { MapMarker } from "@/components/CivicMap";

// Dynamic import — Leaflet is browser-only
const CivicMap = dynamicImport(() => import("@/components/CivicMap").then((m) => ({ default: m.CivicMap })), {
  ssr: false,
  loading: () => (
    <div style={{ height: "500px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "0.9rem" }}>
      Loading map…
    </div>
  ),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getPriorityVariant(score: number): "critical" | "high" | "medium" | "low" {
  if (score >= 76) return "critical";
  if (score >= 56) return "high";
  if (score >= 31) return "medium";
  return "low";
}

function timeSince(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 3600 * 24));
  if (diffDays === 0) return "Today";
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}

function getSlaWarning(item: ComplaintDashboardItem) {
  if (item.status === "resolved" || item.status === "closed") return null;
  if (item.sla_breach_risk === "breached") return <AlertCircle className="inline h-4 w-4 text-red-500" />;
  if (item.sla_breach_risk === "high") return <Clock className="inline h-4 w-4 text-yellow-500" />;
  return null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function CivicDashboardPage() {
  const { data: issues, error } = await getCivicDashboard({ status: "filed" });

  if (error || !issues) {
    return (
      <div className="p-8">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-700 font-medium">Critical System Error: {error || "Cannot reach database"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Metrics ─────────────────────────────────────────────────────────────
  const activeCount = issues.length;
  const criticalCount = issues.filter((i) => i.priority_score >= 76).length;
  const overdueCount = issues.filter((i) => i.sla_breach_risk === "breached").length;
  const avgResolution = "4.8 days";

  // ── Map markers ──────────────────────────────────────────────────────────
  const mapMarkers: MapMarker[] = issues
    .filter((i) => i.latitude && i.longitude)
    .map((i) => ({
      id: i.id,
      lat: i.latitude as number,
      lng: i.longitude as number,
      category: i.category,
      status: i.status,
      severity: i.severity,
      priority_score: i.priority_score,
      description: i.description,
      sla_breached: i.sla_breach_risk === "breached",
    }));

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* ── Header with Notification Bell ───────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Authority Operation Center</h1>
          <p className="text-muted-foreground mt-1 text-lg">Intelligent queue managed by AI Priority Engine</p>
        </div>
        {/* Feature 6: Live Realtime Notifications */}
        <NotificationBell />
      </div>

      {/* ── Metrics Row ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Complaints</CardTitle>
            <TrendingUp className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{activeCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Live in system</p>
          </CardContent>
        </Card>

        <Card className={criticalCount > 0 ? "border-red-200 bg-red-50/30" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Priority</CardTitle>
            <AlertCircle className={`h-5 w-5 ${criticalCount > 0 ? "text-red-500" : "text-gray-400"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${criticalCount > 0 ? "text-red-600" : ""}`}>{criticalCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Requires immediate action</p>
          </CardContent>
        </Card>

        <Card className={overdueCount > 0 ? "border-orange-200 bg-orange-50/30" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue SLA</CardTitle>
            <Clock className={`h-5 w-5 ${overdueCount > 0 ? "text-orange-500" : "text-gray-400"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${overdueCount > 0 ? "text-orange-600" : ""}`}>{overdueCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Auto-escalating</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Resolution</CardTitle>
            <CheckCircle className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{avgResolution}</div>
            <p className="text-xs text-muted-foreground mt-1">Across all zones</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Feature 4: Civic Map ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Map className="h-5 w-5 text-blue-500" />
              Live Issue Map
            </CardTitle>
            <CardDescription>
              Colour-coded by status · Click markers for details · 🟡 Yellow = Govt work scheduled
            </CardDescription>
          </div>
          <div className="text-xs text-muted-foreground px-3 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full font-medium">
            {mapMarkers.length} pins
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-hidden rounded-b-xl">
          <CivicMap markers={mapMarkers} height="480px" />
        </CardContent>
      </Card>

      {/* ── Live Priority Queue Table ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Live AI Priority Queue</CardTitle>
          <CardDescription>
            Sorted by algorithmic Priority Score · "Me Too" button boosts priority via community reporting
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[100px]">Priority</TableHead>
                  <TableHead>Complaint Details</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Community</TableHead>
                  {/* Feature 5 header */}
                  <TableHead className="text-center">Me Too</TableHead>
                  <TableHead>Filed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issues.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center h-32 text-muted-foreground">
                      No active complaints found. The city runs perfectly.
                    </TableCell>
                  </TableRow>
                ) : (
                  issues.map((issue) => (
                    <TableRow key={issue.id} className={issue.priority_score >= 76 ? "bg-red-50/10" : ""}>

                      {/* Priority Badge */}
                      <TableCell>
                        <StatusBadge variant={getPriorityVariant(issue.priority_score)}>
                          {getPriorityVariant(issue.priority_score).toUpperCase()}
                        </StatusBadge>
                      </TableCell>

                      {/* Details */}
                      <TableCell>
                        <div className="font-medium text-sm text-blue-600">#{issue.id.split("-")[0].toUpperCase()}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={issue.description}>
                          {issue.description || "Auto-detected issue"}
                        </div>
                      </TableCell>

                      {/* Category */}
                      <TableCell>
                        <div className="font-medium">{issue.category.substring(0, 15)}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3" /> Zone {issue.zone_id}
                        </div>
                      </TableCell>

                      {/* Community Count */}
                      <TableCell className="text-center">
                        <div className="inline-flex items-center justify-center bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                          <Users className="mr-1 h-3 w-3" />
                          {issue.report_count}
                        </div>
                      </TableCell>

                      {/* Feature 5: Me Too Button */}
                      <TableCell className="text-center">
                        <MeTooButton
                          masterId={issue.id}
                          reportCount={issue.report_count ?? 1}
                        />
                      </TableCell>

                      {/* Filed Age */}
                      <TableCell>
                        <div className="text-sm flex items-center gap-1">
                          {timeSince(issue.created_at)}
                          {getSlaWarning(issue)}
                        </div>
                        {issue.sla_breach_risk === "breached" && (
                          <div className="text-[10px] text-red-500 font-medium uppercase tracking-wider">Overdue</div>
                        )}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <div className="text-sm font-medium capitalize">{issue.status.replace("_", " ")}</div>
                      </TableCell>

                      {/* Priority Score */}
                      <TableCell className="text-right">
                        <div className="text-lg font-bold font-mono">{issue.priority_score.toFixed(0)}</div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
