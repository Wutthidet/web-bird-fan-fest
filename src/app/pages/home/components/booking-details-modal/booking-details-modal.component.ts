import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, OnInit, OnDestroy, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ConfirmationModalComponent } from '../../../../shared/components/confirmation/confirmation.component';
import { BookingTransaction, BookingTransactionSeat } from '../../../../services/transaction.service';
import { AuthService } from '../../../../services/auth.service';

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

interface TaxInvoiceForm {
  Tax_need: boolean;
  InName: 'Personal' | 'Company';
  Tax_Name: string;
  Tax_Identification_No: string;
  Tax_Address: string;
  Tax_Email: string;
  Notes: string;
  useExistingData: boolean;
}

type ModalData = BookingResult | BookingTransaction;
type ModalMode = 'result' | 'details';

@Component({
  selector: 'app-booking-details-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmationModalComponent],
  templateUrl: './booking-details-modal.component.html',
  styleUrls: ['./booking-details-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BookingDetailsModalComponent implements OnInit, OnDestroy, OnChanges {
  private readonly destroy$ = new Subject<void>();

  @Input() show = false;
  @Input() mode: ModalMode | null = null;
  @Input() data: ModalData | null = null;
  @Input() uploadedImages = new Map<string, string>();
  @Input() isUploading: string | null = null;
  @Input() isProcessing: string | null = null;
  @Input() dragover: string | null = null;
  @Input() showCancelConfirmation = false;
  @Input() pendingCancelTransactionId: string | null = null;

  @Output() close = new EventEmitter<void>();
  @Output() fileUpload = new EventEmitter<{ file: File; transactionId: string }>();
  @Output() removeImage = new EventEmitter<{ event: Event; transactionId: string }>();
  @Output() payTransaction = new EventEmitter<any>();
  @Output() cancelTransaction = new EventEmitter<string>();
  @Output() cancelConfirmed = new EventEmitter<void>();
  @Output() cancelCancelled = new EventEmitter<void>();

  showImageViewer = false;
  viewerImageUrl = '';
  viewerImageLabel = '';
  showTaxInfoModal = false;

  taxInvoiceForm: TaxInvoiceForm = {
    Tax_need: false,
    InName: 'Personal',
    Tax_Name: '',
    Tax_Identification_No: '',
    Tax_Address: '',
    Tax_Email: '',
    Notes: '',
    useExistingData: false
  };

  constructor(private authService: AuthService) { }

  ngOnInit(): void {
    this.loadUserDataIfNeeded();
  }

  ngOnChanges(): void {
    console.log('Modal data:', this.data);
    console.log('Modal mode:', this.mode);
    console.log('Seats data:', this.getModalSeatsData());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onCloseModal(): void {
    this.close.emit();
  }

  onDragOver(event: DragEvent, transactionId: string): void {
    event.preventDefault();
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
  }

  onDrop(event: DragEvent, transactionId: string): void {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.fileUpload.emit({ file: files[0], transactionId });
    }
  }

  selectFile(transactionId: string): void {
    const fileInput = document.getElementById(`file-input-${transactionId}`) as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  onFileSelected(event: Event, transactionId: string): void {
    const target = event.target as HTMLInputElement;
    const files = target.files;
    if (files && files.length > 0) {
      this.fileUpload.emit({ file: files[0], transactionId });
    }
  }

  onRemoveUploadedImage(event: Event, transactionId: string): void {
    this.removeImage.emit({ event, transactionId });
  }

  onPayTransaction(transactionId: string): void {
    const paymentData = {
      transactionId,
      billUrl: this.getUploadedImage(transactionId),
      Tax_need: this.taxInvoiceForm.Tax_need,
      InName: this.taxInvoiceForm.Tax_need ? this.taxInvoiceForm.InName : null,
      Tax_Name: this.taxInvoiceForm.Tax_need ? this.taxInvoiceForm.Tax_Name : null,
      Tax_Identification_No: this.taxInvoiceForm.Tax_need ? this.taxInvoiceForm.Tax_Identification_No : null,
      Tax_Address: this.taxInvoiceForm.Tax_need ? this.taxInvoiceForm.Tax_Address : null,
      Tax_Email: this.taxInvoiceForm.Tax_need ? this.taxInvoiceForm.Tax_Email : null,
      Notes: this.taxInvoiceForm.Tax_need ? this.taxInvoiceForm.Notes : null
    };
    this.payTransaction.emit(paymentData);
  }

  onCancelTransaction(transactionId: string): void {
    this.cancelTransaction.emit(transactionId);
  }

  onCancelConfirmed(): void {
    this.cancelConfirmed.emit();
  }

  onCancelCancelled(): void {
    this.cancelCancelled.emit();
  }

  onTaxNeedChange(): void {
    if (this.taxInvoiceForm.Tax_need && this.taxInvoiceForm.useExistingData) {
      this.loadUserDataToForm();
    }
  }

  onUseExistingDataChange(): void {
    if (this.taxInvoiceForm.useExistingData) {
      this.taxInvoiceForm.InName = 'Personal';
      this.loadUserDataToForm();
    } else {
      this.clearTaxForm();
    }
  }

  onInNameChange(): void {
    if (this.taxInvoiceForm.useExistingData && this.taxInvoiceForm.InName === 'Company') {
      this.taxInvoiceForm.InName = 'Personal';
    }
    if (this.taxInvoiceForm.useExistingData) {
      this.loadUserDataToForm();
    }
  }

  openImageViewer(imageUrl: string, imageLabel: string): void {
    this.viewerImageUrl = imageUrl;
    this.viewerImageLabel = imageLabel;
    this.showImageViewer = true;
  }

  closeImageViewer(): void {
    this.showImageViewer = false;
    this.viewerImageUrl = '';
    this.viewerImageLabel = '';
  }

  hasTaxData(): boolean {
    const transaction = this.data as BookingTransaction;
    return !!(transaction?.TaxInName || transaction?.TaxIDNo || transaction?.TaxAddress || transaction?.TaxMail);
  }

  showTaxInfo(): void {
    this.showTaxInfoModal = true;
  }

  closeTaxInfo(): void {
    this.showTaxInfoModal = false;
  }

  formatPrice(price: number): string {
    return price.toLocaleString('th-TH') + ' บาท';
  }

  getStatusText(status: 1 | 2 | 3 | undefined): string {
    switch (status) {
      case 1: return 'ยังไม่ชำระเงิน';
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

  getUploadedImage(transactionId: string): string | undefined {
    return this.uploadedImages.get(transactionId);
  }

  getUploadedImagePreview(transactionId: string): string | undefined {
    const base64 = this.uploadedImages.get(transactionId);
    if (base64 && base64.startsWith('data:image/')) {
      return base64;
    }
    return undefined;
  }

  isResultMode = (): boolean => this.mode === 'result';
  isDetailsMode = (): boolean => this.mode === 'details';
  isResultSuccess = (): boolean => this.isResultMode() && (this.data as BookingResult)?.success;

  showPaymentCard = (): boolean => {
    if (!this.data) return false;
    if (this.isResultSuccess()) return true;
    if (this.isDetailsMode() && (this.data as BookingTransaction).Status === 1) return true;
    return false;
  };

  showTaxInvoiceCard = (): boolean => {
    return this.showPaymentCard() && this.taxInvoiceForm.Tax_need;
  };

  shouldShowAttachedImages = (): boolean => {
    if (!this.isDetailsMode() || !this.data) return false;
    const status = (this.data as BookingTransaction).Status;
    return status === 2 || status === 3;
  };

  getModalTransactionId = (): string | undefined => this.data?.transactionId;
  getModalStatus = (): 1 | 2 | 3 | undefined => (this.data as BookingTransaction)?.Status;
  getModalZone = (): string | undefined => (this.data as BookingResult)?.zone;
  getModalTotalAmount = (): number | undefined => (this.data as BookingResult)?.totalPrice ?? (this.data as BookingTransaction)?.totalAmount;
  getModalMessage = (): string | undefined => (this.data as BookingResult)?.message;
  getModalBookedSeats = (): BookedSeatInfo[] | undefined => (this.data as BookingResult)?.bookedSeats;
  getModalFailedSeats = (): FailedSeatInfo[] | undefined => (this.data as BookingResult)?.failedSeats;
  getModalSeatsData = (): BookingTransactionSeat[] | undefined => {
    if (this.isDetailsMode() && this.data) {
      return (this.data as BookingTransaction)?.seats_data;
    }
    return undefined;
  };
  getModalBillURL = (): string | undefined => (this.data as BookingTransaction)?.BillURL;
  getModalBackURL1 = (): string | undefined => (this.data as BookingTransaction)?.BackURL1;
  getModalBackURL2 = (): string | undefined => (this.data as BookingTransaction)?.BackURL2;
  getModalTaxInName = (): string | null => (this.data as BookingTransaction)?.TaxInName || null;
  getModalTaxIDNo = (): string | null => (this.data as BookingTransaction)?.TaxIDNo || null;
  getModalTaxAddress = (): string | null => (this.data as BookingTransaction)?.TaxAddress || null;
  getModalTaxMail = (): string | null => (this.data as BookingTransaction)?.TaxMail || null;

  getAttachedImages(): Array<{ url?: string; label: string }> {
    return [
      { url: this.getModalBillURL(), label: 'สลิปการโอนเงิน' },
      { url: this.getModalBackURL1(), label: 'รูปภาพที่ 1' },
      { url: this.getModalBackURL2(), label: 'รูปภาพที่ 2' }
    ];
  }

  trackByBookedSeat(index: number, seat: BookedSeatInfo): string {
    return `${seat.row}-${seat.display}`;
  }

  trackByFailedSeat(index: number, seat: FailedSeatInfo): number {
    return seat.id;
  }

  trackByBookingSeat(index: number, seat: BookingTransactionSeat): string {
    return `${seat.zone}-${seat.row}-${seat.column}`;
  }

  trackByImage(index: number, image: { url?: string; label: string }): string {
    return `${index}-${image.label}`;
  }

  private loadUserDataIfNeeded(): void {
    if (this.taxInvoiceForm.useExistingData) {
      this.loadUserDataToForm();
    }
  }

  private loadUserDataToForm(): void {
    this.authService.getUser()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.status === 'success') {
            const userData = response.data;
            this.taxInvoiceForm.Tax_Name = `${userData.FirstName} ${userData.LastName}`;
            this.taxInvoiceForm.Tax_Identification_No = userData.IdenNumber;
            this.taxInvoiceForm.Tax_Address = userData.Addr;
            this.taxInvoiceForm.Tax_Email = userData.Email;
          }
        },
        error: (error) => {
          console.error('Failed to load user data:', error);
        }
      });
  }

  private clearTaxForm(): void {
    this.taxInvoiceForm.Tax_Name = '';
    this.taxInvoiceForm.Tax_Identification_No = '';
    this.taxInvoiceForm.Tax_Address = '';
    this.taxInvoiceForm.Tax_Email = '';
  }
}
