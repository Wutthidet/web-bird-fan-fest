import { Component, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Particle {
  x: number;
  y: number;
  delay: number;
}

@Component({
  selector: 'app-intro',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './intro.component.html',
  styleUrl: './intro.component.scss'
})
export class IntroComponent implements OnInit, OnDestroy {
  @Output() enterWebsite = new EventEmitter<void>();

  isAnimating = false;
  isSlideOut = false;
  particles: Particle[] = [];
  tiltStyle = 'rotateX(0deg) rotateY(0deg)';

  private animationTimer?: ReturnType<typeof setTimeout>;
  private readonly MAX_TILT = 5;

  ngOnInit() {
    this.generateParticles();
  }

  ngOnDestroy() {
    if (this.animationTimer) {
      clearTimeout(this.animationTimer);
    }
  }

  private generateParticles() {
    this.particles = [];
    for (let i = 0; i < 15; i++) {
      this.particles.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        delay: Math.random() * 4
      });
    }
  }

  onMouseMove(event: MouseEvent) {
    const target = event.currentTarget as HTMLElement;
    const { offsetWidth, offsetHeight } = target;
    const { offsetX, offsetY } = event;

    const rotateY = ((offsetX - offsetWidth / 2) / (offsetWidth / 2)) * this.MAX_TILT;
    const rotateX = -((offsetY - offsetHeight / 2) / (offsetHeight / 2)) * this.MAX_TILT;

    this.tiltStyle = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  }

  onMouseLeave() {
    this.tiltStyle = `rotateX(0deg) rotateY(0deg)`;
  }

  onEnterWebsite() {
    if (this.isAnimating) return;

    this.isAnimating = true;

    this.animationTimer = setTimeout(() => {
      this.isSlideOut = true;

      setTimeout(() => {
        this.enterWebsite.emit();
      }, 1000);
    }, 2500);
  }

  trackParticle(index: number, particle: Particle): number {
    return index;
  }
}