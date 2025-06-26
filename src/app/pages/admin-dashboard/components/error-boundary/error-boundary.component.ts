import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, timer } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

interface BackgroundDot {
  x: number;
  y: number;
  delay: number;
}

@Component({
  selector: 'app-error-boundary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './error-boundary.component.html',
  styleUrl: './error-boundary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ErrorBoundaryComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private autoRetryTimer$ = new Subject<void>();

  @Input() hasError = false;
  @Input() errorTitle = 'เกิดข้อผิดพลาด';
  @Input() errorMessage = 'ระบบพบข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง';
  @Input() errorStack = '';
  @Input() errorTime: Date = new Date();
  @Input() canRetry = true;
  @Input() autoRetryEnabled = true;
  @Input() maxRetries = 3;
  @Input() retryCount = 0;
  @Input() showTechnicalDetails = false;

  @Output() retry = new EventEmitter<void>();
  @Output() reload = new EventEmitter<void>();

  showDetails = false;
  showStackTrace = false;
  isRetrying = false;
  autoRetryCountdown = 0;
  autoRetryProgress = 0;
  backgroundDots: BackgroundDot[] = [];

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.generateBackgroundDots();
    if (this.hasError && this.autoRetryEnabled && this.retryCount < this.maxRetries) {
      this.startAutoRetry();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopAutoRetry();
  }

  private generateBackgroundDots(): void {
    this.backgroundDots = Array.from({ length: 20 }, (_, i) => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 3
    }));
  }

  private startAutoRetry(): void {
    if (!this.autoRetryEnabled || this.retryCount >= this.maxRetries) {
      return;
    }

    this.stopAutoRetry();

    const retryDelay = this.calculateRetryDelay(this.retryCount);
    this.autoRetryCountdown = Math.ceil(retryDelay / 1000);
    this.autoRetryProgress = 0;

    timer(0, 1000)
      .pipe(takeUntil(this.autoRetryTimer$), takeUntil(this.destroy$))
      .subscribe(() => {
        this.autoRetryCountdown--;
        this.autoRetryProgress = ((this.calculateRetryDelay(this.retryCount) / 1000 - this.autoRetryCountdown) / (this.calculateRetryDelay(this.retryCount) / 1000)) * 100;

        if (this.autoRetryCountdown <= 0) {
          this.onRetry();
        }

        this.cdr.detectChanges();
      });
  }

  private stopAutoRetry(): void {
    this.autoRetryTimer$.next();
    this.autoRetryCountdown = 0;
    this.autoRetryProgress = 0;
  }

  private calculateRetryDelay(retryCount: number): number {
    return Math.min(1000 * Math.pow(2, retryCount), 30000);
  }

  onRetry(): void {
    if (this.isRetrying) return;

    this.isRetrying = true;
    this.stopAutoRetry();
    this.cdr.detectChanges();

    setTimeout(() => {
      this.isRetrying = false;
      this.retry.emit();
      this.cdr.detectChanges();
    }, 500);
  }

  onReload(): void {
    window.location.reload();
  }

  toggleDetails(): void {
    this.showDetails = !this.showDetails;
    this.cdr.detectChanges();
  }

  toggleStackTrace(): void {
    this.showStackTrace = !this.showStackTrace;
    this.cdr.detectChanges();
  }

  cancelAutoRetry(): void {
    this.stopAutoRetry();
    this.cdr.detectChanges();
  }

  formatErrorTime(date: Date): string {
    return date.toLocaleString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
}