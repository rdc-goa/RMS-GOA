"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle, XCircle, AlertTriangle, RefreshCw } from "lucide-react"
import { PageHeader } from "@/components/page-header"

interface TestResult {
  status: "success" | "error" | "warning"
  message: string
  [key: string]: any
}

interface HealthCheckResult {
  timestamp: string
  overallStatus: "success" | "error"
  message: string
  tests: {
    firestore: TestResult
    auth: TestResult
    storage: TestResult
    serviceAccount: TestResult
  }
  debug: {
    environment: {
      hasProjectId: boolean;
      hasClientEmail: boolean;
      hasPrivateKey: boolean;
      hasStorageBucket: boolean;
    }
  }
}

export default function SystemHealthPage() {
  const [healthData, setHealthData] = useState<HealthCheckResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runHealthCheck = async () => {
    setLoading(true)
    setError(null)
    setHealthData(null);

    try {
      const response = await fetch("/api/test-firebase")
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || data.details || "Health check failed")
      }

      setHealthData(data)
    } catch (err: any) {
      setError(err.message)
      console.error("Health check error:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    runHealthCheck()
  }, [])

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case "error":
        return <XCircle className="h-5 w-5 text-red-500" />
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />
      default:
        return <Loader2 className="h-5 w-5 animate-spin" />
    }
  }

  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    const variants = {
      success: "default",
      error: "destructive",
      warning: "secondary",
    } as const

    return <Badge variant={variants[status as keyof typeof variants] || "outline"}>{status.toUpperCase()}</Badge>
  }

  const renderEnvVarStatus = (label: string, isSet?: boolean) => {
    if (isSet === undefined) return null;
    return (
      <div className="flex justify-between items-center">
          <span className="font-mono text-xs">{label}:</span>
          <span className={isSet ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
              {isSet ? "Set" : "Missing"}
          </span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="System Health" 
        description="Monitor the health and connectivity of Firebase services"
        showBackButton={false}
      />

      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          {healthData && (
            <>
              {getStatusIcon(healthData.overallStatus)}
              <span className="font-medium">{healthData.message}</span>
              {getStatusBadge(healthData.overallStatus)}
            </>
          )}
        </div>

        <Button onClick={runHealthCheck} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Run Health Check
        </Button>
      </div>

      {loading && !healthData && (
        <Card>
            <CardContent className="p-6 flex justify-center items-center">
                <Loader2 className="h-6 w-6 animate-spin mr-4" />
                <p>Running health checks...</p>
            </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardHeader>
            <CardTitle className="text-red-800 dark:text-red-200 flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              Health Check Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </CardContent>
        </Card>
      )}

      {healthData && (
        <>
          {/* Debug Information */}
          <Card>
            <CardHeader>
              <CardTitle>Environment Variables</CardTitle>
              <CardDescription>Status of required server-side variables</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-2 text-sm">
                  {renderEnvVarStatus("NEXT_PUBLIC_FIREBASE_PROJECT_ID", healthData.debug.environment.hasProjectId)}
                  {renderEnvVarStatus("FIREBASE_CLIENT_EMAIL", healthData.debug.environment.hasClientEmail)}
                  {renderEnvVarStatus("FIREBASE_PRIVATE_KEY", healthData.debug.environment.hasPrivateKey)}
                  {renderEnvVarStatus("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", healthData.debug.environment.hasStorageBucket)}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Service Account Test */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Service Account</span>
                  {getStatusIcon(healthData.tests.serviceAccount.status)}
                </CardTitle>
                <CardDescription>Admin SDK credential availability</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Status:</span>
                    {getStatusBadge(healthData.tests.serviceAccount.status)}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{healthData.tests.serviceAccount.message}</p>
                </div>
              </CardContent>
            </Card>

            {/* Firestore Test */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Firestore Database</span>
                  {getStatusIcon(healthData.tests.firestore.status)}
                </CardTitle>
                <CardDescription>Database connectivity and permissions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Status:</span>
                    {getStatusBadge(healthData.tests.firestore.status)}
                  </div>
                  <div className="flex justify-between">
                    <span>Can Read:</span>
                    <span>{healthData.tests.firestore.canRead ? "Yes" : "No"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Can Write:</span>
                    <span>{healthData.tests.firestore.canWrite ? "Yes" : "No"}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{healthData.tests.firestore.message}</p>
                </div>
              </CardContent>
            </Card>

            {/* Firebase Auth Test */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Firebase Authentication</span>
                  {getStatusIcon(healthData.tests.auth.status)}
                </CardTitle>
                <CardDescription>Authentication service connectivity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Status:</span>
                    {getStatusBadge(healthData.tests.auth.status)}
                  </div>
                  <div className="flex justify-between">
                    <span>Can List Users:</span>
                    <span>{healthData.tests.auth.canListUsers ? "Yes" : "No"}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{healthData.tests.auth.message}</p>
                </div>
              </CardContent>
            </Card>

            {/* Firebase Storage Test */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Firebase Storage</span>
                  {getStatusIcon(healthData.tests.storage.status)}
                </CardTitle>
                <CardDescription>File storage connectivity and permissions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Status:</span>
                    {getStatusBadge(healthData.tests.storage.status)}
                  </div>
                  {healthData.tests.storage.bucketExists !== undefined && (
                    <div className="flex justify-between">
                      <span>Bucket Exists:</span>
                      <span>{healthData.tests.storage.bucketExists ? "Yes" : "No"}</span>
                    </div>
                  )}
                  {healthData.tests.storage.bucketName && (
                    <div className="flex justify-between">
                      <span>Bucket:</span>
                      <span className="text-sm font-mono">{healthData.tests.storage.bucketName}</span>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground mt-2">{healthData.tests.storage.message}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Last Check Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                <p>Timestamp: {new Date(healthData.timestamp).toLocaleString()}</p>
                <p>Overall Status: {healthData.overallStatus}</p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
