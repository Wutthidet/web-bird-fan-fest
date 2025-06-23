import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { IntroComponent } from './pages/intro/intro.component';
import { LayoutComponent } from './shared/components/layout/layout.component';
import { PdpaPopupComponent } from './shared/components/pdpa/pdpa.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { ToastService } from './services/toast.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, IntroComponent, LayoutComponent, PdpaPopupComponent, ToastComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'web-bird-fan-fest';
  showIntro = true;
  showPdpaPopup = false;
  pdpaAccepted = false;

  constructor(private toastService: ToastService) {
    this.checkPdpaStatus();
  }

  private checkPdpaStatus() {
    const pdpaStatus = localStorage.getItem('pdpa_accepted');
    this.pdpaAccepted = pdpaStatus === 'true';
  }

  onEnterWebsite() {
    this.showIntro = false;

    if (!this.pdpaAccepted) {
      setTimeout(() => {
        this.showPdpaPopup = true;
      }, 500);
    }
  }

  onPdpaAccept() {
    localStorage.setItem('pdpa_accepted', 'true');
    this.pdpaAccepted = true;
    this.showPdpaPopup = false;
  }

  onPdpaDecline() {
    this.showPdpaPopup = false;
    this.showIntro = true;
    this.toastService.warning('เพื่อใช้งานเว็บไซต์ กรุณายอมรับเงื่อนไขการคุ้มครองข้อมูลส่วนบุคคล');
  }
}