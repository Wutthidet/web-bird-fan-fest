import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

@Injectable({
  providedIn: 'root'
})
export class AdminGuard {
  constructor(
    private authService: AuthService,
    private router: Router,
    private toastService: ToastService
  ) {}

  canActivate(): Observable<boolean> | Promise<boolean> | boolean {
    if (this.authService.isLoggedIn() && this.authService.isAdmin()) {
      return true;
    }

    if (!this.authService.isLoggedIn()) {
      this.toastService.warning('กรุณาเข้าสู่ระบบ', 'ต้องเข้าสู่ระบบเพื่อเข้าถึงหน้า Admin');
      this.router.navigate(['/home']);
      return false;
    }

    if (!this.authService.isAdmin()) {
      this.toastService.error('ไม่มีสิทธิ์เข้าถึง', 'คุณไม่มีสิทธิ์ Admin');
      this.router.navigate(['/home']);
      return false;
    }

    return false;
  }

  canActivateChild(): Observable<boolean> | Promise<boolean> | boolean {
    return this.canActivate();
  }
}