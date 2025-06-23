import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-confirmation',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirmation.component.html',
  styleUrl: './confirmation.component.scss'
})
export class ConfirmationModalComponent {
  @Input() show: boolean = false;
  @Input() title: string = 'ยืนยันการดำเนินการ';
  @Input() message: string = 'คุณแน่ใจหรือไม่ที่จะดำเนินการต่อ?';
  @Input() confirmText: string = 'ยืนยัน';
  @Input() cancelText: string = 'ยกเลิก';
  @Input() isProcessing: boolean = false;
  @Input() confirmationType: 'danger' | 'confirm' | 'info' = 'danger';

  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  onConfirm() {
    if (!this.isProcessing) {
      this.confirmed.emit();
    }
  }

  onCancel() {
    if (!this.isProcessing) {
      this.cancelled.emit();
    }
  }

  onClose() {
    if (!this.isProcessing) {
      this.closed.emit();
    }
  }

  onOverlayClick(event: Event) {
    if (event.target === event.currentTarget && !this.isProcessing) {
      this.onClose();
    }
  }
}