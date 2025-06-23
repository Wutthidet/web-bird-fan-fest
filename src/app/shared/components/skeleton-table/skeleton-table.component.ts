import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

interface SkeletonColumn {
  type: 'id' | 'name' | 'amount' | 'status' | 'date' | 'actions' | 'short' | 'medium' | 'long';
}

@Component({
  selector: 'app-skeleton-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './skeleton-table.component.html',
  styleUrl: './skeleton-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SkeletonTableComponent {
  @Input() rowCount: number = 5;
  @Input() columns: SkeletonColumn[] = [
    { type: 'id' },
    { type: 'name' },
    { type: 'amount' },
    { type: 'status' },
    { type: 'date' },
    { type: 'actions' }
  ];

  get rows(): number[] {
    return Array(this.rowCount).fill(0).map((_, i) => i);
  }
}