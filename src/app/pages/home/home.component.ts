import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SeatService, Seat, BookSeatsResponse } from '../../services/seat.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { TransactionService, BookingTransaction, BookingTransactionSeat } from '../../services/transaction.service';
import { ZoneMapComponent } from './components/zone-map/zone-map.component';
import { PriceCardComponent } from './components/price-card/price-card.component';
import { BookingsCardComponent } from './components/bookings-card/bookings-card.component';
import { SeatsModalComponent } from './components/seats-modal/seats-modal.component';
import { BookingDetailsModalComponent } from './components/booking-details-modal/booking-details-modal.component';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, switchMap, finalize, tap } from 'rxjs/operators';

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
  transactionId?: string;
  message: string;
  bookedSeats?: BookedSeatInfo[];
  failedSeats?: FailedSeatInfo[];
  totalPrice?: number;
  zone?: string;
}

interface TimeRemaining {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
}

type ModalData = BookingResult | BookingTransaction;
type ModalMode = 'result' | 'details';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    ZoneMapComponent,
    PriceCardComponent,
    BookingsCardComponent,
    SeatsModalComponent,
    BookingDetailsModalComponent
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomeComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly refreshTrigger$ = new BehaviorSubject<boolean>(true);
  private readonly seatCache = new Map<string, ZoneCache>();
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  readonly uploadedImages = new Map<string, string>();

  private readonly CACHE_DURATION_MS = 30 * 1000;
  private readonly REFRESH_INTERVAL_MS = 30 * 1000;
  private readonly targetDate = new Date('2025-07-01T09:00:00+07:00');

  timeRemaining: TimeRemaining = {
    days: '00',
    hours: '00',
    minutes: '00',
    seconds: '00'
  };

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

  isUploading: string | null = null;
  isProcessing: string | null = null;
  dragover: string | null = null;

  allBookings: BookingTransaction[] = [];
  isLoadingBookings = false;
  bookingError = '';

  showCancelConfirmation = false;
  pendingCancelTransactionId: string | null = null;

  private readonly priceColorMap: { [key: number]: string } = {
    3000: '#e3362e', 3500: '#f4ef3e', 4500: '#4962a6',
    6000: '#959298', 7000: '#abd495', 8500: '#a1529b',
    9000: '#bd8332', 9500: '#216c39', 10000: '#48bae8'
  };

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
    this.startCountdown();
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

  private startCountdown(): void {
    this.updateCountdown();
    this.countdownTimer = setInterval(() => {
      this.updateCountdown();
    }, 1000);
  }

  private updateCountdown(): void {
    const now = new Date().getTime();
    const distance = this.targetDate.getTime() - now;

    if (distance > 0) {
      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      this.timeRemaining = {
        days: days.toString().padStart(2, '0'),
        hours: hours.toString().padStart(2, '0'),
        minutes: minutes.toString().padStart(2, '0'),
        seconds: seconds.toString().padStart(2, '0')
      };
    } else {
      this.timeRemaining = {
        days: '00',
        hours: '00',
        minutes: '00',
        seconds: '00'
      };
    }

    this.cdr.detectChanges();
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

    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
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

  onSeatSelectionChange(selectedSeats: Set<string>): void {
    this.selectedSeats = selectedSeats;
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
                transactionId: response.transactionId.toString(),
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

  handleFileUpload(file: File, transactionId: string): void {
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

  removeUploadedImage(event: Event, transactionId: string): void {
    event.stopPropagation();
    this.uploadedImages.delete(transactionId);
    this.cdr.detectChanges();
  }

  payTransaction(transactionId: string): void {
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

  cancelTransaction(transactionId: string): void {
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

  getAllPricesWithColors(): { price: number; color: string }[] {
    return Object.entries(this.priceColorMap)
      .map(([price, color]) => ({
        price: parseInt(price, 10),
        color: color
      }))
      .sort((a, b) => a.price - b.price);
  }

  private findSeatById(seatId: string, seatsArray: Seat[]): Seat | undefined {
    if (!seatsArray) return undefined;
    const [zone, row, columnStr] = seatId.split('-');
    const column = parseInt(columnStr, 10);
    return seatsArray.find(s => s.ZONE === zone && s.ROW === row && s.COLUMN === column);
  }

  private getDisplaySeatNumber(seat: Seat): number {
    return seat.DISPLAY ?? seat.COLUMN;
  }

  private getTotalPriceNumber(): number {
    return Array.from(this.selectedSeats).reduce((sum, seatId) => {
      const seat = this.findSeatById(seatId, this.selectedZoneSeats);
      return sum + (seat ? seat.PRICE : 0);
    }, 0);
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
}