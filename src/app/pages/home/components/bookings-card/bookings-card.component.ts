import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BookingTransaction } from '../../../../services/transaction.service';

@Component({
  selector: 'app-bookings-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bookings-card.component.html',
  styleUrls: ['./bookings-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BookingsCardComponent {
  @Input() isLoading = false;
  @Input() error = '';
  @Input() bookings: BookingTransaction[] = [];
  @Output() retryLoad = new EventEmitter<void>();
  @Output() bookingClick = new EventEmitter<BookingTransaction>();

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

  onRetryClick(): void {
    this.retryLoad.emit();
  }

  onBookingClick(booking: BookingTransaction): void {
    this.bookingClick.emit(booking);
  }

  trackByBooking(index: number, booking: BookingTransaction): string {
    return booking.transactionId;
  }
}