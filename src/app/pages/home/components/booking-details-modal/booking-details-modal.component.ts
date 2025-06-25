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
  @Input() uploadedImages = new Map<number, string>();
  @Input() isUploading: number | null = null;
  @Input() isProcessing: number | null = null;
  @Input() dragover: number | null = null;
  @Input() showCancelConfirmation = false;
  @Input() pendingCancelTransactionId: number | null = null;

  @Output() close = new EventEmitter<void>();
  @Output() fileUpload = new EventEmitter<{ file: File; transactionId: number }>();
  @Output() removeImage = new EventEmitter<{ event: Event; transactionId: number }>();
  @Output() payTransaction = new EventEmitter<number>();
  @Output() cancelTransaction = new EventEmitter<number>();
  @Output() cancelConfirmed = new EventEmitter<void>();
  @Output() cancelCancelled = new EventEmitter<void>();

  onCloseModal(): void {
    this.close.emit();
  }

  onDragOver(event: DragEvent, transactionId: number): void {
    event.preventDefault();
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
  }

  onDrop(event: DragEvent, transactionId: number): void {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.fileUpload.emit({ file: files[0], transactionId });
    }
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
      this.fileUpload.emit({ file: files[0], transactionId });
    }
  }

  onRemoveUploadedImage(event: Event, transactionId: number): void {
    this.removeImage.emit({ event, transactionId });
  }

  onPayTransaction(transactionId: number): void {
    this.payTransaction.emit(transactionId);
  }

  onCancelTransaction(transactionId: number): void {
    this.cancelTransaction.emit(transactionId);
  }

  onCancelConfirmed(): void {
    this.cancelConfirmed.emit();
  }

  onCancelCancelled(): void {
    this.cancelCancelled.emit();
  }

  formatPrice(price: number): string {
    return price.toLocaleString('th-TH') + ' บาท';
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

  getUploadedImage(transactionId: number): string | undefined {
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

  getModalTransactionId = (): number | undefined => this.data?.transactionId;
  getModalStatus = (): 1 | 2 | 3 | undefined => (this.data as BookingTransaction)?.Status;
  getModalZone = (): string | undefined => (this.data as BookingResult)?.zone;
  getModalTotalAmount = (): number | undefined => (this.data as BookingResult)?.totalPrice ?? (this.data as BookingTransaction)?.totalAmount;
  getModalMessage = (): string | undefined => (this.data as BookingResult)?.message;
  getModalBookedSeats = (): BookedSeatInfo[] | undefined => (this.data as BookingResult)?.bookedSeats;
  getModalFailedSeats = (): FailedSeatInfo[] | undefined => (this.data as BookingResult)?.failedSeats;
  getModalSeatsData = (): BookingTransactionSeat[] | undefined => (this.data as BookingTransaction)?.seats_data;

  trackByBookedSeat(index: number, seat: BookedSeatInfo): string {
    return `${seat.row}-${seat.display}`;
  }

  trackByFailedSeat(index: number, seat: FailedSeatInfo): number {
    return seat.id;
  }

  trackByBookingSeat(index: number, seat: BookingTransactionSeat): string {
    return `${seat.zone}-${seat.row}-${seat.column}`;
  }
}