import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmationModalComponent } from '../../../../shared/components/confirmation/confirmation.component';
import { BookingTransaction, BookingTransactionSeat } from '../../../../services/transaction.service';

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

type ModalData = BookingResult | BookingTransaction;
type ModalMode = 'result' | 'details';

@Component({
  selector: 'app-booking-details-modal',
  standalone: true,
  imports: [CommonModule, ConfirmationModalComponent],
  templateUrl: './booking-details-modal.component.html',
  styleUrls: ['./booking-details-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BookingDetailsModalComponent {
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
  @Output() payTransaction = new EventEmitter<string>();
  @Output() cancelTransaction = new EventEmitter<string>();
  @Output() cancelConfirmed = new EventEmitter<void>();
  @Output() cancelCancelled = new EventEmitter<void>();

  showImageViewer = false;
  viewerImageUrl = '';
  viewerImageLabel = '';

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
    this.payTransaction.emit(transactionId);
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

  isResultMode = (): boolean => this.mode === 'result';
  isDetailsMode = (): boolean => this.mode === 'details';
  isResultSuccess = (): boolean => this.isResultMode() && (this.data as BookingResult)?.success;

  showPaymentCard = (): boolean => {
    if (!this.data) return false;
    if (this.isResultSuccess()) return true;
    if (this.isDetailsMode() && (this.data as BookingTransaction).Status === 1) return true;
    return false;
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
  getModalSeatsData = (): BookingTransactionSeat[] | undefined => (this.data as BookingTransaction)?.seats_data;
  getModalBillURL = (): string | undefined => (this.data as BookingTransaction)?.BillURL;
  getModalBackURL1 = (): string | undefined => (this.data as BookingTransaction)?.BackURL1;
  getModalBackURL2 = (): string | undefined => (this.data as BookingTransaction)?.BackURL2;

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
}