import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-pdpa',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pdpa.component.html',
  styleUrl: './pdpa.component.scss'
})
export class PdpaPopupComponent {
  @Output() acceptPdpa = new EventEmitter<void>();
  @Output() declinePdpa = new EventEmitter<void>();

  isAnimating = false;
  expandedCards = {
    terms: false,
    measures: false,
    privacy: false
  };

  toggleCard(cardType: 'terms' | 'measures' | 'privacy') {
    this.expandedCards[cardType] = !this.expandedCards[cardType];
  }

  onAccept() {
    if (this.isAnimating) return;

    this.isAnimating = true;

    setTimeout(() => {
      this.acceptPdpa.emit();
    }, 300);
  }

  onDecline() {
    if (this.isAnimating) return;

    this.isAnimating = true;

    setTimeout(() => {
      this.declinePdpa.emit();
    }, 300);
  }
}