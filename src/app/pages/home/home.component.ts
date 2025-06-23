import { Component, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SeatService, Seat, BookSeatsResponse } from '../../services/seat.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { TransactionService, UserTransaction, TransactionSeat, BookingTransaction, BookingTransactionSeat } from '../../services/transaction.service';
import { ConfirmationModalComponent } from '../../shared/components/confirmation/confirmation.component';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, switchMap, finalize, tap } from 'rxjs/operators';

interface Zone {
  id: string;
  type: 'inner' | 'middle' | 'outer';
  gridPosition?: { x: number; y: number };
}

interface ZoneCache {
  seats: Seat[];
  lastUpdated: number;
  isLoading: boolean;
  error?: string;
}

interface BookedSeatInfo {
  row: string;
  display: string;
  price: number;
}

interface FailedSeatInfo {
  id: number;
  row: string;
  column: number;
  display: string | null;
  status: 1 | 2 | 3;
}

interface BookingResult {
  success: boolean;
  transactionId?: number;
  message: string;
  bookedSeats?: BookedSeatInfo[];
  failedSeats?: FailedSeatInfo[];
  totalPrice?: number;
  zone?: string;
}

type ModalData = BookingResult | BookingTransaction;
type ModalMode = 'result' | 'details';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, ConfirmationModalComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('svgMap') svgMapRef!: ElementRef<SVGElement>;
  @ViewChild('seatTooltip') seatTooltipRef!: ElementRef<HTMLElement>;

  private readonly destroy$ = new Subject<void>();
  private readonly refreshTrigger$ = new BehaviorSubject<boolean>(true);
  private readonly seatCache = new Map<string, ZoneCache>();
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly uploadedImages = new Map<number, string>();

  private readonly CACHE_DURATION_MS = 30 * 1000;
  private readonly REFRESH_INTERVAL_MS = 30 * 1000;

  selectedZoneSeats: Seat[] = [];
  selectedSeats: Set<string> = new Set();
  currentSelectedZone: string = '';
  isLoadingSeats = false;
  showSeatsModal = false;
  seatError = '';
  isProcessingBooking = false;

  showDetailsModal = false;
  modalData: ModalData | null = null;
  modalMode: ModalMode | null = null;

  isUploading: number | null = null;
  isProcessing: number | null = null;
  dragover: number | null = null;

  allBookings: BookingTransaction[] = [];
  isLoadingBookings = false;
  bookingError = '';

  showCancelConfirmation = false;
  pendingCancelTransactionId: number | null = null;

  private readonly priceColorMap: { [key: number]: string } = {
    3000: '#e3362e', 3500: '#f4ef3e', 4500: '#4962a6',
    6000: '#959298', 7000: '#abd495', 8500: '#a1529b',
    9000: '#bd8332', 9500: '#216c39', 10000: '#48bae8'
  };

  readonly zoneData: ReadonlyArray<Zone> = [
    { id: 'A1', type: 'inner' }, { id: 'A2', type: 'inner' }, { id: 'A3', type: 'inner' }, { id: 'A4', type: 'inner' },
    { id: 'B1', type: 'inner' }, { id: 'B2', type: 'inner' }, { id: 'B3', type: 'inner' }, { id: 'B4', type: 'inner' },
    { id: 'C1', type: 'inner' }, { id: 'C2', type: 'inner' }, { id: 'C3', type: 'inner' },
    { id: 'SB', type: 'middle' }, { id: 'SC', type: 'middle' }, { id: 'SD', type: 'middle' }, { id: 'SE', type: 'middle' },
    { id: 'SF', type: 'middle' }, { id: 'SG', type: 'middle' }, { id: 'SH', type: 'middle' }, { id: 'SI', type: 'middle' },
    { id: 'SJ', type: 'middle' }, { id: 'SK', type: 'middle' }, { id: 'SL', type: 'middle' }, { id: 'SM', type: 'middle' }, { id: 'SN', type: 'middle' },
    { id: 'B', type: 'outer' }, { id: 'C', type: 'outer' }, { id: 'D', type: 'outer' }, { id: 'E', type: 'outer' },
    { id: 'F', type: 'outer' }, { id: 'G', type: 'outer' }, { id: 'H', type: 'outer' }, { id: 'I', type: 'outer' },
    { id: 'J', type: 'outer' }, { id: 'K', type: 'outer' }, { id: 'L', type: 'outer' }, { id: 'M', type: 'outer' },
    { id: 'N', type: 'outer' }, { id: 'O', type: 'outer' }, { id: 'P', type: 'outer' }, { id: 'Q', type: 'outer' },
    { id: 'R', type: 'outer' }, { id: 'S', type: 'outer' }, { id: 'T', type: 'outer' }
  ];

  constructor(
    private seatService: SeatService,
    public authService: AuthService,
    private cdr: ChangeDetectorRef,
    private toastService: ToastService,
    private transactionService: TransactionService
  ) { }

  ngOnInit() {
    this.initializeData();
    this.setupAutoRefresh();
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.positionZoneLabels();
      this.cdr.detectChanges();
    }, 100);
  }

  ngOnDestroy() {
    this.cleanup();
  }

  private initializeData(): void {
    if (this.authService.isLoggedIn()) {
      this.loadAllBookings();
    }
  }

  private setupAutoRefresh(): void {
    this.refreshTrigger$
      .pipe(
        debounceTime(500),
        distinctUntilChanged(),
        switchMap(() => {
          if (this.showSeatsModal && this.currentSelectedZone && this.authService.isLoggedIn()) {
            return this.refreshCurrentZoneData();
          }
          return [];
        }),
        takeUntil(this.destroy$)
      )
      .subscribe();

    this.refreshTimer = setInterval(() => {
      this.refreshTrigger$.next(true);
    }, this.REFRESH_INTERVAL_MS);
  }

  private refreshCurrentZoneData() {
    if (!this.currentSelectedZone) return [];
    return this.seatService.getSeats(this.currentSelectedZone)
      .pipe(
        tap(seats => {
          this.updateCache(this.currentSelectedZone, seats);
          if (this.currentSelectedZone) {
            this.selectedZoneSeats = [...seats];
            this.validateSelectedSeats();
            this.cdr.detectChanges();
          }
        }),
        takeUntil(this.destroy$)
      );
  }

  private cleanup(): void {
    this.destroy$.next();
    this.destroy$.complete();

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    this.seatCache.clear();
    this.selectedSeats.clear();
    this.uploadedImages.clear();
  }

  private isCacheValid(zoneName: string): boolean {
    const cached = this.seatCache.get(zoneName);
    return !!cached && (Date.now() - cached.lastUpdated < this.CACHE_DURATION_MS) && !cached.error;
  }

  private updateCache(zoneName: string, seats: Seat[], error?: string): void {
    this.seatCache.set(zoneName, {
      seats: error ? [] : [...seats],
      lastUpdated: Date.now(),
      isLoading: false,
      error: error
    });
  }

  private setCacheLoading(zoneName: string, isLoading: boolean): void {
    const cached = this.seatCache.get(zoneName);
    if (cached) {
      cached.isLoading = isLoading;
      if (isLoading) cached.error = undefined;
    } else if (isLoading) {
      this.seatCache.set(zoneName, {
        seats: [],
        lastUpdated: 0,
        isLoading: true
      });
    }
  }

  private positionZoneLabels(): void {
    const svg = this.svgMapRef?.nativeElement;
    if (!svg) return;

    this.zoneData.forEach(zone => {
      const path = svg.querySelector(`path[data-zone="${zone.id}"]`) as SVGPathElement;
      if (path && !svg.querySelector(`.zone-label[data-zone-id="${zone.id}"]`)) {
        try {
          const bbox = path.getBBox();
          if (bbox.width === 0 && bbox.height === 0) return;

          const centerX = bbox.x + bbox.width / 2;
          const centerY = bbox.y + bbox.height / 2;

          const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          textElement.setAttribute('x', centerX.toString());
          textElement.setAttribute('y', centerY.toString());
          textElement.setAttribute('text-anchor', 'middle');
          textElement.setAttribute('dominant-baseline', 'central');
          textElement.classList.add('zone-label', `${zone.type}-label`);
          textElement.setAttribute('data-zone-id', zone.id);
          textElement.textContent = zone.id;

          svg.appendChild(textElement);
        } catch (error) {
          console.warn(`Could not position label for zone ${zone.id}:`, error);
        }
      }
    });
  }

  onZoneClick(zoneName: string): void {
    if (!this.authService.isLoggedIn()) {
      this.toastService.warning('กรุณาดำเนินการ', 'เข้าสู่ระบบก่อนดูข้อมูลที่นั่ง');
      return;
    }
    this.loadSeatsForZone(zoneName);
  }

  loadSeatsForZone(zoneName: string, forceRefresh: boolean = false): void {
    const currentCacheEntry = this.seatCache.get(zoneName);

    if (currentCacheEntry?.isLoading && !forceRefresh) return;

    if (!forceRefresh && this.isCacheValid(zoneName) && currentCacheEntry) {
      this.selectedZoneSeats = [...currentCacheEntry.seats];
      this.currentSelectedZone = zoneName;
      this.showSeatsModal = true;
      this.seatError = '';
      this.isLoadingSeats = false;
      this.cdr.detectChanges();
      return;
    }

    this.setCacheLoading(zoneName, true);
    this.isLoadingSeats = true;
    this.seatError = '';

    if (!forceRefresh || this.currentSelectedZone !== zoneName) {
      this.selectedSeats.clear();
    }

    this.currentSelectedZone = zoneName;
    this.showSeatsModal = true;
    this.cdr.detectChanges();

    this.seatService.getSeats(zoneName)
      .pipe(
        finalize(() => {
          this.isLoadingSeats = false;
          this.cdr.detectChanges();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (seats) => {
          this.updateCache(zoneName, seats);
          if (this.currentSelectedZone === zoneName) {
            this.selectedZoneSeats = [...seats];
            if (forceRefresh) this.validateSelectedSeats();
          }
        },
        error: (error) => {
          console.error(`Error loading seats for zone ${zoneName}:`, error);
          const errorMessage = 'ไม่สามารถโหลดข้อมูลที่นั่งได้ กรุณาลองใหม่อีกครั้ง';
          this.updateCache(zoneName, [], errorMessage);

          if (this.currentSelectedZone === zoneName) {
            this.seatError = errorMessage;
            this.selectedZoneSeats = [];
          }
        }
      });
  }

  private validateSelectedSeats(): void {
    const currentSeatsMap = new Map(this.selectedZoneSeats.map(s => [`${s.ZONE}-${s.ROW}-${s.COLUMN}`, s]));
    const validSelectedSeats = new Set<string>();

    this.selectedSeats.forEach(seatId => {
      const seat = currentSeatsMap.get(seatId);
      if (seat && seat.STATUS === 0 && seat.VISIBLE === 'T') {
        validSelectedSeats.add(seatId);
      }
    });

    if (validSelectedSeats.size !== this.selectedSeats.size) {
      this.selectedSeats = validSelectedSeats;
      this.cdr.detectChanges();
    }
  }

  closeSeatsModal(): void {
    this.showSeatsModal = false;
    this.isLoadingSeats = false;
    this.seatError = '';
    this.selectedSeats.clear();
    this.cdr.detectChanges();
  }

  onSeatClick(seat: Seat): void {
    if (seat.STATUS !== 0 || seat.VISIBLE !== 'T') return;

    const seatId = `${seat.ZONE}-${seat.ROW}-${seat.COLUMN}`;
    if (this.selectedSeats.has(seatId)) {
      this.selectedSeats.delete(seatId);
    } else {
      this.selectedSeats.add(seatId);
    }
    this.cdr.detectChanges();
  }

  isSeatSelected(seat: Seat): boolean {
    const seatId = `${seat.ZONE}-${seat.ROW}-${seat.COLUMN}`;
    return this.selectedSeats.has(seatId);
  }

  getSeatStatusClass(status: 0 | 1 | 2): string {
    return this.seatService.getSeatStatusClass(status);
  }

  getSeatClassCombined(seat: Seat): string {
    return this.getSeatStatusClass(seat.STATUS);
  }

  getPriceColor(price: number): string {
    return this.priceColorMap[price] || '#718096';
  }

  getUniquePrices(): number[] {
    if (!this.selectedZoneSeats?.length) return [];
    const prices = this.selectedZoneSeats
      .filter(seat => seat.VISIBLE === 'T')
      .map(seat => seat.PRICE);
    return [...new Set(prices)].sort((a, b) => a - b);
  }

  getDisplaySeatNumber(seat: Seat): number {
    return seat.DISPLAY ?? seat.COLUMN;
  }

  getVisibleSeatsCount(): number {
    return this.selectedZoneSeats?.filter(seat => seat.VISIBLE === 'T').length || 0;
  }

  getAvailableSeatsCount(): number {
    return this.selectedZoneSeats?.filter(seat => seat.VISIBLE === 'T' && seat.STATUS === 0).length || 0;
  }

  getGroupedSeats(): { row: string; seats: Seat[] }[] {
    if (!this.selectedZoneSeats?.length) return [];

    const grouped = this.selectedZoneSeats.reduce((acc, seat) => {
      (acc[seat.ROW] = acc[seat.ROW] || []).push(seat);
      return acc;
    }, {} as { [key: string]: Seat[] });

    return Object.keys(grouped)
      .sort((a, b) => a.length !== b.length ? b.length - a.length : a.localeCompare(b))
      .map(row => ({
        row,
        seats: grouped[row].sort((sA, sB) => sA.COLUMN - sB.COLUMN)
      }));
  }

  formatPrice(price: number): string {
    return price.toLocaleString('th-TH') + ' บาท';
  }

  showSeatTooltip(event: MouseEvent, seat: Seat): void {
    const tooltipEl = this.seatTooltipRef?.nativeElement;
    if (tooltipEl && seat.VISIBLE === 'T') {
      tooltipEl.textContent = `${seat.ROW}${this.getDisplaySeatNumber(seat)} - ${this.formatPrice(seat.PRICE)}`;
      tooltipEl.style.display = 'block';
      this.updateSeatTooltipPosition(event);
    } else if (tooltipEl) {
      tooltipEl.style.display = 'none';
    }
  }

  hideSeatTooltip(): void {
    if (this.seatTooltipRef?.nativeElement) {
      this.seatTooltipRef.nativeElement.style.display = 'none';
    }
  }

  updateSeatTooltipPosition(event: MouseEvent): void {
    const tooltipEl = this.seatTooltipRef?.nativeElement;
    const seatsGrid = (event.currentTarget as HTMLElement)?.closest('.seats-grid');

    if (tooltipEl && seatsGrid) {
      const gridRect = seatsGrid.getBoundingClientRect();
      const x = event.clientX - gridRect.left + seatsGrid.scrollLeft + 15;
      const y = event.clientY - gridRect.top + seatsGrid.scrollTop - 30;

      const modalContent = tooltipEl.closest('.seat-grid-panel');
      if (modalContent) {
        const tooltipRect = tooltipEl.getBoundingClientRect();
        let constrainedX = x;
        let constrainedY = y;

        if (x + tooltipRect.width > gridRect.right - gridRect.left + seatsGrid.scrollLeft) {
          constrainedX = x - tooltipRect.width - 30;
        }
        if (y < seatsGrid.scrollTop) {
          constrainedY = y + tooltipRect.height + 30;
        } else if (y + tooltipRect.height > seatsGrid.scrollTop + seatsGrid.clientHeight) {
          constrainedY = y - tooltipRect.height - 10;
        }

        tooltipEl.style.left = `${constrainedX}px`;
        tooltipEl.style.top = `${constrainedY}px`;
      } else {
        tooltipEl.style.left = `${x}px`;
        tooltipEl.style.top = `${y}px`;
      }
    }
  }

  onSeatsGridScroll(): void {
    this.hideSeatTooltip();
  }

  private findSeatById(seatId: string, seatsArray: Seat[]): Seat | undefined {
    if (!seatsArray) return undefined;
    const [zone, row, columnStr] = seatId.split('-');
    const column = parseInt(columnStr, 10);
    return seatsArray.find(s => s.ZONE === zone && s.ROW === row && s.COLUMN === column);
  }

  getSelectedSeatDisplay(seatId: string): string {
    const seat = this.findSeatById(seatId, this.selectedZoneSeats);
    return seat ? `${seat.ROW}${this.getDisplaySeatNumber(seat)}` : seatId;
  }

  getSelectedSeatPrice(seatId: string): string {
    const seat = this.findSeatById(seatId, this.selectedZoneSeats);
    return seat ? this.formatPrice(seat.PRICE) : '0 บาท';
  }

  getTotalPrice(): string {
    const total = this.getTotalPriceNumber();
    return this.formatPrice(total);
  }

  private getTotalPriceNumber(): number {
    return Array.from(this.selectedSeats).reduce((sum, seatId) => {
      const seat = this.findSeatById(seatId, this.selectedZoneSeats);
      return sum + (seat ? seat.PRICE : 0);
    }, 0);
  }

  clearAllSelectedSeats(): void {
    this.selectedSeats.clear();
    this.cdr.detectChanges();
  }

  removeSeatFromSelection(seatId: string): void {
    this.selectedSeats.delete(seatId);
    this.cdr.detectChanges();
  }

  async proceedToBooking(): Promise<void> {
    if (this.selectedSeats.size === 0) {
      this.toastService.error('เกิดข้อผิดพลาด', 'กรุณาเลือกที่นั่งก่อนดำเนินการจอง');
      return;
    }
    if (!this.authService.isLoggedIn()) {
      this.toastService.error('เกิดข้อผิดพลาด', 'กรุณาเข้าสู่ระบบก่อนดำเนินการจอง');
      return;
    }

    this.isProcessingBooking = true;
    this.cdr.detectChanges();

    try {
      const selectedSeatsData = Array.from(this.selectedSeats)
        .map(seatId => this.findSeatById(seatId, this.selectedZoneSeats))
        .filter((seat): seat is Seat => !!seat);

      const seatIds = selectedSeatsData.map(seat => seat.ID);

      this.seatService.bookSeats(seatIds)
        .pipe(
          finalize(() => {
            this.isProcessingBooking = false;
            this.cdr.detectChanges();
          }),
          takeUntil(this.destroy$)
        )
        .subscribe({
          next: (response: BookSeatsResponse) => {
            let resultData: BookingResult;
            if (response.status === 'success' && response.transactionId) {
              resultData = {
                success: true,
                transactionId: response.transactionId,
                message: response.message,
                bookedSeats: selectedSeatsData.map(seat => ({
                  row: seat.ROW,
                  display: this.getDisplaySeatNumber(seat).toString(),
                  price: seat.PRICE
                })),
                totalPrice: this.getTotalPriceNumber(),
                zone: this.currentSelectedZone
              };
              this.toastService.success('การจองสำเร็จ!', 'ที่นั่งของคุณได้รับการจองแล้ว');
              this.selectedSeats.clear();
              this.seatService.invalidateCache(this.currentSelectedZone);
              this.transactionService.invalidateCache();

              setTimeout(() => {
                this.loadSeatsForZone(this.currentSelectedZone, true);
                this.loadAllBookings(true);
              }, 100);

            } else {
              let failedSeats: FailedSeatInfo[] | undefined = undefined;
              if (Array.isArray(response.seats_data)) {
                failedSeats = response.seats_data.map(seat => ({
                  ...seat,
                  status: (seat as any).status !== undefined ? (seat as any).status : 1
                }));
              }
              resultData = {
                success: false,
                message: response.message,
                failedSeats: failedSeats
              };
              this.toastService.error('การจองไม่สำเร็จ', 'มีที่นั่งบางส่วนถูกจองไปแล้ว');
              this.seatService.invalidateCache(this.currentSelectedZone);
              setTimeout(() => this.loadSeatsForZone(this.currentSelectedZone, true), 100);
            }
            this.openDetailsModal('result', resultData);
          },
          error: (error) => {
            console.error('Booking error:', error);
            this.toastService.error('เกิดข้อผิดพลาดในการดำเนินการจอง', 'กรุณาลองใหม่อีกครั้ง');
          }
        });

    } catch (error) {
      this.isProcessingBooking = false;
      console.error('Booking preparation error:', error);
      this.toastService.error('เกิดข้อผิดพลาดในการเตรียมข้อมูลการจอง', 'กรุณาลองใหม่อีกครั้ง');
      this.cdr.detectChanges();
    }
  }

  openDetailsModal(mode: ModalMode, data: ModalData): void {
    this.modalMode = mode;
    this.modalData = data;
    this.showDetailsModal = true;
    this.cdr.detectChanges();
  }

  closeDetailsModal(): void {
    this.showDetailsModal = false;
    this.modalData = null;
    this.modalMode = null;
    this.cdr.detectChanges();
  }

  loadAllBookings(forceRefresh: boolean = false): void {
    if (!this.authService.isLoggedIn()) return;

    this.isLoadingBookings = true;
    this.bookingError = '';
    this.cdr.detectChanges();

    this.transactionService.getAllUserBookings(forceRefresh)
      .pipe(
        finalize(() => {
          this.isLoadingBookings = false;
          this.cdr.detectChanges();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (bookings) => {
          this.allBookings = bookings;
        },
        error: (error) => {
          this.bookingError = 'ไม่สามารถโหลดข้อมูลการจองได้';
          console.error('Error loading bookings:', error);
        }
      });
  }

  getStatusText(status: 1 | 2 | 3 | undefined): string {
    switch (status) {
      case 1: return 'จองแต่ยังไม่จ่ายเงิน';
      case 2: return 'รอตรวจสอบ';
      case 3: return 'ชำระเงินสำเร็จ';
      default: return 'ไม่ทราบสถานะ';
    }
  }

  getStatusClass(status: 1 | 2 | 3 | undefined): string {
    switch (status) {
      case 1: return 'status-1';
      case 2: return 'status-2';
      case 3: return 'status-3';
      default: return '';
    }
  }

  getDisplayNumber(seat: BookingTransactionSeat): number {
    return seat.display ?? seat.column;
  }

  onDragOver(event: DragEvent, transactionId: number): void {
    event.preventDefault();
    this.dragover = transactionId;
    this.cdr.detectChanges();
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragover = null;
    this.cdr.detectChanges();
  }

  onDrop(event: DragEvent, transactionId: number): void {
    event.preventDefault();
    this.dragover = null;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFileUpload(files[0], transactionId);
    }
    this.cdr.detectChanges();
  }

  selectFile(transactionId: number): void {
    const fileInput = document.getElementById(`file-input-${transactionId}`) as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  onFileSelected(event: Event, transactionId: number): void {
    const target = event.target as HTMLInputElement;
    const files = target.files;
    if (files && files.length > 0) {
      this.handleFileUpload(files[0], transactionId);
    }
  }

  private handleFileUpload(file: File, transactionId: number): void {
    if (!this.validateFile(file)) return;

    this.isUploading = transactionId;
    this.cdr.detectChanges();

    this.transactionService.uploadImage(file)
      .pipe(
        finalize(() => {
          this.isUploading = null;
          this.cdr.detectChanges();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.uploadedImages.set(transactionId, response.data.display_url);
            this.toastService.success('อัปโหลดสำเร็จ', 'ไฟล์ถูกอัปโหลดเรียบร้อยแล้ว');
          } else {
            this.toastService.error('อัปโหลดไม่สำเร็จ', 'ไม่สามารถอัปโหลดไฟล์ได้');
          }
        },
        error: (error) => {
          this.toastService.error('อัปโหลดไม่สำเร็จ', 'เกิดข้อผิดพลาดในการอัปโหลดไฟล์');
          console.error('Upload error:', error);
        }
      });
  }

  private validateFile(file: File): boolean {
    const maxSize = 16 * 1024 * 1024;
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];

    if (file.size > maxSize) {
      this.toastService.error('ไฟล์ใหญ่เกินไป', 'ขนาดไฟล์ต้องไม่เกิน 16MB');
      return false;
    }

    if (!allowedTypes.includes(file.type)) {
      this.toastService.error('ประเภทไฟล์ไม่ถูกต้อง', 'รองรับเฉพาะไฟล์ JPG, PNG, GIF');
      return false;
    }

    return true;
  }

  getUploadedImage(transactionId: number): string | undefined {
    return this.uploadedImages.get(transactionId);
  }

  removeUploadedImage(event: Event, transactionId: number): void {
    event.stopPropagation();
    this.uploadedImages.delete(transactionId);
    this.cdr.detectChanges();
  }

  payTransaction(transactionId: number): void {
    const billUrl = this.uploadedImages.get(transactionId);
    if (!billUrl) {
      this.toastService.error('ไม่พบสลิป', 'กรุณาอัปโหลดสลิปการโอนเงินก่อน');
      return;
    }

    this.isProcessing = transactionId;
    this.cdr.detectChanges();

    this.transactionService.payTransaction({ transactionId, billUrl })
      .pipe(
        finalize(() => {
          this.isProcessing = null;
          this.cdr.detectChanges();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (response) => {
          if (response.status === 'success') {
            this.toastService.success('ชำระเงินสำเร็จ', 'การชำระเงินเสร็จสิ้นแล้ว');
            this.seatService.invalidateCache();
            this.transactionService.invalidateCache();

            setTimeout(() => {
              this.loadAllBookings(true);
              if (this.currentSelectedZone) {
                this.loadSeatsForZone(this.currentSelectedZone, true);
              }
            }, 100);

            this.closeDetailsModal();
          } else {
            this.toastService.error('ชำระเงินไม่สำเร็จ', response.message);
          }
        },
        error: (error) => {
          this.toastService.error('เกิดข้อผิดพลาด', 'ไม่สามารถดำเนินการชำระเงินได้');
          console.error('Payment error:', error);
        }
      });
  }

  cancelTransaction(transactionId: number): void {
    this.pendingCancelTransactionId = transactionId;
    this.showCancelConfirmation = true;
    this.cdr.detectChanges();
  }

  onCancelConfirmed(): void {
    if (this.pendingCancelTransactionId === null) return;

    const transactionId = this.pendingCancelTransactionId;
    this.isProcessing = transactionId;
    this.showCancelConfirmation = false;
    this.pendingCancelTransactionId = null;
    this.cdr.detectChanges();

    this.transactionService.cancelTransaction({ transactionId })
      .pipe(
        finalize(() => {
          this.isProcessing = null;
          this.cdr.detectChanges();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (response) => {
          if (response.status === 'success') {
            this.toastService.success('ยกเลิกสำเร็จ', 'การจองถูกยกเลิกแล้ว');
            this.uploadedImages.delete(transactionId);
            this.seatService.invalidateCache();
            this.transactionService.invalidateCache();

            setTimeout(() => {
              this.loadAllBookings(true);
              if (this.currentSelectedZone) {
                this.loadSeatsForZone(this.currentSelectedZone, true);
              }
            }, 100);

            this.closeDetailsModal();
          } else {
            this.toastService.error('ยกเลิกไม่สำเร็จ', response.message);
          }
        },
        error: (error) => {
          this.toastService.error('เกิดข้อผิดพลาด', 'ไม่สามารถยกเลิกการจองได้');
          console.error('Cancel error:', error);
        }
      });
  }

  onCancelCancelled(): void {
    this.showCancelConfirmation = false;
    this.pendingCancelTransactionId = null;
    this.cdr.detectChanges();
  }

  isResultMode = (): boolean => this.modalMode === 'result';
  isDetailsMode = (): boolean => this.modalMode === 'details';
  isResultSuccess = (): boolean => this.isResultMode() && (this.modalData as BookingResult)?.success;

  showPaymentCard = (): boolean => {
    if (!this.modalData) return false;
    if (this.isResultSuccess()) return true;
    if (this.isDetailsMode() && (this.modalData as BookingTransaction).Status === 1) return true;
    return false;
  }

  getModalTransactionId = (): number | undefined => this.modalData?.transactionId;
  getModalStatus = (): 1 | 2 | 3 | undefined => (this.modalData as BookingTransaction)?.Status;
  getModalZone = (): string | undefined => (this.modalData as BookingResult)?.zone;
  getModalTotalAmount = (): number | undefined => (this.modalData as BookingResult)?.totalPrice ?? (this.modalData as BookingTransaction)?.totalAmount;
  getModalMessage = (): string | undefined => (this.modalData as BookingResult)?.message;
  getModalBookedSeats = (): BookedSeatInfo[] | undefined => (this.modalData as BookingResult)?.bookedSeats;
  getModalFailedSeats = (): FailedSeatInfo[] | undefined => (this.modalData as BookingResult)?.failedSeats;
  getModalSeatsData = (): BookingTransactionSeat[] | undefined => (this.modalData as BookingTransaction)?.seats_data;

  trackBySeatId(index: number, seatId: string): string { return seatId; }
  trackByPrice(index: number, price: number): number { return price; }
  trackByRowGroup(index: number, rowGroup: { row: string }): string { return rowGroup.row; }
  trackBySeat(index: number, seat: Seat): string { return `${seat.ZONE}-${seat.ROW}-${seat.COLUMN}`; }
  trackByTransaction(index: number, transaction: UserTransaction): number { return transaction.transactionId; }
  trackBySeatInTransaction(index: number, seat: TransactionSeat): string { return `${seat.row}-${seat.column}`; }
  trackByBooking(index: number, booking: BookingTransaction): number { return booking.transactionId; }
  trackByBookingSeat(index: number, seat: BookingTransactionSeat): string { return `${seat.zone}-${seat.row}-${seat.column}`; }
  trackByBookedSeat(index: number, seat: BookedSeatInfo): string { return `${seat.row}-${seat.display}`; }
  trackByFailedSeat(index: number, seat: FailedSeatInfo): number { return seat.id; }
}