import { Component, Output, EventEmitter, Input, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, timer, fromEvent } from 'rxjs';
import { takeUntil, filter } from 'rxjs/operators';

interface RefreshInterval {
  value: number;
  label: string;
}

@Component({
  selector: 'app-auto-refresh-control',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './auto-refresh.component.html',
  styleUrl: './auto-refresh.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AutoRefreshControlComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private refreshTimer$ = new Subject<void>();
  private isDocumentVisible = true;

  @Input() isRefreshing = false;
  @Input() lastRefreshTime: Date | null = null;
  @Output() refresh = new EventEmitter<void>();
  @Output() intervalChange = new EventEmitter<number>();

  showSettings = false;
  selectedInterval = 0;
  timeRemaining = 0;
  countdownPercentage = 0;

  readonly intervalOptions: RefreshInterval[] = [
    { value: 0, label: 'ปิดการรีเฟรชอัตโนมัติ' },
    { value: 30000, label: 'ทุก 30 วินาที' },
    { value: 60000, label: 'ทุก 1 นาที' },
    { value: 300000, label: 'ทุก 5 นาที' },
    { value: 600000, label: 'ทุก 10 นาที' }
  ];

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadSettings();
    this.setupVisibilityAPI();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.refreshTimer$.next();
    this.refreshTimer$.complete();
  }

  get isAutoRefreshEnabled(): boolean {
    return this.selectedInterval > 0;
  }

  private loadSettings(): void {
    const savedInterval = localStorage.getItem('admin-refresh-interval');
    if (savedInterval) {
      this.selectedInterval = parseInt(savedInterval, 10);
    }
  }

  private saveSettings(): void {
    localStorage.setItem('admin-refresh-interval', this.selectedInterval.toString());
  }

  private setupVisibilityAPI(): void {
    fromEvent(document, 'visibilitychange')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.isDocumentVisible = !document.hidden;
        if (this.isDocumentVisible && this.isAutoRefreshEnabled) {
          this.startAutoRefresh();
        } else if (!this.isDocumentVisible) {
          this.stopAutoRefresh();
        }
      });
  }

  private startAutoRefresh(): void {
    if (!this.isAutoRefreshEnabled || !this.isDocumentVisible) {
      return;
    }

    this.stopAutoRefresh();
    this.timeRemaining = this.selectedInterval;

    timer(0, 1000)
      .pipe(
        takeUntil(this.refreshTimer$),
        takeUntil(this.destroy$),
        filter(() => this.isDocumentVisible && this.isAutoRefreshEnabled)
      )
      .subscribe(() => {
        this.timeRemaining -= 1000;
        this.countdownPercentage = ((this.selectedInterval - this.timeRemaining) / this.selectedInterval) * 100;

        if (this.timeRemaining <= 0) {
          this.onManualRefresh();
          this.timeRemaining = this.selectedInterval;
          this.countdownPercentage = 0;
        }

        this.cdr.detectChanges();
      });
  }

  private stopAutoRefresh(): void {
    this.refreshTimer$.next();
    this.timeRemaining = 0;
    this.countdownPercentage = 0;
    this.cdr.detectChanges();
  }

  onManualRefresh(): void {
    if (this.isRefreshing) return;

    this.refresh.emit();
    this.lastRefreshTime = new Date();

    if (this.isAutoRefreshEnabled) {
      this.startAutoRefresh();
    }
  }

  onIntervalChange(value: number): void {
    this.selectedInterval = value;
    this.cdr.detectChanges();
  }

  toggleSettings(): void {
    this.showSettings = !this.showSettings;

    if (!this.showSettings) {
      document.addEventListener('click', this.closeSettingsOnClickOutside);
    } else {
      document.removeEventListener('click', this.closeSettingsOnClickOutside);
    }

    this.cdr.detectChanges();
  }

  private closeSettingsOnClickOutside = (event: Event): void => {
    const target = event.target as HTMLElement;
    if (!target.closest('.auto-refresh-settings')) {
      this.showSettings = false;
      this.cdr.detectChanges();
      document.removeEventListener('click', this.closeSettingsOnClickOutside);
    }
  };

  applySettings(): void {
    this.saveSettings();
    this.intervalChange.emit(this.selectedInterval);

    if (this.isAutoRefreshEnabled) {
      this.startAutoRefresh();
    } else {
      this.stopAutoRefresh();
    }

    this.showSettings = false;
    this.cdr.detectChanges();
  }

  formatTimeRemaining(ms: number): string {
    const seconds = Math.ceil(ms / 1000);

    if (seconds < 60) {
      return `${seconds} วินาที`;
    } else {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return remainingSeconds > 0 ? `${minutes} นาที ${remainingSeconds} วินาที` : `${minutes} นาที`;
    }
  }

  formatLastRefresh(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffSeconds = Math.floor((diffMs % 60000) / 1000);

    if (diffMinutes === 0) {
      return `${diffSeconds} วินาทีที่แล้ว`;
    } else if (diffMinutes < 60) {
      return `${diffMinutes} นาทีที่แล้ว`;
    } else {
      return date.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  }
}