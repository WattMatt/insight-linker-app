/**
 * COC Test Dashboard
 * 
 * Interactive UI for running and viewing COC validation test results.
 */

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Play, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  SkipForward,
  ChevronDown,
  ChevronRight,
  FileText,
  Download,
  Copy,
  Zap,
  Shield,
  FileCheck,
  Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { COCTestRunner, TestSuiteResult, formatResultsAsMarkdown, formatResultsAsJSON } from '@/lib/cocTestRunner';
import { generateTestSuite, getExpectedResult } from '@/lib/cocTestUtils';

const COCTestDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTest, setCurrentTest] = useState<string | null>(null);
  const [results, setResults] = useState<TestSuiteResult | null>(null);
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());
  const [useLocalValidation, setUseLocalValidation] = useState(true);

  const testSuite = generateTestSuite();
  const testCount = Object.keys(testSuite).length;

  const runTests = useCallback(async (filter?: 'all' | 'passing' | 'failing' | 'hierarchy' | 'safety') => {
    setIsRunning(true);
    setProgress(0);
    setResults(null);

    try {
      const runner = new COCTestRunner({ useLocalValidation });
      
      let result: TestSuiteResult;
      
      switch (filter) {
        case 'passing':
          result = await runner.runPassingTests();
          break;
        case 'failing':
          result = await runner.runFailingTests();
          break;
        case 'hierarchy':
          result = await runner.runHierarchyTests();
          break;
        case 'safety':
          result = await runner.runSafetyCriticalTests();
          break;
        default:
          result = await runner.runAllTests();
      }

      setResults(result);
      setProgress(100);
      
      if (result.summary.passRate === 100) {
        toast.success(`All ${result.summary.total} tests passed!`);
      } else if (result.summary.passRate >= 80) {
        toast.warning(`${result.summary.passed}/${result.summary.total} tests passed (${result.summary.passRate}%)`);
      } else {
        toast.error(`${result.summary.failed} tests failed out of ${result.summary.total}`);
      }
    } catch (error) {
      toast.error(`Test run failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRunning(false);
      setCurrentTest(null);
    }
  }, [useLocalValidation]);

  const toggleExpanded = (testId: string) => {
    setExpandedTests(prev => {
      const newSet = new Set(prev);
      if (newSet.has(testId)) {
        newSet.delete(testId);
      } else {
        newSet.add(testId);
      }
      return newSet;
    });
  };

  const copyResults = () => {
    if (results) {
      navigator.clipboard.writeText(formatResultsAsJSON(results));
      toast.success('Results copied to clipboard');
    }
  };

  const downloadResults = () => {
    if (results) {
      const blob = new Blob([formatResultsAsMarkdown(results)], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `coc-test-results-${new Date().toISOString().split('T')[0]}.md`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Results downloaded');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'skipped':
        return <SkipForward className="h-4 w-4 text-muted-foreground" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'destructive' | 'outline' | 'secondary'> = {
      passed: 'default',
      failed: 'destructive',
      error: 'secondary',
      skipped: 'outline'
    };
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">COC Test Dashboard</h1>
          <p className="text-muted-foreground">
            Automated testing for SANS 10142-1:2020 COC validation
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/docs/coc-test-framework')}>
          <FileText className="mr-2 h-4 w-4" />
          Documentation
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Tests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{testCount}</div>
            <p className="text-xs text-muted-foreground">Available test cases</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pass Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {results ? `${results.summary.passRate}%` : '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              {results ? `${results.summary.passed}/${results.summary.total} passed` : 'Run tests to see results'}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Failures</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {results ? results.summary.failed : '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              {results ? `${results.summary.errors} errors` : 'Run tests to see results'}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Duration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {results ? `${results.totalDuration}ms` : '-'}
            </div>
            <p className="text-xs text-muted-foreground">Total execution time</p>
          </CardContent>
        </Card>
      </div>

      {/* Test Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Test Runner</CardTitle>
          <CardDescription>
            Run automated tests against the COC validation engine
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button 
              onClick={() => runTests('all')} 
              disabled={isRunning}
            >
              {isRunning ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Run All Tests
            </Button>
            
            <Button 
              variant="outline" 
              onClick={() => runTests('passing')} 
              disabled={isRunning}
            >
              <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
              Pass Tests
            </Button>
            
            <Button 
              variant="outline" 
              onClick={() => runTests('failing')} 
              disabled={isRunning}
            >
              <XCircle className="mr-2 h-4 w-4 text-red-500" />
              Fail Tests
            </Button>
            
            <Button 
              variant="outline" 
              onClick={() => runTests('hierarchy')} 
              disabled={isRunning}
            >
              <FileCheck className="mr-2 h-4 w-4" />
              Hierarchy Tests
            </Button>
            
            <Button 
              variant="outline" 
              onClick={() => runTests('safety')} 
              disabled={isRunning}
            >
              <Shield className="mr-2 h-4 w-4" />
              Safety Tests
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setUseLocalValidation(!useLocalValidation)}
            >
              <Zap className={`mr-2 h-4 w-4 ${useLocalValidation ? 'text-yellow-500' : 'text-muted-foreground'}`} />
              {useLocalValidation ? 'Local Validation (Fast)' : 'API Validation'}
            </Button>
          </div>

          {isRunning && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Running tests...</span>
                <span>{currentTest || 'Initializing...'}</span>
              </div>
              <Progress value={progress} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {results && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Test Results</CardTitle>
                <CardDescription>
                  Completed at {new Date(results.endTime).toLocaleString()}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copyResults}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                </Button>
                <Button variant="outline" size="sm" onClick={downloadResults}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="table">
              <TabsList>
                <TabsTrigger value="table">Table View</TabsTrigger>
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="failures">Failures Only</TabsTrigger>
              </TabsList>

              <TabsContent value="table">
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <TableHead>Test ID</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Expected</TableHead>
                        <TableHead>Actual</TableHead>
                        <TableHead className="text-right">Duration</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.results.map((result) => (
                        <React.Fragment key={result.testId}>
                          <TableRow 
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => toggleExpanded(result.testId)}
                          >
                            <TableCell>
                              {expandedTests.has(result.testId) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {result.testId}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getStatusIcon(result.status)}
                                {getStatusBadge(result.status)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{result.expected.status}</Badge>
                            </TableCell>
                            <TableCell>
                              {result.actual && (
                                <Badge variant={result.actual.status === result.expected.status ? 'default' : 'destructive'}>
                                  {result.actual.status}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="flex items-center justify-end gap-1 text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {result.duration}ms
                              </span>
                            </TableCell>
                          </TableRow>
                          {expandedTests.has(result.testId) && (
                            <TableRow>
                              <TableCell colSpan={6}>
                                <div className="p-4 bg-muted/30 rounded-md space-y-2">
                                  {result.error && (
                                    <Alert variant="destructive">
                                      <AlertTriangle className="h-4 w-4" />
                                      <AlertTitle>Error</AlertTitle>
                                      <AlertDescription>{result.error}</AlertDescription>
                                    </Alert>
                                  )}
                                  {result.details && (
                                    <p className="text-sm text-muted-foreground">{result.details}</p>
                                  )}
                                  {result.expected.failedChecks && result.expected.failedChecks.length > 0 && (
                                    <div>
                                      <span className="text-sm font-medium">Expected Failed Checks:</span>
                                      <div className="flex gap-1 mt-1">
                                        {result.expected.failedChecks.map(check => (
                                          <Badge key={check} variant="outline">{check}</Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {result.actual?.failedChecks && result.actual.failedChecks.length > 0 && (
                                    <div>
                                      <span className="text-sm font-medium">Actual Failed Checks:</span>
                                      <div className="flex gap-1 mt-1">
                                        {result.actual.failedChecks.map(check => (
                                          <Badge key={check} variant="destructive">{check}</Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {result.actual?.confidenceScore !== undefined && (
                                    <p className="text-sm">
                                      <span className="font-medium">Confidence Score:</span> {result.actual.confidenceScore}%
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="summary">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 py-4">
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-3xl font-bold">{results.summary.total}</div>
                    <div className="text-sm text-muted-foreground">Total</div>
                  </div>
                  <div className="text-center p-4 bg-green-500/10 rounded-lg">
                    <div className="text-3xl font-bold text-green-600">{results.summary.passed}</div>
                    <div className="text-sm text-muted-foreground">Passed</div>
                  </div>
                  <div className="text-center p-4 bg-red-500/10 rounded-lg">
                    <div className="text-3xl font-bold text-red-600">{results.summary.failed}</div>
                    <div className="text-sm text-muted-foreground">Failed</div>
                  </div>
                  <div className="text-center p-4 bg-yellow-500/10 rounded-lg">
                    <div className="text-3xl font-bold text-yellow-600">{results.summary.errors}</div>
                    <div className="text-sm text-muted-foreground">Errors</div>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-3xl font-bold">{results.summary.skipped}</div>
                    <div className="text-sm text-muted-foreground">Skipped</div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="failures">
                <ScrollArea className="h-[500px]">
                  {results.results.filter(r => r.status === 'failed' || r.status === 'error').length === 0 ? (
                    <Alert>
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertTitle>All tests passed!</AlertTitle>
                      <AlertDescription>No failures to display.</AlertDescription>
                    </Alert>
                  ) : (
                    <div className="space-y-4">
                      {results.results
                        .filter(r => r.status === 'failed' || r.status === 'error')
                        .map(result => (
                          <Alert key={result.testId} variant="destructive">
                            <XCircle className="h-4 w-4" />
                            <AlertTitle className="font-mono">{result.testId}</AlertTitle>
                            <AlertDescription>
                              {result.error || result.details || 'Test failed without additional details'}
                              {result.expected.failedChecks && (
                                <div className="mt-2">
                                  <span className="font-medium">Expected checks: </span>
                                  {result.expected.failedChecks.join(', ')}
                                </div>
                              )}
                              {result.actual?.failedChecks && (
                                <div>
                                  <span className="font-medium">Actual checks: </span>
                                  {result.actual.failedChecks.join(', ')}
                                </div>
                              )}
                            </AlertDescription>
                          </Alert>
                        ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Test Cases Reference */}
      <Card>
        <CardHeader>
          <CardTitle>Test Cases Reference</CardTitle>
          <CardDescription>
            Available test cases organized by category
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="passing">
            <TabsList>
              <TabsTrigger value="passing">Passing ({Object.keys(testSuite).filter(k => k.startsWith('PASS')).length})</TabsTrigger>
              <TabsTrigger value="failing">Failing ({Object.keys(testSuite).filter(k => k.startsWith('FAIL')).length})</TabsTrigger>
              <TabsTrigger value="incomplete">Incomplete ({Object.keys(testSuite).filter(k => k.startsWith('INCOMPLETE')).length})</TabsTrigger>
            </TabsList>

            {['passing', 'failing', 'incomplete'].map(category => (
              <TabsContent key={category} value={category}>
                <div className="grid gap-2">
                  {Object.entries(testSuite)
                    .filter(([id]) => id.toLowerCase().startsWith(category.slice(0, 4).toUpperCase()))
                    .map(([id, data]) => {
                      const expected = getExpectedResult(id);
                      return (
                        <div key={id} className="flex items-center justify-between p-2 border rounded-md">
                          <div>
                            <span className="font-mono text-sm">{id}</span>
                            <p className="text-xs text-muted-foreground">
                              {data.cocType} COC - {data.installationType}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{expected.status}</Badge>
                            {expected.failedChecks && expected.failedChecks.length > 0 && (
                              <Badge variant="secondary">{expected.failedChecks.join(', ')}</Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default COCTestDashboard;
