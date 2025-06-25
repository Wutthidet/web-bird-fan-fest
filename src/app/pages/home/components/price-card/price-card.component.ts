import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

interface PriceItem {
  price: number;
  color: string;
}

@Component({
  selector: 'app-price-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './price-card.component.html',
  styleUrls: ['./price-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PriceCardComponent {
  @Input() priceItems: PriceItem[] = [];

  formatPrice(price: number): string {
    return price.toLocaleString('th-TH') + ' บาท';
  }

  trackByPriceItem(index: number, item: PriceItem): number {
    return item.price;
  }
}