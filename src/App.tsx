import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";


import SiteDetail from "./pages/SiteDetail";
import SubsectionDetail from "./pages/SubsectionDetail";
import PublicSubsection from "./pages/PublicSubsection";
import Sites from "./pages/Sites";
import Inspections from "./pages/Inspections";
import InspectionDetail from "./pages/InspectionDetail";
import InspectionTemplates from "./pages/InspectionTemplates";
import TemplateBuilderPage from "./pages/TemplateBuilderPage";
import Users from "./pages/Users";
import Calendar from "./pages/Calendar";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import ValidationFeedback from "./pages/ValidationFeedback";
import AdminClientPreview from "./pages/AdminClientPreview";
import ClientProtectedRoute from "./components/ClientProtectedRoute";
import { ClientPortalLayout } from "./components/ClientPortalLayout";
import ClientPortalDashboard from "./pages/ClientPortalDashboard";
import ClientPortalSites from "./pages/ClientPortalSites";
import ClientPortalSiteDetail from "./pages/ClientPortalSiteDetail";
import ClientPortalSubsectionDetail from "./pages/ClientPortalSubsectionDetail";
import ClientPortalCalendar from "./pages/ClientPortalCalendar";
import ContractorProtectedRoute from "./components/ContractorProtectedRoute";
import ContractorDashboard from "./pages/ContractorDashboard";
import ContractorSites from "./pages/ContractorSites";
import ContractorSiteDetail from "./pages/ContractorSiteDetail";

const queryClient = new QueryClient();

const DashboardLayout = ({ children }: { children: React.ReactNode }) => (
  <SidebarProvider defaultOpen={false}>
    <div className="flex min-h-screen w-full">
      <AppSidebar />
      <main className="flex-1 flex flex-col w-full">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4 lg:px-6">
          <SidebarTrigger className="h-10 w-10" />
          <h1 className="text-lg font-semibold md:text-xl">Electrical Compliance</h1>
        </header>
        <div className="flex-1 p-3 md:p-4 lg:p-6 overflow-x-hidden">
          {children}
        </div>
      </main>
    </div>
  </SidebarProvider>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          
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
            path="/admin-client-preview"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <AdminClientPreview />
                </DashboardLayout>
              </ProtectedRoute>
            }
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
                <ContractorDashboard />
              </ContractorProtectedRoute>
            }
          />
          <Route
            path="/contractor/sites"
            element={
              <ContractorProtectedRoute>
                <ContractorSites />
              </ContractorProtectedRoute>
            }
          />
          <Route
            path="/contractor/sites/:siteId"
            element={
              <ContractorProtectedRoute>
                <ContractorSiteDetail />
              </ContractorProtectedRoute>
            }
          />
          <Route
            path="/contractor/inspections/:inspectionId"
            element={
              <ContractorProtectedRoute>
                <DashboardLayout>
                  <InspectionDetail />
                </DashboardLayout>
              </ContractorProtectedRoute>
            }
          />
          
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
