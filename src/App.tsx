import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardSummary, Lead, LeadInput, LeadStatus } from './types/lead.ts';
import {
  ApiClientError,
  createLead,
  deleteLead,
  fetchDashboard,
  fetchLeads,
  updateLead,
} from './services/api.ts';
import { Sidebar, type ActivePage } from './components/Sidebar.tsx';
import { TopHeader } from './components/TopHeader.tsx';
import { LeadModal } from './components/LeadModal.tsx';
import { DeleteConfirmModal } from './components/DeleteConfirmModal.tsx';
import {
  ToastNotification,
  type ToastItem,
} from './components/ToastNotification.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { LeadsPage } from './pages/LeadsPage.tsx';

export default function App() {
  const [activePage, setActivePage] = useState<ActivePage>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | ''>('');

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadsError, setLeadsError] = useState<string | null>(null);

  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);

  const [deletingLead, setDeletingLead] = useState<Lead | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(0);

  const addToast = useCallback((type: 'success' | 'error', message: string) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 180);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const loadDashboard = useCallback(async (signal?: AbortSignal) => {
    setSummaryLoading(true);
    try {
      const data = await fetchDashboard(signal);
      setSummary(data);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return;
      }
      console.error('Failed to fetch dashboard summary:', err);
    } finally {
      if (!signal?.aborted) {
        setSummaryLoading(false);
      }
    }
  }, []);

  const loadLeads = useCallback(
    async (
      searchValue: string,
      statusValue: LeadStatus | '',
      signal?: AbortSignal
    ) => {
      setLeadsLoading(true);
      setLeadsError(null);
      try {
        const data = await fetchLeads({
          search: searchValue,
          status: statusValue,
          signal,
        });
        setLeads(data);
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          return;
        }
        const message =
          err instanceof ApiClientError
            ? err.message
            : 'Unable to reach the Lead Manager backend server.';
        setLeadsError(message);
      } finally {
        if (!signal?.aborted) {
          setLeadsLoading(false);
        }
      }
    },
    []
  );

  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadDashboard(),
      loadLeads(debouncedSearch, statusFilter),
    ]);
  }, [loadDashboard, loadLeads, debouncedSearch, statusFilter]);

  useEffect(() => {
    const controller = new AbortController();
    loadDashboard(controller.signal);
    return () => controller.abort();
  }, [loadDashboard]);

  useEffect(() => {
    const controller = new AbortController();
    loadLeads(debouncedSearch, statusFilter, controller.signal);
    return () => controller.abort();
  }, [debouncedSearch, statusFilter, loadLeads]);

  const handleOpenAddModal = () => {
    setEditingLead(null);
    setLeadModalOpen(true);
  };

  const handleOpenEditModal = (lead: Lead) => {
    setEditingLead(lead);
    setLeadModalOpen(true);
  };

  const handleSaveLead = async (data: LeadInput, leadId?: number) => {
    if (leadId !== undefined) {
      const updated = await updateLead(leadId, data);
      setLeadModalOpen(false);
      setEditingLead(null);
      addToast('success', `Updated lead "${updated.name}".`);
    } else {
      const created = await createLead(data);
      setLeadModalOpen(false);
      addToast('success', `Added new lead "${created.name}".`);
    }
    await refreshAll();
  };

  const handleConfirmDelete = async () => {
    if (!deletingLead) {
      return;
    }
    setIsDeleting(true);
    const targetName = deletingLead.name;
    try {
      await deleteLead(deletingLead.id);
      setDeletingLead(null);
      addToast('success', `Deleted lead "${targetName}".`);
      await refreshAll();
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : 'Failed to delete lead. Please try again.';
      addToast('error', message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setStatusFilter('');
  };

  const handleNavigateDashboard = () => {
    setActivePage('dashboard');
    setStatusFilter('');
  };

  const handleNavigateAllLeads = () => {
    setActivePage('leads');
    setStatusFilter('');
  };

  const handleSelectStatusView = (status: LeadStatus) => {
    setActivePage('leads');
    setStatusFilter(status);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      <Sidebar
        activePage={activePage}
        activeStatusFilter={statusFilter}
        summary={summary}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onNavigateDashboard={handleNavigateDashboard}
        onNavigateAllLeads={handleNavigateAllLeads}
        onSelectStatusView={handleSelectStatusView}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopHeader
          activePage={activePage}
          activeStatusFilter={statusFilter}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onAddLead={handleOpenAddModal}
        />

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1440px] w-full mx-auto">
          {activePage === 'dashboard' ? (
            <DashboardPage
              summary={summary}
              summaryLoading={summaryLoading}
              leads={leads}
              leadsLoading={leadsLoading}
              leadsError={leadsError}
              search={searchInput}
              statusFilter={statusFilter}
              onSearchChange={setSearchInput}
              onStatusChange={setStatusFilter}
              onClearFilters={handleClearFilters}
              onEditLead={handleOpenEditModal}
              onDeleteLead={setDeletingLead}
              onAddLead={handleOpenAddModal}
              onRetry={refreshAll}
            />
          ) : (
            <LeadsPage
              summary={summary}
              leads={leads}
              leadsLoading={leadsLoading}
              leadsError={leadsError}
              search={searchInput}
              statusFilter={statusFilter}
              onSearchChange={setSearchInput}
              onStatusChange={setStatusFilter}
              onClearFilters={handleClearFilters}
              onEditLead={handleOpenEditModal}
              onDeleteLead={setDeletingLead}
              onAddLead={handleOpenAddModal}
              onRetry={refreshAll}
            />
          )}
        </main>
      </div>

      <LeadModal
        open={leadModalOpen}
        editingLead={editingLead}
        onClose={() => {
          setLeadModalOpen(false);
          setEditingLead(null);
        }}
        onSubmit={handleSaveLead}
      />

      <DeleteConfirmModal
        lead={deletingLead}
        deleting={isDeleting}
        onCancel={() => setDeletingLead(null)}
        onConfirm={handleConfirmDelete}
      />

      <ToastNotification toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
