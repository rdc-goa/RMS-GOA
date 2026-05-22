
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import {
  Search,
  RefreshCw,
  Eye,
  Clock,
  Filter,
  AlertCircle,
  CheckCircle2,
  Info,
  ShieldAlert,
  Download
} from "lucide-react";
import { getLogs, exportLogs } from "@/app/actions";
import { LogCategory } from "@/lib/logger";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";

const CATEGORIES: { label: string; value: LogCategory | 'ALL' }[] = [
  { label: "All Categories", value: "ALL" },
  { label: "Application & API", value: "APPLICATION" },
  { label: "Auth & Authz", value: "AUTH" },
  { label: "Audit Trail", value: "AUDIT" },
  { label: "IMR/EMR Workflow", value: "WORKFLOW" },
  { label: "AI / Genkit", value: "AI" },
  { label: "Database (Firestore)", value: "DATABASE" },
  { label: "Storage (Firebase)", value: "STORAGE" },
  { label: "Notifications & Email", value: "NOTIFICATION" },
  { label: "Infrastructure", value: "INFRASTRUCTURE" },
  { label: "Performance", value: "METRICS" },
  { label: "Security & Threats", value: "SECURITY" },
  { label: "Bulk Uploads", value: "MIGRATION" },
  { label: "Frontend / Client", value: "FRONTEND" },
];

const DURATIONS = [
  { label: "Today", value: "today" },
  { label: "Last 24 Hours", value: "24h" },
  { label: "Last 7 Days", value: "7d" },
  { label: "Last 30 Days", value: "30d" },
  { label: "All Time", value: "all" },
];

export function LogViewer() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState<LogCategory | "ALL">("ALL");
  const [duration, setDuration] = useState<string>("today");
  const [search, setSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const result = await exportLogs({ category, duration: duration as any, search });
      if (result.success && result.logs) {
        // Generate CSV
        const headers = ["Timestamp", "Category", "Status", "User", "Role", "Message", "Path", "Request ID"];
        const rows = result.logs.map((log: any) => [
          log.timestamp,
          log.category,
          log.status,
          log.userEmail || "System",
          log.userRole || "N/A",
          `"${log.message?.replace(/"/g, '""')}"`,
          log.path || "N/A",
          log.requestId
        ]);

        const csvContent = [
          headers.join(","),
          ...rows.map((row: any) => row.join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `rdc_system_logs_${format(new Date(), "yyyyMMdd_HHmmss")}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast({ title: "Success", description: "Report downloaded successfully." });
      } else {
        toast({ variant: "destructive", title: "Error", description: result.error || "Failed to export logs." });
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "An error occurred during export." });
    } finally {
      setDownloading(false);
    }
  };

  const fetchLogs = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const result = await getLogs({
        category,
        duration: duration as any,
        search,
        limit: 100
      });

      if (result.success) {
        setLogs(result.logs || []);
      } else {
        toast({ variant: "destructive", title: "Error", description: result.error });
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to fetch logs." });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category, duration, search]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'error': return <ShieldAlert className="h-4 w-4 text-destructive" />;
      case 'warning': return <AlertCircle className="h-4 w-4 text-warning" />;
      case 'success': return <CheckCircle2 className="h-4 w-4 text-success" />;
      default: return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'error': return <Badge variant="destructive">Error</Badge>;
      case 'warning': return <Badge className="bg-yellow-500 text-white">Warning</Badge>;
      case 'success': return <Badge className="bg-green-500 text-white">Success</Badge>;
      default: return <Badge variant="secondary">Info</Badge>;
    }
  };

  return (
    <Card className="shadow-lg border-2">
      <CardHeader className="pb-3 border-b">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <CardTitle className="text-xl flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Live Event Stream
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg">
              <Select value={category} onValueChange={(v: any) => setCategory(v)}>
                <SelectTrigger className="w-[180px] bg-background border-none shadow-none h-9">
                  <Filter className="h-3.5 w-3.5 mr-2" />
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="w-[150px] bg-background border-none shadow-none h-9">
                  <Clock className="h-3.5 w-3.5 mr-2" />
                  <SelectValue placeholder="Duration" />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map(d => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                className="pl-8 w-[200px] lg:w-[300px]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={() => fetchLogs(true)}
              disabled={refreshing}
              title="Refresh Logs"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={handleDownload}
              disabled={downloading}
              title="Download CSV Report"
              className="text-primary border-primary/50 hover:bg-primary/10"
            >
              <Download className={`h-4 w-4 ${downloading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[180px]">Timestamp</TableHead>
                <TableHead className="w-[140px]">Category</TableHead>
                <TableHead>Message</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead className="w-[180px]">User</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6} className="h-12 animate-pulse bg-muted/20" />
                  </TableRow>
                ))
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-[200px] text-center text-muted-foreground">
                    No logs found for the selected criteria.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id} className="hover:bg-muted/30 transition-colors group">
                    <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                      {format(new Date(log.timestamp), "yyyy-MM-dd HH:mm:ss")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-semibold text-[10px] uppercase tracking-wider px-1.5 py-0">
                        {log.category.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-sm whitespace-normal break-words min-w-[300px]">
                      <div className="flex items-start gap-2 py-1">
                        <div className="mt-0.5 shrink-0">
                          {getStatusIcon(log.status)}
                        </div>
                        <span>{log.message}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(log.status)}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex flex-col">
                        <span className="font-medium">{log.userEmail || "System"}</span>
                        {log.userRole && (
                          <span className="text-[10px] text-muted-foreground uppercase">{log.userRole}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setSelectedLog(log)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Log Details
              {selectedLog && getStatusBadge(selectedLog.status)}
            </DialogTitle>
            <DialogDescription>
              Technical details for the event recorded on {selectedLog && format(new Date(selectedLog.timestamp), "PPP 'at' p")}
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm bg-muted/30 p-4 rounded-lg border">
                <div>
                  <h4 className="font-bold text-muted-foreground uppercase text-[10px] mb-1">Request ID</h4>
                  <p className="font-mono break-all">{selectedLog.requestId}</p>
                </div>
                <div>
                  <h4 className="font-bold text-muted-foreground uppercase text-[10px] mb-1">Path</h4>
                  <p className="font-mono">{selectedLog.path || "N/A"}</p>
                </div>
                <div>
                  <h4 className="font-bold text-muted-foreground uppercase text-[10px] mb-1">User ID</h4>
                  <p className="font-mono break-all">{selectedLog.userId || "N/A"}</p>
                </div>
                <div>
                  <h4 className="font-bold text-muted-foreground uppercase text-[10px] mb-1">Category</h4>
                  <p className="font-mono font-bold text-primary">{selectedLog.category}</p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-sm">Metadata / Payload</h4>
                <div className="bg-black text-green-400 p-4 rounded-md font-mono text-xs overflow-x-auto whitespace-pre">
                  {JSON.stringify(selectedLog.metadata, null, 2)}
                </div>
              </div>

              {selectedLog.error && (
                <div className="space-y-2">
                  <h4 className="font-bold text-sm text-destructive">Error Details</h4>
                  <div className="bg-destructive/10 text-destructive p-4 rounded-md font-mono text-xs overflow-x-auto">
                    {selectedLog.error}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
