import { Component, Input, Output, EventEmitter, ElementRef, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Seat } from '../../../../services/seat.service';

@Component({
  selector: 'app-seats-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './seats-modal.component.html',
  styleUrls: ['./seats-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SeatsModalComponent {
  @ViewChild('seatTooltip') seatTooltipRef!: ElementRef<HTMLElement>;

  @Input() show = false;
  @Input() zoneName = '';
  @Input() seats: Seat[] = [];
  @Input() selectedSeats: Set<string> = new Set();
  @Input() isLoading = false;
  @Input() error = '';
  @Input() isProcessingBooking = false;

  @Output() close = new EventEmitter<void>();
  @Output() seatClick = new EventEmitter<Seat>();
  @Output() seatSelection = new EventEmitter<Set<string>>();
  @Output() proceedBooking = new EventEmitter<void>();

  private readonly priceColorMap: { [key: number]: string } = {
    3000: '#e3362e', 3500: '#f4ef3e', 4500: '#4962a6',
    6000: '#959298', 7000: '#abd495', 8500: '#a1529b',
    9000: '#bd8332', 9500: '#216c39', 10000: '#48bae8'
  };

  onCloseModal(): void {
    this.close.emit();
  }

  onSeatClick(seat: Seat): void {
    this.seatClick.emit(seat);
  }

  onProceedBooking(): void {
    this.proceedBooking.emit();
  }

  clearAllSelectedSeats(): void {
    const newSelection = new Set<string>();
    this.seatSelection.emit(newSelection);
  }

  removeSeatFromSelection(seatId: string): void {
    const newSelection = new Set(this.selectedSeats);
    newSelection.delete(seatId);
    this.seatSelection.emit(newSelection);
  }

  isSeatSelected(seat: Seat): boolean {
    const seatId = `${seat.ZONE}-${seat.ROW}-${seat.COLUMN}`;
    return this.selectedSeats.has(seatId);
  }

  getSeatStatusClass(status: 0 | 1 | 2): string {
    switch (status) {
      case 0: return 'available';
      case 1: return 'reserved';
      case 2: return 'paid';
      default: return '';
    }
  }

  getSeatClassCombined(seat: Seat): string {
    return this.getSeatStatusClass(seat.STATUS);
  }

  getPriceColor(price: number): string {
    return this.priceColorMap[price] || '#718096';
  }

  getUniquePrices(): number[] {
    if (!this.seats?.length) return [];
    const prices = this.seats
      .filter(seat => seat.VISIBLE === 'T')
      .map(seat => seat.PRICE);
    return [...new Set(prices)].sort((a, b) => a - b);
  }

  getDisplaySeatNumber(seat: Seat): number {
    return seat.DISPLAY ?? seat.COLUMN;
  }

  getVisibleSeatsCount(): number {
    return this.seats?.filter(seat => seat.VISIBLE === 'T').length || 0;
  }

  getAvailableSeatsCount(): number {
    return this.seats?.filter(seat => seat.VISIBLE === 'T' && seat.STATUS === 0).length || 0;
  }

  getGroupedSeats(): { row: string; seats: Seat[] }[] {
    if (!this.seats?.length) return [];

    const grouped = this.seats.reduce((acc, seat) => {
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

  private findSeatById(seatId: string): Seat | undefined {
    if (!this.seats) return undefined;
    const [zone, row, columnStr] = seatId.split('-');
    const column = parseInt(columnStr, 10);
    return this.seats.find(s => s.ZONE === zone && s.ROW === row && s.COLUMN === column);
  }

  getSelectedSeatDisplay(seatId: string): string {
    const seat = this.findSeatById(seatId);
    return seat ? `${seat.ROW}${this.getDisplaySeatNumber(seat)}` : seatId;
  }

  getSelectedSeatPrice(seatId: string): string {
    const seat = this.findSeatById(seatId);
    return seat ? this.formatPrice(seat.PRICE) : '0 บาท';
  }

  getTotalPrice(): string {
    const total = this.getTotalPriceNumber();
    return this.formatPrice(total);
  }

  private getTotalPriceNumber(): number {
    return Array.from(this.selectedSeats).reduce((sum, seatId) => {
      const seat = this.findSeatById(seatId);
      return sum + (seat ? seat.PRICE : 0);
    }, 0);
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

  trackByRowGroup(index: number, rowGroup: { row: string }): string {
    return rowGroup.row;
  }

  trackBySeat(index: number, seat: Seat): string {
    return `${seat.ZONE}-${seat.ROW}-${seat.COLUMN}`;
  }

  trackBySeatId(index: number, seatId: string): string {
    return seatId;
  }

  trackByPrice(index: number, price: number): number {
    return price;
  }
}