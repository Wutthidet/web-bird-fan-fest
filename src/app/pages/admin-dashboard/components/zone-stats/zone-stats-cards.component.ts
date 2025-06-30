import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ZoneStat {
  ZONE: string;
  Max: number;
  Available: number;
}

@Component({
  selector: 'app-zone-stats-cards',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './zone-stats-cards.component.html',
  styleUrl: './zone-stats-cards.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ZoneStatsCardsComponent {
  @Input() zoneStats: ZoneStat[] = [];

  getTotalSeats(): number {
    return this.zoneStats.reduce((total, zone) => total + zone.Max, 0);
  }

  getTotalAvailable(): number {
    return this.zoneStats.reduce((total, zone) => total + zone.Available, 0);
  }

  getTotalOccupied(): number {
    return this.getTotalSeats() - this.getTotalAvailable();
  }

  getOverallOccupancyRate(): number {
    const total = this.getTotalSeats();
    if (total === 0) return 0;
    return Math.round((this.getTotalOccupied() / total) * 100);
  }
}