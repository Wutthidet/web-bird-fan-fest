import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, timer, forkJoin, Observable } from 'rxjs';
import { takeUntil, finalize, retry } from 'rxjs/operators';
import { AdminService, ZoneStat, AdminTransaction, SeatLog } from '../../services/admin.service';
import { ToastService } from '../../services/toast.service';
import { ConfirmationModalComponent } from '../../shared/components/confirmation/confirmation.component';
import { SkeletonCardComponent } from '../../shared/components/skeleton-card/skeleton-card.component';
import { SkeletonTableComponent } from '../../shared/components/skeleton-table/skeleton-table.component';
import { AutoRefreshControlComponent } from '../../shared/components/auto-refresh/auto-refresh.component';
import { ErrorBoundaryComponent } from '../../shared/components/error-boundary/error-boundary.component';

interface StatusFilter {
  status: 0 | 1 | 2 | 3;
  label: string;
}

interface ConfirmationData {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  action: 'approve' | 'cancel' | 'refresh' | 'clear-data' | 'export-data' | 'bulk-approve' | 'bulk-cancel';
  confirmationType?: 'danger' | 'confirm' | 'info';
  transactionId?: string;
  additionalData?: any;
}

interface ZoneGroup {
  inner: boolean;
  middle: boolean;
  outer: boolean;
}

interface FilterOptions {
  dateFrom: string;
  dateTo: string;
  amountMin: number | null;
  amountMax: number | null;
  seatsMin: number | null;
  seatsMax: number | null;
}

interface SortConfig {
  field: string;
  direction: 'asc' | 'desc';
}

interface PaginationConfig {
  currentPage: number;
  itemsPerPage: number;
  totalItems: number;
  totalPages: number;
}

interface LoadingStates {
  zones: boolean;
  transactions: boolean;
  seatLogs: boolean;
  globalRefresh: boolean;
}

interface ErrorStates {
  zones: string;
  transactions: string;
  seatLogs: string;
  global: boolean;
  globalTitle: string;
  globalMessage: string;
  globalStack: string;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ConfirmationModalComponent,
    SkeletonCardComponent,
    SkeletonTableComponent,
    AutoRefreshControlComponent,
    ErrorBoundaryComponent
  ],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})

