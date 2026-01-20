import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LoadingState } from "@/components/LoadingState";
import ProtectedRoute from "@/components/ProtectedRoute";

// Lazy load pages for better performance
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Clients = lazy(() => import("./pages/Clients"));
const ClientDetail = lazy(() => import("./pages/ClientDetail"));
const SiteDetail = lazy(() => import("./pages/SiteDetail"));
const SubsectionDetail = lazy(() => import("./pages/SubsectionDetail"));
const PublicSubsection = lazy(() => import("./pages/PublicSubsection"));
const Sites = lazy(() => import("./pages/Sites"));
const Inspections = lazy(() => import("./pages/Inspections"));
const InspectionDetail = lazy(() => import("./pages/InspectionDetail"));
const InspectionTemplates = lazy(() => import("./pages/InspectionTemplates"));
const TemplateBuilderPage = lazy(() => import("./pages/TemplateBuilderPage"));
const TemplateValidator = lazy(() => import("./pages/TemplateValidator"));
const Users = lazy(() => import("./pages/Users"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ValidationFeedback = lazy(() => import("./pages/ValidationFeedback"));
const PortalManagement = lazy(() => import("./pages/PortalManagement"));
const OfflineReview = lazy(() => import("./pages/OfflineReview"));

const ClientPortalDashboard = lazy(() => import("./pages/ClientPortalDashboard"));
const ClientPortalSites = lazy(() => import("./pages/ClientPortalSites"));
const ClientPortalSiteDetail = lazy(() => import("./pages/ClientPortalSiteDetail"));
const ClientPortalSubsectionDetail = lazy(() => import("./pages/ClientPortalSubsectionDetail"));
const ClientPortalCalendar = lazy(() => import("./pages/ClientPortalCalendar"));
const ContractorDashboard = lazy(() => import("./pages/ContractorDashboard"));
const ContractorSites = lazy(() => import("./pages/ContractorSites"));
const ContractorSiteDetail = lazy(() => import("./pages/ContractorSiteDetail"));
const ContractorSubsectionDetail = lazy(() => import("./pages/ContractorSubsectionDetail"));
const ContractorPortal = lazy(() => import("./pages/ContractorPortal"));
const FeedbackManagement = lazy(() => import("./pages/FeedbackManagement"));
const QRCodes = lazy(() => import("./pages/QRCodes"));
const Install = lazy(() => import("./pages/Install"));
const PDFTemplateTestDashboard = lazy(() => import("./pages/PDFTemplateTestDashboard"));

const COCDocumentation = lazy(() => import("./pages/COCDocumentation"));

// Eagerly load components that appear on every page
import ClientProtectedRoute from "./components/ClientProtectedRoute";
import { ClientPortalLayout } from "./components/ClientPortalLayout";
import ContractorProtectedRoute from "./components/ContractorProtectedRoute";
import ContractorPortalLayout from "./components/ContractorPortalLayout";
import { HelpButton } from "./components/HelpButton";
import { DoubleSlashRedirect } from "./components/DoubleSlashRedirect";
import { NotificationListener } from "./components/NotificationListener";
import { VerificationListener } from "./components/VerificationListener";
import { GlobalSearch } from "./components/GlobalSearch";

const queryClient = new QueryClient();

const DashboardLayout = ({ children }: { children: React.ReactNode }) => (
  <SidebarProvider defaultOpen={true}>
    <div className="flex min-h-screen w-full">
      <AppSidebar />
      <main className="flex-1 flex flex-col w-full max-h-screen overflow-hidden">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4 lg:px-6 flex-shrink-0">
          <SidebarTrigger className="h-10 w-10" />
          <h1 className="text-lg font-semibold md:text-xl">Electrical Compliance</h1>
          <div className="flex-1 flex justify-end">
            <GlobalSearch />
          </div>
        </header>
        <div className="flex-1 p-3 md:p-4 lg:p-6 overflow-x-hidden overflow-y-auto overscroll-y-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
          {children}
        </div>
      </main>
    </div>
  </SidebarProvider>
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <HelpButton />
        <NotificationListener />
        <VerificationListener />
        <OfflineIndicator />
        <BrowserRouter>
          <DoubleSlashRedirect>
            <Suspense fallback={<LoadingState variant="full-page" message="Loading..." />}>
              <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/install" element={<Install />} />
          
          {/* Public QR Code Landing Pages - both patterns supported */}
          <Route path="/public/subsections/:subsectionId" element={<PublicSubsection />} />
          <Route path="/public/clients/:clientId/sites/:siteId/subsections/:subsectionId" element={<PublicSubsection />} />
          
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Dashboard />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/clients"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Clients />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/clients/:clientId"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <ClientDetail />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/clients/:clientId/sites/:siteId"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <SiteDetail />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/clients/:clientId/sites/:siteId/subsections/:subsectionId"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <SubsectionDetail />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/clients/:clientId/sites/:siteId/subsections/:subsectionId/inspections/:inspectionId"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <InspectionDetail />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/clients/:clientId/sites"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Sites />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/sites/:siteId"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <SiteDetail />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/sites/:siteId/subsections/:subsectionId"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <SubsectionDetail />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/sites/:siteId/subsections/:subsectionId/inspections/:inspectionId"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <InspectionDetail />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/sites"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Sites />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/inspections"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Inspections />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/inspection-templates"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <InspectionTemplates />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/inspection-templates/new"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <TemplateBuilderPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/inspection-templates/:templateId/edit"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <TemplateBuilderPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/inspection-templates/validate"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <TemplateValidator />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Users />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/calendar"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Calendar />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Settings />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/site-assignments"
            element={<ProtectedRoute><DashboardLayout><PortalManagement /></DashboardLayout></ProtectedRoute>}
          />
          <Route
            path="/offline-review"
            element={<ProtectedRoute><DashboardLayout><OfflineReview /></DashboardLayout></ProtectedRoute>}
          />
          <Route
          path="/validation-feedback"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <ValidationFeedback />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/feedback-management"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <FeedbackManagement />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          {/* Redirect old routes to new consolidated page */}
          <Route path="/issue-reports" element={<ProtectedRoute><DashboardLayout><FeedbackManagement /></DashboardLayout></ProtectedRoute>} />
          <Route path="/suggestions" element={<ProtectedRoute><DashboardLayout><FeedbackManagement /></DashboardLayout></ProtectedRoute>} />
          <Route path="/verification-management" element={<ProtectedRoute><DashboardLayout><FeedbackManagement /></DashboardLayout></ProtectedRoute>} />
          <Route
            path="/qr-codes"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <QRCodes />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal-management"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <PortalManagement />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          {/* Redirect old portal preview routes to new consolidated page */}
          <Route path="/admin-client-preview" element={<ProtectedRoute><DashboardLayout><PortalManagement /></DashboardLayout></ProtectedRoute>} />
          <Route path="/admin-contractor-preview" element={<ProtectedRoute><DashboardLayout><PortalManagement /></DashboardLayout></ProtectedRoute>} />
          <Route path="/admin/contractor-access-simulator" element={<ProtectedRoute><DashboardLayout><PortalManagement /></DashboardLayout></ProtectedRoute>} />
          <Route
            path="/coc-documentation"
            element={<ProtectedRoute><DashboardLayout><COCDocumentation /></DashboardLayout></ProtectedRoute>}
          />
          <Route
            path="/pdf-template-tests"
            element={<ProtectedRoute><DashboardLayout><PDFTemplateTestDashboard /></DashboardLayout></ProtectedRoute>}
          />
          {/* Client Portal Routes */}
          <Route
            path="/client-portal"
            element={
              <ClientProtectedRoute>
                <ClientPortalLayout>
                  <ClientPortalDashboard />
                </ClientPortalLayout>
              </ClientProtectedRoute>
            }
          />
          <Route
            path="/client-portal/sites"
            element={
              <ClientProtectedRoute>
                <ClientPortalLayout>
                  <ClientPortalSites />
                </ClientPortalLayout>
              </ClientProtectedRoute>
            }
          />
          <Route
            path="/client-portal/sites/:siteId"
            element={
              <ClientProtectedRoute>
                <ClientPortalLayout>
                  <ClientPortalSiteDetail />
                </ClientPortalLayout>
              </ClientProtectedRoute>
            }
          />
          <Route
            path="/client-portal/subsections/:subsectionId"
            element={
              <ClientProtectedRoute>
                <ClientPortalLayout>
                  <ClientPortalSubsectionDetail />
                </ClientPortalLayout>
              </ClientProtectedRoute>
            }
          />
          <Route
            path="/client-portal/calendar"
            element={
              <ClientProtectedRoute>
                <ClientPortalLayout>
                  <ClientPortalCalendar />
                </ClientPortalLayout>
              </ClientProtectedRoute>
            }
          />
          
          {/* Contractor Portal Routes */}
          <Route
            path="/contractor"
            element={
              <ContractorProtectedRoute>
                <ContractorPortal />
              </ContractorProtectedRoute>
            }
          />
          <Route
            path="/contractor/subsections/:subsectionId"
            element={
              <ContractorProtectedRoute>
                <ContractorSubsectionDetail />
              </ContractorProtectedRoute>
            }
          />
          <Route
            path="/contractor/inspections/:inspectionId"
            element={
              <ContractorProtectedRoute>
                <ContractorPortalLayout>
                  <InspectionDetail />
                </ContractorPortalLayout>
              </ContractorProtectedRoute>
            }
          />
          
          <Route path="*" element={<NotFound />} />
        </Routes>
            </Suspense>
        </DoubleSlashRedirect>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
