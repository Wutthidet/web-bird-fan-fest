import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-intro',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './intro.component.html',
  styleUrl: './intro.component.scss'
})
export class IntroComponent {
  @Output() enterWebsite = new EventEmitter<void>();

  isAnimating = false;

  onEnterWebsite() {
    if (this.isAnimating) return;

    this.isAnimating = true;

    setTimeout(() => {
      this.enterWebsite.emit();
    }, 1200);
  }
}