export class AdminDashboardComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  public readonly MAX_RETRIES = 3
  private pendingRequests = new Set<string>();
  public retryCount = 0;
  zoneStats: ZoneStat[] = [];
  allTransactions: AdminTransaction[] = [];
  filteredTransactions: AdminTransaction[] = [];
  displayedTransactions: AdminTransaction[] = [];
  allSeatLogs: SeatLog[] = [];
  filteredSeatLogs: SeatLog[] = [];
  displayedSeatLogs: SeatLog[] = [];
  loadingStates: LoadingStates = {
    zones: false,
    transactions: false,
    seatLogs: false,
    globalRefresh: false
  };
  errorStates: ErrorStates = {
    zones: '',
    transactions: '',
    seatLogs: '',
    global: false,
    globalTitle: 'เกิดข้อผิดพลาด',
    globalMessage: 'ระบบพบข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง',
    globalStack: ''
  };
  lastRefreshTime: Date | null = null;
  autoRefreshInterval = 0;
  selectedStatusFilter: 0 | 1 | 2 | 3 = 0;
  isProcessing: string | null | boolean = null;
  activeTab: 'overview' | 'transactions' | 'seat-logs' = 'overview';
  selectedTransactionIds = new Set<string>();
  selectAllTransactions = false;
  showBulkActions = false;
  searchQuery = '';
  showFilters = false;
  filterOptions: FilterOptions = {
    dateFrom: '',
    dateTo: '',
    amountMin: null,
    amountMax: null,
    seatsMin: null,
    seatsMax: null
  };
  seatLogsSearchQuery = '';
  showSeatLogsFilters = false;
  seatLogsFilterOptions = {
    dateFrom: '',
    dateTo: '',
    zone: '',
    user: '',
    action: ''
  };
  sortConfig: SortConfig = {
    field: 'CreatedAt',
    direction: 'desc'
  };
  seatLogsSortConfig: SortConfig = {
    field: 'At',
    direction: 'desc'
  };
  pagination: PaginationConfig = {
    currentPage: 1,
    itemsPerPage: 10,
    totalItems: 0,
    totalPages: 0
  };
  seatLogsPagination: PaginationConfig = {
    currentPage: 1,
    itemsPerPage: 15,
    totalItems: 0,
    totalPages: 0
  };
  showImageModal = false;
  selectedImageUrl = '';
  showZoneDetailsModal = false;
  selectedZone: ZoneStat | null = null;
  showTransactionDetailsModal = false;
  selectedTransaction: AdminTransaction | null = null;
  showSeatLogDetailsModal = false;
  selectedSeatLog: SeatLog | null = null;
  expandedGroups: ZoneGroup = {
    inner: false,
    middle: false,
    outer: false
  };
  showConfirmation = false;
  confirmationData: ConfirmationData = {
    title: '',
    message: '',
    confirmText: '',
    cancelText: '',
    action: 'approve',
    confirmationType: 'danger'
  };
  readonly statusFilters: StatusFilter[] = [
    { status: 0, label: 'ทั้งหมด' },
    { status: 1, label: 'ยังไม่จ่าย' },
    { status: 2, label: 'รอตรวจสอบ' },
    { status: 3, label: 'ชำระสำเร็จ' }
  ];
  readonly actionTypes = [
    { value: '', label: 'ทุกการกระทำ' },
    { value: 'Approved', label: 'อนุมัติ' },
    { value: 'Canceled', label: 'ยกเลิก' },
    { value: 'Created', label: 'สร้าง' },
    { value: 'Updated', label: 'แก้ไข' }
  ];
  readonly skeletonColumns = [
    { type: 'id' as const },
    { type: 'name' as const },
    { type: 'amount' as const },
    { type: 'short' as const },
    { type: 'status' as const },
    { type: 'date' as const },
    { type: 'actions' as const }
  ];
  readonly seatLogsSkeletonColumns = [
    { type: 'id' as const },
    { type: 'name' as const },
    { type: 'medium' as const },
    { type: 'short' as const },
    { type: 'date' as const },
    { type: 'actions' as const }
  ];
  private readonly zoneTypeMap: { [key: string]: 'inner' | 'middle' | 'outer' } = {
    'A1': 'inner', 'A2': 'inner', 'A3': 'inner', 'A4': 'inner',
    'B1': 'inner', 'B2': 'inner', 'B3': 'inner', 'B4': 'inner',
    'C1': 'inner', 'C2': 'inner', 'C3': 'inner',
    'SB': 'middle', 'SC': 'middle', 'SD': 'middle', 'SE': 'middle',
    'SF': 'middle', 'SG': 'middle', 'SH': 'middle', 'SI': 'middle',
    'SJ': 'middle', 'SK': 'middle', 'SL': 'middle', 'SM': 'middle', 'SN': 'middle'
  };
  constructor(
    private adminService: AdminService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef
  ) { }
  ngOnInit(): void {
    this.setDefaultDateRange();
    this.setupErrorHandling();
    this.loadInitialData();
  }
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.cancelAllPendingRequests();
    this.removeErrorHandlers();
  }
  private setupErrorHandling(): void {
    window.addEventListener('unhandledrejection', this.handleUnhandledError);
    window.addEventListener('error', this.handleGlobalError);
  }
  private removeErrorHandlers(): void {
    window.removeEventListener('unhandledrejection', this.handleUnhandledError);
    window.removeEventListener('error', this.handleGlobalError);
  }
  private handleUnhandledError = (event: PromiseRejectionEvent): void => {
    this.showGlobalError(
      'เกิดข้อผิดพลาดในระบบ',
      event.reason?.message || 'ข้อผิดพลาดที่ไม่ทราบสาเหตุ',
      event.reason?.stack
    );
  };
  private handleGlobalError = (event: ErrorEvent): void => {
    this.showGlobalError(
      'เกิดข้อผิดพลาดในระบบ',
      event.message,
      event.error?.stack
    );
  };
  private showGlobalError(title: string, message: string, stack?: string): void {
    this.errorStates.global = true;
    this.errorStates.globalTitle = title;
    this.errorStates.globalMessage = message;
    this.errorStates.globalStack = stack || '';
    this.cdr.detectChanges();
  }
  private cancelAllPendingRequests(): void {
    this.pendingRequests.clear();
  }
  private setDefaultDateRange(): void {
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
    this.filterOptions.dateFrom = thirtyDaysAgo.toISOString().split('T')[0];
    this.filterOptions.dateTo = today.toISOString().split('T')[0];
    this.seatLogsFilterOptions.dateFrom = thirtyDaysAgo.toISOString().split('T')[0];
    this.seatLogsFilterOptions.dateTo = today.toISOString().split('T')[0];
  }
  private loadInitialData(): void {
    this.loadZoneStats();
    this.loadTransactions();
  }
  onAutoRefreshIntervalChange(interval: number): void {
    this.autoRefreshInterval = interval;
  }
  onManualRefresh(): void {
    this.refreshAllData();
  }
  onGlobalRetry(): void {
    this.retryCount++;
    this.errorStates.global = false;
    this.loadInitialData();
  }
  switchTab(tab: 'overview' | 'transactions' | 'seat-logs'): void {
    this.activeTab = tab;
    if (tab === 'seat-logs' && this.allSeatLogs.length === 0) {
      this.loadSeatLogs();
    }
    this.cdr.detectChanges();
  }
  private createRetryableRequest<T>(
    requestFn: () => Observable<T>,
    requestName: string,
    maxRetries: number = this.MAX_RETRIES
  ): Observable<T> {
    this.pendingRequests.add(requestName);
    return requestFn().pipe(
      retry({
        count: maxRetries,
        delay: (error, retryCount) => {
          console.warn(`Request ${requestName} failed, retry ${retryCount}/${maxRetries}:`, error);
          return timer(Math.min(1000 * Math.pow(2, retryCount - 1), 10000));
        }
      }),
      finalize(() => {
        this.pendingRequests.delete(requestName);
      }),
      takeUntil(this.destroy$)
    );
  }
  loadZoneStats(): void {
    if (this.loadingStates.zones) return;
    this.loadingStates.zones = true;
    this.errorStates.zones = '';
    this.cdr.detectChanges();
    this.createRetryableRequest(
      () => this.adminService.getEmptySeats(),
      'loadZoneStats'
    )
      .pipe(
        finalize(() => {
          this.loadingStates.zones = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (response) => {
          if (response.status === 'success') {
            this.zoneStats = response.zones.sort((a, b) => {
              const aType = this.getZoneType(a.ZONE);
              const bType = this.getZoneType(b.ZONE);
              const typeOrder = { inner: 0, middle: 1, outer: 2 };
              if (typeOrder[aType] !== typeOrder[bType]) {
                return typeOrder[aType] - typeOrder[bType];
              }
              return a.ZONE.localeCompare(b.ZONE);
            });
          }
        },
        error: (error) => {
          this.errorStates.zones = error.message || 'ไม่สามารถโหลดข้อมูลโซนได้';
          this.toastService.error('โหลดข้อมูลไม่สำเร็จ', this.errorStates.zones);
        }
      });
  }
  loadTransactions(): void {
    if (this.loadingStates.transactions) return;
    this.loadingStates.transactions = true;
    this.errorStates.transactions = '';
    this.cdr.detectChanges();
    this.createRetryableRequest(
      () => this.adminService.getAllTransactions(),
      'loadTransactions'
    )
      .pipe(
        finalize(() => {
          this.loadingStates.transactions = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (response) => {
          if (response.status === 'success') {
            this.allTransactions = response.data.sort((a, b) =>
              new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime()
            );
            this.applyFiltersAndSearch();
          }
        },
        error: (error) => {
          this.errorStates.transactions = error.message || 'ไม่สามารถโหลดข้อมูลการจองได้';
          this.toastService.error('โหลดข้อมูลไม่สำเร็จ', this.errorStates.transactions);
        }
      });
  }
  loadSeatLogs(): void {
    if (this.loadingStates.seatLogs) return;
    this.loadingStates.seatLogs = true;
    this.errorStates.seatLogs = '';
    this.cdr.detectChanges();
    this.createRetryableRequest(
      () => this.adminService.getSeatLogs(),
      'loadSeatLogs'
    )
      .pipe(
        finalize(() => {
          this.loadingStates.seatLogs = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (response) => {
          if (response.status === 'success') {
            this.allSeatLogs = response.data.sort((a, b) =>
              new Date(b.At).getTime() - new Date(a.At).getTime()
            );
            this.applySeatLogsFiltersAndSearch();
          }
        },
        error: (error) => {
          this.errorStates.seatLogs = error.message || 'ไม่สามารถโหลดประวัติที่นั่งได้';
          this.toastService.error('โหลดข้อมูลไม่สำเร็จ', this.errorStates.seatLogs);
        }
      });
  }
  getAdminBadgeText(log: any): string {
    if (!log.isAdmin) return '';
    if (log.isAPF) {
      return 'ADMINAPF';
    } else if (log.isSRJ) {
      return 'ADMINSRJ';
    } else {
      return 'ADMIN';
    }
  }
  getAdminBadgeClass(log: any): string {
    if (!log.isAdmin) return '';
    if (log.isAPF) {
      return 'admin-apf';
    } else if (log.isSRJ) {
      return 'admin-srj';
    } else {
      return '';
    }
  }
  private refreshAllData(): void {
    if (this.loadingStates.globalRefresh) return;
    this.loadingStates.globalRefresh = true;
    this.cdr.detectChanges();
    const refreshRequests: Observable<any>[] = [
      this.createRetryableRequest(() => this.adminService.getEmptySeats(true), 'refreshZones'),
      this.createRetryableRequest(() => this.adminService.getAllTransactions(true), 'refreshTransactions')
    ];
    if (this.activeTab === 'seat-logs' || this.allSeatLogs.length > 0) {
      refreshRequests.push(
        this.createRetryableRequest(() => this.adminService.getSeatLogs(true), 'refreshSeatLogs')
      );
    }
    forkJoin(refreshRequests)
      .pipe(
        finalize(() => {
          this.loadingStates.globalRefresh = false;
          this.lastRefreshTime = new Date();
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: () => {
          this.loadZoneStats();
          this.loadTransactions();
          if (this.activeTab === 'seat-logs' || this.allSeatLogs.length > 0) {
            this.loadSeatLogs();
          }
          this.toastService.success('รีเฟรชสำเร็จ', 'ข้อมูลได้รับการอัปเดตแล้ว');
        },
        error: (error) => {
          this.toastService.error('รีเฟรชไม่สำเร็จ', 'ไม่สามารถรีเฟรชข้อมูลได้');
        }
      });
  }
  onSearchChange(): void {
    this.pagination.currentPage = 1;
    this.applyFiltersAndSearch();
  }
  onFilterChange(): void {
    this.pagination.currentPage = 1;
    this.applyFiltersAndSearch();
  }
  onSeatLogsSearchChange(): void {
    this.seatLogsPagination.currentPage = 1;
    this.applySeatLogsFiltersAndSearch();
  }
  onSeatLogsFilterChange(): void {
    this.seatLogsPagination.currentPage = 1;
    this.applySeatLogsFiltersAndSearch();
  }
  toggleFilters(): void {
    this.showFilters = !this.showFilters;
    this.cdr.detectChanges();
  }
  toggleSeatLogsFilters(): void {
    this.showSeatLogsFilters = !this.showSeatLogsFilters;
    this.cdr.detectChanges();
  }
  clearFilters(): void {
    this.searchQuery = '';
    this.filterOptions = {
      dateFrom: '',
      dateTo: '',
      amountMin: null,
      amountMax: null,
      seatsMin: null,
      seatsMax: null
    };
    this.setDefaultDateRange();
    this.selectedStatusFilter = 0;
    this.pagination.currentPage = 1;
    this.applyFiltersAndSearch();
  }
  clearSeatLogsFilters(): void {
    this.seatLogsSearchQuery = '';
    this.showSeatLogsFilters = false;
    this.seatLogsFilterOptions = {
      dateFrom: '',
      dateTo: '',
      zone: '',
      user: '',
      action: ''
    };
    this.setDefaultDateRange();
    this.seatLogsPagination.currentPage = 1;
    this.applySeatLogsFiltersAndSearch();
  }
  setStatusFilter(status: 0 | 1 | 2 | 3): void {
    this.selectedStatusFilter = status;
    this.pagination.currentPage = 1;
    this.applyFiltersAndSearch();
  }
  private applyFiltersAndSearch(): void {
    let filtered = [...this.allTransactions];
    if (this.selectedStatusFilter !== 0) {
      filtered = filtered.filter(t => t.Status === this.selectedStatusFilter);
    }
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(t => {
        const transactionId = t.transactionId.toString().toLowerCase();
        const fullName = `${t.FirstName} ${t.LastName}`.toLowerCase();
        const email = t.Email.toLowerCase();
        const phone = t.Phone.toLowerCase();
        return transactionId.includes(query) ||
          fullName.includes(query) ||
          email.includes(query) ||
          phone.includes(query);
      });
    }
    if (this.filterOptions.dateFrom) {
      const fromDate = new Date(this.filterOptions.dateFrom);
      filtered = filtered.filter(t => new Date(t.CreatedAt) >= fromDate);
    }
    if (this.filterOptions.dateTo) {
      const toDate = new Date(this.filterOptions.dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(t => new Date(t.CreatedAt) <= toDate);
    }
    if (this.filterOptions.amountMin !== null) {
      filtered = filtered.filter(t => t.TotalAmount >= this.filterOptions.amountMin!);
    }
    if (this.filterOptions.amountMax !== null) {
      filtered = filtered.filter(t => t.TotalAmount <= this.filterOptions.amountMax!);
    }
    if (this.filterOptions.seatsMin !== null) {
      filtered = filtered.filter(t => t.seats_data.length >= this.filterOptions.seatsMin!);
    }
    if (this.filterOptions.seatsMax !== null) {
      filtered = filtered.filter(t => t.seats_data.length <= this.filterOptions.seatsMax!);
    }
    this.applySorting(filtered);
    this.filteredTransactions = filtered;
    this.updatePagination();
    this.updateDisplayedTransactions();
    this.cdr.detectChanges();
  }
  private applySeatLogsFiltersAndSearch(): void {
    let filtered = [...this.allSeatLogs];
    if (this.seatLogsSearchQuery.trim()) {
      const query = this.seatLogsSearchQuery.toLowerCase().trim();
      filtered = filtered.filter(log => {
        const fullName = `${log.firstName} ${log.lastName}`.toLowerCase();
        const message = log.message.toLowerCase();
        const zones = log.seats_data.map(s => s.zone).join(' ').toLowerCase();
        return fullName.includes(query) ||
          message.includes(query) ||
          zones.includes(query) ||
          log.logId.toString().includes(query);
      });
    }
    if (this.seatLogsFilterOptions.dateFrom) {
      const fromDate = new Date(this.seatLogsFilterOptions.dateFrom);
      filtered = filtered.filter(log => new Date(log.At) >= fromDate);
    }
    if (this.seatLogsFilterOptions.dateTo) {
      const toDate = new Date(this.seatLogsFilterOptions.dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(log => new Date(log.At) <= toDate);
    }
    if (this.seatLogsFilterOptions.zone) {
      filtered = filtered.filter(log =>
        log.seats_data.some(seat =>
          seat.zone.toLowerCase().includes(this.seatLogsFilterOptions.zone.toLowerCase())
        )
      );
    }
    if (this.seatLogsFilterOptions.user) {
      const userQuery = this.seatLogsFilterOptions.user.toLowerCase();
      filtered = filtered.filter(log => {
        const fullName = `${log.firstName} ${log.lastName}`.toLowerCase();
        return fullName.includes(userQuery);
      });
    }
    if (this.seatLogsFilterOptions.action) {
      filtered = filtered.filter(log =>
        log.message.toLowerCase().includes(this.seatLogsFilterOptions.action.toLowerCase())
      );
    }
    this.applySeatLogsSorting(filtered);
    this.filteredSeatLogs = filtered;
    this.updateSeatLogsPagination();
    this.updateDisplayedSeatLogs();
    this.cdr.detectChanges();
  }
  private applySorting(transactions: AdminTransaction[]): void {
    transactions.sort((a, b) => {
      let aValue: any;
      let bValue: any;
      switch (this.sortConfig.field) {
        case 'transactionId':
          aValue = a.transactionId;
          bValue = b.transactionId;
          break;
        case 'name':
          aValue = `${a.FirstName} ${a.LastName}`;
          bValue = `${b.FirstName} ${b.LastName}`;
          break;
        case 'TotalAmount':
          aValue = a.TotalAmount;
          bValue = b.TotalAmount;
          break;
        case 'Status':
          aValue = a.Status;
          bValue = b.Status;
          break;
        case 'CreatedAt':
          aValue = new Date(a.CreatedAt);
          bValue = new Date(b.CreatedAt);
          break;
        case 'seatsCount':
          aValue = a.seats_data.length;
          bValue = b.seats_data.length;
          break;
        default:
          return 0;
      }
      if (aValue < bValue) {
        return this.sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return this.sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }
  private applySeatLogsSorting(logs: SeatLog[]): void {
    logs.sort((a, b) => {
      let aValue: any;
      let bValue: any;
      switch (this.seatLogsSortConfig.field) {
        case 'logId':
          aValue = a.logId;
          bValue = b.logId;
          break;
        case 'user':
          aValue = `${a.firstName} ${a.lastName}`;
          bValue = `${b.firstName} ${b.lastName}`;
          break;
        case 'message':
          aValue = a.message;
          bValue = b.message;
          break;
        case 'At':
          aValue = new Date(a.At);
          bValue = new Date(b.At);
          break;
        case 'seatsCount':
          aValue = a.seats_data.length;
          bValue = b.seats_data.length;
          break;
        default:
          return 0;
      }
      if (aValue < bValue) {
        return this.seatLogsSortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return this.seatLogsSortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }
  private updatePagination(): void {
    this.pagination.totalItems = this.filteredTransactions.length;
    this.pagination.totalPages = Math.ceil(this.pagination.totalItems / this.pagination.itemsPerPage);
    if (this.pagination.currentPage > this.pagination.totalPages) {
      this.pagination.currentPage = Math.max(1, this.pagination.totalPages);
    }
  }
  private updateSeatLogsPagination(): void {
    this.seatLogsPagination.totalItems = this.filteredSeatLogs.length;
    this.seatLogsPagination.totalPages = Math.ceil(this.seatLogsPagination.totalItems / this.seatLogsPagination.itemsPerPage);
    if (this.seatLogsPagination.currentPage > this.seatLogsPagination.totalPages) {
      this.seatLogsPagination.currentPage = Math.max(1, this.seatLogsPagination.totalPages);
    }
  }
  private updateDisplayedTransactions(): void {
    const startIndex = (this.pagination.currentPage - 1) * this.pagination.itemsPerPage;
    const endIndex = startIndex + this.pagination.itemsPerPage;
    this.displayedTransactions = this.filteredTransactions.slice(startIndex, endIndex);
    this.updateSelectAllState();
    this.cdr.detectChanges();
  }
  private updateDisplayedSeatLogs(): void {
    const startIndex = (this.seatLogsPagination.currentPage - 1) * this.seatLogsPagination.itemsPerPage;
    const endIndex = startIndex + this.seatLogsPagination.itemsPerPage;
    this.displayedSeatLogs = this.filteredSeatLogs.slice(startIndex, endIndex);
    this.cdr.detectChanges();
  }
  sortBy(field: string): void {
    if (this.sortConfig.field === field) {
      this.sortConfig.direction = this.sortConfig.direction === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortConfig.field = field;
      this.sortConfig.direction = 'desc';
    }
    this.pagination.currentPage = 1;
    this.applyFiltersAndSearch();
  }
  sortSeatLogsBy(field: string): void {
    if (this.seatLogsSortConfig.field === field) {
      this.seatLogsSortConfig.direction = this.seatLogsSortConfig.direction === 'asc' ? 'desc' : 'asc';
    } else {
      this.seatLogsSortConfig.field = field;
      this.seatLogsSortConfig.direction = 'desc';
    }
    this.seatLogsPagination.currentPage = 1;
    this.applySeatLogsFiltersAndSearch();
  }
  getSortIcon(field: string): string {
    if (this.sortConfig.field !== field) return 'sort';
    return this.sortConfig.direction === 'asc' ? 'sort-up' : 'sort-down';
  }
  getSeatLogsSortIcon(field: string): string {
    if (this.seatLogsSortConfig.field !== field) return 'sort';
    return this.seatLogsSortConfig.direction === 'asc' ? 'sort-up' : 'sort-down';
  }
  changePage(page: number): void {
    if (page >= 1 && page <= this.pagination.totalPages) {
      this.pagination.currentPage = page;
      this.updateDisplayedTransactions();
    }
  }
  changeSeatLogsPage(page: number): void {
    if (page >= 1 && page <= this.seatLogsPagination.totalPages) {
      this.seatLogsPagination.currentPage = page;
      this.updateDisplayedSeatLogs();
    }
  }
  changeItemsPerPage(itemsPerPage: number): void {
    this.pagination.itemsPerPage = itemsPerPage;
    this.pagination.currentPage = 1;
    this.updateDisplayedTransactions();
  }
  changeSeatLogsItemsPerPage(itemsPerPage: number): void {
    this.seatLogsPagination.itemsPerPage = itemsPerPage;
    this.seatLogsPagination.currentPage = 1;
    this.updateDisplayedSeatLogs();
  }
  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    const current = this.pagination.currentPage;
    const total = this.pagination.totalPages;
    if (total <= maxVisible) {
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
    } else {
      if (current <= 3) {
        for (let i = 1; i <= Math.min(maxVisible, total); i++) {
          pages.push(i);
        }
      } else if (current >= total - 2) {
        for (let i = Math.max(1, total - maxVisible + 1); i <= total; i++) {
          pages.push(i);
        }
      } else {
        for (let i = current - 2; i <= current + 2; i++) {
          pages.push(i);
        }
      }
    }
    return pages;
  }
  getSeatLogsPageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    const current = this.seatLogsPagination.currentPage;
    const total = this.seatLogsPagination.totalPages;
    if (total <= maxVisible) {
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
    } else {
      if (current <= 3) {
        for (let i = 1; i <= Math.min(maxVisible, total); i++) {
          pages.push(i);
        }
      } else if (current >= total - 2) {
        for (let i = Math.max(1, total - maxVisible + 1); i <= total; i++) {
          pages.push(i);
        }
      } else {
        for (let i = current - 2; i <= current + 2; i++) {
          pages.push(i);
        }
      }
    }
    return pages;
  }
  getTransactionCountByStatus(status: 0 | 1 | 2 | 3): number {
    if (status === 0) return this.allTransactions.length;
    return this.allTransactions.filter(t => t.Status === status).length;
  }
  getFilteredCountByStatus(status: 0 | 1 | 2 | 3): number {
    if (status === 0) return this.filteredTransactions.length;
    return this.filteredTransactions.filter(t => t.Status === status).length;
  }
  approveTransaction(transactionId: string): void {
    this.confirmationData = {
      title: 'ยืนยันการอนุมัติ',
      message: `คุณต้องการอนุมัติการชำระเงินสำหรับรายการ #${transactionId} หรือไม่?`,
      confirmText: 'อนุมัติ',
      cancelText: 'ยกเลิก',
      action: 'approve',
      confirmationType: 'confirm',
      transactionId
    };
    this.showConfirmation = true;
    this.cdr.detectChanges();
  }
  cancelTransaction(transactionId: string): void {
    this.confirmationData = {
      title: 'ยืนยันการยกเลิก',
      message: `คุณต้องการยกเลิกการจองรายการ #${transactionId} หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้`,
      confirmText: 'ยกเลิก',
      cancelText: 'ไม่ยกเลิก',
      action: 'cancel',
      confirmationType: 'danger',
      transactionId
    };
    this.showConfirmation = true;
    this.cdr.detectChanges();
  }
  onConfirmationConfirmed(): void {
    this.isProcessing = true;
    switch (this.confirmationData.action) {
      case 'approve':
        if (this.confirmationData.transactionId) {
          this.executeApprove(this.confirmationData.transactionId);
        }
        break;
      case 'cancel':
        if (this.confirmationData.transactionId) {
          this.executeCancel(this.confirmationData.transactionId);
        }
        break;
      case 'bulk-approve':
        this.executeBulkApprove(this.confirmationData.additionalData?.transactionIds);
        break;
      case 'bulk-cancel':
        this.executeBulkCancel(this.confirmationData.additionalData?.transactionIds);
        break;
      case 'refresh':
        this.refreshAllData();
        this.isProcessing = null;
        break;
      case 'clear-data':
        this.clearAllData();
        this.isProcessing = null;
        break;
      case 'export-data':
        this.exportData(this.confirmationData.additionalData?.tab);
        this.isProcessing = null;
        break;
    }
    this.showConfirmation = false;
    this.cdr.detectChanges();
  }
  onConfirmationCancelled(): void {
    this.showConfirmation = false;
    this.isProcessing = null;
  }
  toggleSelectAll(): void {
    const allSelected = this.displayedTransactions.length > 0 && this.displayedTransactions.every(t => this.isTransactionSelected(t.transactionId));
    if (allSelected) {
      this.selectedTransactionIds.clear();
    } else {
      this.displayedTransactions.forEach(t => this.selectedTransactionIds.add(t.transactionId));
    }
    this.updateSelectAllState();
    this.updateBulkActionsVisibility();
  }
  toggleTransactionSelection(transactionId: string): void {
    if (this.isTransactionSelected(transactionId)) {
      this.selectedTransactionIds.delete(transactionId);
    } else {
      this.selectedTransactionIds.add(transactionId);
    }
    this.updateSelectAllState();
    this.updateBulkActionsVisibility();
  }
  isTransactionSelected(transactionId: string): boolean {
    return this.selectedTransactionIds.has(transactionId);
  }
  private updateSelectAllState(): void {
    const displayedIds = this.displayedTransactions.map(t => t.transactionId);
    this.selectAllTransactions = displayedIds.length > 0 &&
      displayedIds.every(id => this.selectedTransactionIds.has(id));
  }
  private updateBulkActionsVisibility(): void {
    this.showBulkActions = this.selectedTransactionIds.size > 0;
  }
  getSelectedTransactionsCount(): number {
    return this.selectedTransactionIds.size;
  }
  clearSelection(): void {
    this.selectedTransactionIds.clear();
    this.selectAllTransactions = false;
    this.showBulkActions = false;
    this.cdr.detectChanges();
  }
  bulkApproveTransactions(): void {
    const selectedIds = Array.from(this.selectedTransactionIds);
    const eligibleIds = selectedIds.filter(id => {
      const transaction = this.allTransactions.find(t => t.transactionId === id);
      return transaction?.Status === 2;
    });
    if (eligibleIds.length === 0) {
      this.toastService.warning('ไม่พบรายการที่สามารถอนุมัติได้', 'กรุณาเลือกรายการที่มีสถานะ "รอตรวจสอบ"');
      return;
    }
    this.confirmationData = {
      title: 'ยืนยันการอนุมัติแบบเป็นกลุ่ม',
      message: `คุณต้องการอนุมัติ ${eligibleIds.length} รายการที่เลือกหรือไม่?`,
      confirmText: 'อนุมัติทั้งหมด',
      cancelText: 'ยกเลิก',
      action: 'bulk-approve',
      confirmationType: 'confirm',
      additionalData: { transactionIds: eligibleIds }
    };
    this.showConfirmation = true;
    this.cdr.detectChanges();
  }
  bulkCancelTransactions(): void {
    const selectedIds = Array.from(this.selectedTransactionIds);
    this.confirmationData = {
      title: 'ยืนยันการยกเลิกแบบเป็นกลุ่ม',
      message: `คุณต้องการยกเลิก ${selectedIds.length} รายการที่เลือกหรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้`,
      confirmText: 'ยกเลิกทั้งหมด',
      cancelText: 'ไม่ยกเลิก',
      action: 'bulk-cancel',
      confirmationType: 'danger',
      additionalData: { transactionIds: selectedIds }
    };
    this.showConfirmation = true;
    this.cdr.detectChanges();
  }
  private executeApprove(transactionId: string): void {
    this.isProcessing = transactionId;
    this.cdr.detectChanges();
    this.createRetryableRequest(
      () => this.adminService.approveTransaction({ transactionId }),
      'approveTransaction'
    )
      .pipe(
        finalize(() => {
          this.isProcessing = null;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (response) => {
          if (response.status === 'success') {
            this.toastService.success('อนุมัติสำเร็จ', response.message);
            this.loadTransactions();
          } else {
            this.toastService.error('อนุมัติไม่สำเร็จ', response.message);
          }
        },
        error: (error) => {
          this.toastService.error('เกิดข้อผิดพลาด', error.message || 'ไม่สามารถอนุมัติการชำระได้');
        }
      });
  }
  private executeCancel(transactionId: string): void {
    this.isProcessing = transactionId;
    this.cdr.detectChanges();
    this.createRetryableRequest(
      () => this.adminService.cancelTransaction({ transactionId }),
      'cancelTransaction'
    )
      .pipe(
        finalize(() => {
          this.isProcessing = null;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (response) => {
          if (response.status === 'success') {
            this.toastService.success('ยกเลิกสำเร็จ', response.message);
            this.loadTransactions();
          } else {
            this.toastService.error('ยกเลิกไม่สำเร็จ', response.message);
          }
        },
        error: (error) => {
          this.toastService.error('เกิดข้อผิดพลาด', error.message || 'ไม่สามารถยกเลิกการจองได้');
        }
      });
  }
  private executeBulkApprove(transactionIds: string[]): void {
    if (!transactionIds || transactionIds.length === 0) {
      this.isProcessing = null;
      return;
    }
    const approveRequests = transactionIds.map(id =>
      this.createRetryableRequest(
        () => this.adminService.approveTransaction({ transactionId: id }),
        `bulkApprove_${id}`
      )
    );
    forkJoin(approveRequests)
      .pipe(
        finalize(() => {
          this.isProcessing = null;
          this.clearSelection();
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (responses) => {
          const successCount = responses.filter(r => r.status === 'success').length;
          const failCount = responses.length - successCount;
          if (successCount > 0) {
            this.toastService.success('อนุมัติสำเร็จ', `อนุมัติ ${successCount} รายการสำเร็จ`);
          }
          if (failCount > 0) {
            this.toastService.warning('อนุมัติบางรายการไม่สำเร็จ', `${failCount} รายการไม่สามารถอนุมัติได้`);
          }
          this.loadTransactions();
        },
        error: (error) => {
          this.toastService.error('เกิดข้อผิดพลาด', 'ไม่สามารถอนุมัติแบบเป็นกลุ่มได้');
        }
      });
  }
  private executeBulkCancel(transactionIds: string[]): void {
    if (!transactionIds || transactionIds.length === 0) {
      this.isProcessing = null;
      return;
    }
    const cancelRequests = transactionIds.map(id =>
      this.createRetryableRequest(
        () => this.adminService.cancelTransaction({ transactionId: id }),
        `bulkCancel_${id}`
      )
    );
    forkJoin(cancelRequests)
      .pipe(
        finalize(() => {
          this.isProcessing = null;
          this.clearSelection();
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (responses) => {
          const successCount = responses.filter(r => r.status === 'success').length;
          const failCount = responses.length - successCount;
          if (successCount > 0) {
            this.toastService.success('ยกเลิกสำเร็จ', `ยกเลิก ${successCount} รายการสำเร็จ`);
          }
          if (failCount > 0) {
            this.toastService.warning('ยกเลิกบางรายการไม่สำเร็จ', `${failCount} รายการไม่สามารถยกเลิกได้`);
          }
          this.loadTransactions();
        },
        error: (error) => {
          this.toastService.error('เกิดข้อผิดพลาด', 'ไม่สามารถยกเลิกแบบเป็นกลุ่มได้');
        }
      });
  }
  private clearAllData(): void {
    this.clearFilters();
    this.clearSeatLogsFilters();
    this.expandedGroups = { inner: false, middle: false, outer: false };
    this.selectedStatusFilter = 0;
    this.activeTab = 'overview';
    this.toastService.success('ล้างข้อมูลสำเร็จ', 'ข้อมูลทั้งหมดได้รับการรีเซ็ตแล้ว');
  }
  private exportData(tab: string): void {
    try {
      let csvContent = '';
      let filename = '';
      switch (tab) {
        case 'transactions':
          csvContent = this.generateTransactionsCsv();
          filename = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
          break;
        case 'seat-logs':
          csvContent = this.generateSeatLogsCsv();
          filename = `seat_logs_${new Date().toISOString().split('T')[0]}.csv`;
          break;
        case 'overview':
          csvContent = this.generateZoneStatsCsv();
          filename = `zone_stats_${new Date().toISOString().split('T')[0]}.csv`;
          break;
        default:
          this.toastService.error('เกิดข้อผิดพลาด', 'ไม่สามารถส่งออกข้อมูลได้');
          return;
      }
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.toastService.success('ส่งออกสำเร็จ', `ไฟล์ ${filename} ถูกดาวน์โหลดแล้ว`);
    } catch (error) {
      this.toastService.error('เกิดข้อผิดพลาด', 'ไม่สามารถส่งออกข้อมูลได้');
    }
  }
  private generateTransactionsCsv(): string {
    const headers = ['Transaction ID', 'ชื่อ-นามสกุล', 'อีเมล', 'เบอร์โทร', 'จำนวนเงิน', 'จำนวนที่นั่ง', 'สถานะ', 'วันที่'];
    const rows = this.filteredTransactions.map(t => [
      t.transactionId,
      `${t.FirstName} ${t.LastName}`,
      t.Email,
      t.Phone,
      t.TotalAmount,
      t.seats_data.length,
      this.getStatusText(t.Status),
      this.formatDate(t.CreatedAt)
    ]);
    return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  }
  private generateSeatLogsCsv(): string {
    const headers = ['Log ID', 'ผู้ดำเนินการ', 'การกระทำ', 'จำนวนที่นั่ง', 'เวลา', 'Admin'];
    const rows = this.filteredSeatLogs.map(log => [
      log.logId,
      `${log.firstName} ${log.lastName}`,
      this.getActionTypeText(log.message),
      log.seats_data.length,
      this.formatDate(log.At),
      log.isAdmin ? 'Yes' : 'No'
    ]);
    return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  }
  private generateZoneStatsCsv(): string {
    const headers = ['โซน', 'ที่นั่งทั้งหมด', 'ที่นั่งว่าง', 'ที่นั่งจอง', 'อัตราการจอง (%)'];
    const rows = this.zoneStats.map(zone => [
      zone.ZONE,
      zone.Max,
      zone.Available,
      zone.Max - zone.Available,
      this.getOccupancyPercentage(zone)
    ]);
    return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  }
  openImageModal(imageUrl: string): void {
    this.selectedImageUrl = imageUrl;
    this.showImageModal = true;
    this.cdr.detectChanges();
  }
  closeImageModal(): void {
    this.showImageModal = false;
    this.selectedImageUrl = '';
    this.cdr.detectChanges();
  }
  openSeatLogDetails(log: SeatLog): void {
    this.selectedSeatLog = log;
    this.showSeatLogDetailsModal = true;
    this.cdr.detectChanges();
  }
  closeSeatLogDetails(): void {
    this.showSeatLogDetailsModal = false;
    this.selectedSeatLog = null;
    this.cdr.detectChanges();
  }
  getZoneType(zoneName: string): 'inner' | 'middle' | 'outer' {
    return this.zoneTypeMap[zoneName] || 'outer';
  }
  getOccupancyPercentage(zone: ZoneStat): number {
    if (zone.Max === 0) return 0;
    return Math.round(((zone.Max - zone.Available) / zone.Max) * 100);
  }
  getStatusText(status: 1 | 2 | 3): string {
    switch (status) {
      case 1: return 'ยังไม่ชำระเงิน';
      case 2: return 'รอตรวจสอบ';
      case 3: return 'ชำระสำเร็จ';
      default: return 'ไม่ทราบสถานะ';
    }
  }
  getActionTypeText(message: string): string {
    if (message.includes('Approved')) return 'อนุมัติ';
    if (message.includes('Canceled')) return 'ยกเลิก';
    if (message.includes('Created')) return 'สร้าง';
    if (message.includes('Updated')) return 'แก้ไข';
    return 'อื่นๆ';
  }
  getActionTypeClass(message: string): string {
    if (message.includes('Approved')) return 'approved';
    if (message.includes('Canceled')) return 'canceled';
    if (message.includes('Created')) return 'created';
    if (message.includes('Updated')) return 'updated';
    return 'other';
  }
  formatPrice(price: number): string {
    return price.toLocaleString('th-TH') + ' บาท';
  }
  formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return dateString;
    }
  }
  trackByZone(index: number, zone: ZoneStat): string {
    return zone.ZONE;
  }
  trackByFilter(index: number, filter: StatusFilter): number {
    return filter.status;
  }
  trackByTransaction(index: number, transaction: AdminTransaction): string {
    return transaction.transactionId;
  }
  trackBySeatLog(index: number, log: SeatLog): number {
    return log.logId;
  }
  trackBySeat(index: number, seat: any): string {
    return `${seat.zone}-${seat.row}-${seat.column}`;
  }
  getTotalSeats(): number {
    return this.zoneStats.reduce((total, zone) => total + zone.Max, 0);
  }
  getTotalAvailable(): number {
    return this.zoneStats.reduce((total, zone) => total + zone.Available, 0);
  }
  getTotalOccupied(): number {
    return this.getTotalSeats() - this.getTotalAvailable();
  }
  getOverallOccupancyRate(): number {
    const total = this.getTotalSeats();
    if (total === 0) return 0;
    return Math.round((this.getTotalOccupied() / total) * 100);
  }
  getInnerZones(): ZoneStat[] {
    return this.zoneStats.filter(zone => this.getZoneType(zone.ZONE) === 'inner');
  }
  getMiddleZones(): ZoneStat[] {
    return this.zoneStats.filter(zone => this.getZoneType(zone.ZONE) === 'middle');
  }
  getOuterZones(): ZoneStat[] {
    return this.zoneStats.filter(zone => this.getZoneType(zone.ZONE) === 'outer');
  }
  getGroupTotal(groupType: 'inner' | 'middle' | 'outer'): number {
    let zones: ZoneStat[];
    switch (groupType) {
      case 'inner': zones = this.getInnerZones(); break;
      case 'middle': zones = this.getMiddleZones(); break;
      case 'outer': zones = this.getOuterZones(); break;
    }
    return zones.reduce((total, zone) => total + zone.Max, 0);
  }
  getGroupAvailable(groupType: 'inner' | 'middle' | 'outer'): number {
    let zones: ZoneStat[];
    switch (groupType) {
      case 'inner': zones = this.getInnerZones(); break;
      case 'middle': zones = this.getMiddleZones(); break;
      case 'outer': zones = this.getOuterZones(); break;
    }
    return zones.reduce((total, zone) => total + zone.Available, 0);
  }
  getGroupOccupancyRate(groupType: 'inner' | 'middle' | 'outer'): number {
    const total = this.getGroupTotal(groupType);
    const available = this.getGroupAvailable(groupType);
    if (total === 0) return 0;
    return Math.round(((total - available) / total) * 100);
  }
  toggleZoneGroup(groupType: 'inner' | 'middle' | 'outer'): void {
    this.expandedGroups[groupType] = !this.expandedGroups[groupType];
    this.cdr.detectChanges();
  }
  openZoneDetails(zone: ZoneStat): void {
    this.selectedZone = zone;
    this.showZoneDetailsModal = true;
    this.cdr.detectChanges();
  }
  closeZoneDetails(): void {
    this.showZoneDetailsModal = false;
    this.selectedZone = null;
    this.cdr.detectChanges();
  }
  openTransactionDetails(transaction: AdminTransaction): void {
    this.selectedTransaction = transaction;
    this.showTransactionDetailsModal = true;
    this.cdr.detectChanges();
  }
  closeTransactionDetails(): void {
    this.showTransactionDetailsModal = false;
    this.selectedTransaction = null;
    this.cdr.detectChanges();
  }
  getNormalZonesCount(): number {
    return this.zoneStats.filter(zone => {
      const percentage = this.getOccupancyPercentage(zone);
      return percentage <= 70;
    }).length;
  }
  getWarningZonesCount(): number {
    return this.zoneStats.filter(zone => {
      const percentage = this.getOccupancyPercentage(zone);
      return percentage > 70 && percentage <= 90;
    }).length;
  }
  getCriticalZonesCount(): number {
    return this.zoneStats.filter(zone => {
      const percentage = this.getOccupancyPercentage(zone);
      return percentage > 90;
    }).length;
  }
  getNormalArcLength(): number {
    const total = this.zoneStats.length;
    if (total === 0) return 0;
    const circumference = 2 * Math.PI * 80;
    return (this.getNormalZonesCount() / total) * circumference;
  }
  getWarningArcLength(): number {
    const total = this.zoneStats.length;
    if (total === 0) return 0;
    const circumference = 2 * Math.PI * 80;
    return (this.getWarningZonesCount() / total) * circumference;
  }
  getCriticalArcLength(): number {
    const total = this.zoneStats.length;
    if (total === 0) return 0;
    const circumference = 2 * Math.PI * 80;
    return (this.getCriticalZonesCount() / total) * circumference;
  }
  showNormalZones(): void {
    const normalZones = this.zoneStats.filter(zone => {
      const percentage = this.getOccupancyPercentage(zone);
      return percentage <= 70;
    });
    if (normalZones.length > 0) {
      this.toastService.info('โซนปกติ', `มี ${normalZones.length} โซนที่อัตราการจอง 0-70%`);
    }
  }
  showWarningZones(): void {
    const warningZones = this.zoneStats.filter(zone => {
      const percentage = this.getOccupancyPercentage(zone);
      return percentage > 70 && percentage <= 90;
    });
    if (warningZones.length > 0) {
      const zoneNames = warningZones.slice(0, 5).map(z => z.ZONE).join(', ');
      const extra = warningZones.length > 5 ? ` และอีก ${warningZones.length - 5} โซน` : '';
      this.toastService.warning('โซนเริ่มเต็ม', `${zoneNames}${extra} (71-90%)`);
    }
  }
  showCriticalZones(): void {
    const criticalZones = this.zoneStats.filter(zone => {
      const percentage = this.getOccupancyPercentage(zone);
      return percentage > 90;
    });
    if (criticalZones.length > 0) {
      const zoneNames = criticalZones.slice(0, 5).map(z => z.ZONE).join(', ');
      const extra = criticalZones.length > 5 ? ` และอีก ${criticalZones.length - 5} โซน` : '';
      this.toastService.error('โซนเกือบเต็ม', `${zoneNames}${extra} (91-100%)`);
    }
  }
  getPaginationStartIndex(): number {
    return (this.pagination.currentPage - 1) * this.pagination.itemsPerPage + 1;
  }
  getPaginationEndIndex(): number {
    return Math.min(this.pagination.currentPage * this.pagination.itemsPerPage, this.pagination.totalItems);
  }
  getSeatLogsPaginationStartIndex(): number {
    return (this.seatLogsPagination.currentPage - 1) * this.seatLogsPagination.itemsPerPage + 1;
  }
  getSeatLogsPaginationEndIndex(): number {
    return Math.min(this.seatLogsPagination.currentPage * this.seatLogsPagination.itemsPerPage, this.seatLogsPagination.totalItems);
  }
}