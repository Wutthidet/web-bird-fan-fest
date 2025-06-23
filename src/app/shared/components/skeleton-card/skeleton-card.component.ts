import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-skeleton-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './skeleton-card.component.html',
  styleUrl: './skeleton-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SkeletonCardComponent {}