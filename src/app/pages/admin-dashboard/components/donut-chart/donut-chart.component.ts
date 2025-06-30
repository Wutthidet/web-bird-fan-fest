import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ZoneStat {
  ZONE: string;
  Max: number;
  Available: number;
}

@Component({
  selector: 'app-donut-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './donut-chart.component.html',
  styleUrl: './donut-chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DonutChartComponent {
  @Input() zoneStats: ZoneStat[] = [];
  @Output() normalZonesClick = new EventEmitter<void>();
  @Output() warningZonesClick = new EventEmitter<void>();
  @Output() criticalZonesClick = new EventEmitter<void>();

  getOccupancyPercentage(zone: ZoneStat): number {
    if (zone.Max === 0) return 0;
    return Math.round(((zone.Max - zone.Available) / zone.Max) * 100);
  }

  getOverallOccupancyRate(): number {
    const totalSeats = this.zoneStats.reduce((total, zone) => total + zone.Max, 0);
    const totalAvailable = this.zoneStats.reduce((total, zone) => total + zone.Available, 0);
    if (totalSeats === 0) return 0;
    return Math.round(((totalSeats - totalAvailable) / totalSeats) * 100);
  }

  getNormalZonesCount(): number {
    return this.zoneStats.filter(zone => {
      const percentage = this.getOccupancyPercentage(zone);
      return percentage <= 70;
    }).length;
  }

  getWarningZonesCount(): number {
    return this.zoneStats.filter(zone => {
      const percentage = this.getOccupancyPercentage(zone);
      return percentage > 70 && percentage <= 90;
    }).length;
  }

  getCriticalZonesCount(): number {
    return this.zoneStats.filter(zone => {
      const percentage = this.getOccupancyPercentage(zone);
      return percentage > 90;
    }).length;
  }

  getNormalArcLength(): number {
    const total = this.zoneStats.length;
    if (total === 0) return 0;
    const circumference = 2 * Math.PI * 80;
    return (this.getNormalZonesCount() / total) * circumference;
  }

  getWarningArcLength(): number {
    const total = this.zoneStats.length;
    if (total === 0) return 0;
    const circumference = 2 * Math.PI * 80;
    return (this.getWarningZonesCount() / total) * circumference;
  }

  getCriticalArcLength(): number {
    const total = this.zoneStats.length;
    if (total === 0) return 0;
    const circumference = 2 * Math.PI * 80;
    return (this.getCriticalZonesCount() / total) * circumference;
  }

  onNormalZonesClick(): void {
    this.normalZonesClick.emit();
  }

  onWarningZonesClick(): void {
    this.warningZonesClick.emit();
  }

  onCriticalZonesClick(): void {
    this.criticalZonesClick.emit();
  }
}