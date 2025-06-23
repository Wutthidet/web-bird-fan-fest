import { Component, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { trigger, style, transition, animate } from '@angular/animations';
import { Subject, timer, interval } from 'rxjs';
import { takeUntil, finalize, tap, startWith } from 'rxjs/operators';

type AuthMode = 'login' | 'register';
type ContactWay = 'Email' | 'Phone';

interface FormValidationState {
  isValid: boolean;
  errors: string[];
}

interface TimerState {
  timeLeft: number;
  canResend: boolean;
  isActive: boolean;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('slideInOut', [
      transition(':enter', [
        style({
          opacity: 0,
          transform: 'translateX(100px) scale(0.9)'
        }),
        animate('300ms cubic-bezier(0.4, 0, 0.2, 1)',
          style({
            opacity: 1,
            transform: 'translateX(0) scale(1)'
          })
        )
      ]),
      transition(':leave', [
        animate('200ms cubic-bezier(0.4, 0, 0.2, 1)',
          style({
            opacity: 0,
            transform: 'translateX(50px) scale(0.95)'
          })
        )
      ])
    ])
  ]
})
export class LoginComponent implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly timerDestroy$ = new Subject<void>();
  private readonly OTP_DURATION = 300;
  private readonly MESSAGE_TIMEOUT = 5000;

  isVisible = false;
  authMode: AuthMode = 'login';
  contactWay: ContactWay = 'Email';

  contact = '';
  otp = '';
  firstName = '';
  lastName = '';
  idenNumber = '';
  address = '';
  email = '';
  tel = '';

  otpSent = false;
  isLoading = false;
  errorMessage = '';
  successMessage = '';

  timerState: TimerState = {
    timeLeft: 0,
    canResend: false,
    isActive: false
  };

  private readonly validationRules = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    phone: /^[0-9]{10}$/,
    idNumber: /^[0-9]{13}$/,
    otp: /^\d{6}$/
  };

  constructor(
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnDestroy(): void {
    this.cleanup();
  }

  private cleanup(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopOtpTimer();
    document.body.style.overflow = 'auto';
  }

  show(): void {
    this.isVisible = true;
    document.body.style.overflow = 'hidden';
    this.clearMessages();
    this.cdr.detectChanges();
  }

  closeLogin(): void {
    this.isVisible = false;
    this.resetForm();
    document.body.style.overflow = 'auto';
    this.cdr.detectChanges();
  }

  switchAuthMode(mode: AuthMode): void {
    if (this.authMode === mode) return;

    this.authMode = mode;
    this.resetForm();
    this.clearMessages();
    this.cdr.detectChanges();
  }

  setContactWay(way: ContactWay): void {
    if (this.contactWay === way) return;

    this.contactWay = way;
    this.contact = '';
    this.clearMessages();
    this.cdr.detectChanges();
  }

  sendOTP(): void {
    if (this.isLoading) return;

    this.clearMessages();

    const validation = this.authMode === 'register'
      ? this.validateRegisterForm()
      : this.validateLoginForm();

    if (!validation.isValid) {
      this.showErrorMessage(validation.errors[0]);
      return;
    }

    this.isLoading = true;
    this.cdr.detectChanges();

    const request$ = this.authMode === 'register'
      ? this.sendRegisterOTP()
      : this.sendLoginOTP();

    request$
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (response) => {
          if (response.status === 'success') {
            this.otpSent = true;
            this.showSuccessMessage('OTP ถูกส่งสำเร็จแล้ว');
            this.startOtpTimer();
          } else {
            this.showErrorMessage(response.message || 'ไม่สามารถส่ง OTP ได้');
          }
        },
        error: (error) => {
          this.showErrorMessage('เกิดข้อผิดพลาดในการส่ง OTP กรุณาลองใหม่อีกครั้ง');
          console.error('OTP error:', error);
        }
      });
  }

  private sendRegisterOTP() {
    const registerData = {
      IdenNumber: this.idenNumber.trim(),
      Email: this.email.trim(),
      Tel: this.tel.trim(),
      Way: this.contactWay
    };

    return this.authService.registerUser(registerData);
  }

  private sendLoginOTP() {
    return this.authService.loginUser(this.contact.trim());
  }

  resendOTP(): void {
    if (!this.timerState.canResend || this.isLoading) return;

    this.clearMessages();
    this.otp = '';
    this.sendOTP();
  }

  private startOtpTimer(): void {
    this.stopOtpTimer();
    this.timerState = {
      timeLeft: this.OTP_DURATION,
      canResend: false,
      isActive: true
    };
    this.cdr.detectChanges();

    interval(1000)
      .pipe(
        startWith(0),
        takeUntil(this.timerDestroy$),
        takeUntil(this.destroy$),
        tap(() => {
          if (this.timerState.timeLeft > 0) {
            this.timerState.timeLeft--;
          }

          if (this.timerState.timeLeft <= 0) {
            this.timerState = {
              timeLeft: 0,
              canResend: true,
              isActive: false
            };
            this.stopOtpTimer();
          }

          this.cdr.detectChanges();
        })
      )
      .subscribe();
  }

  private stopOtpTimer(): void {
    this.timerDestroy$.next();
    this.timerDestroy$.complete();

    (this as any).timerDestroy$ = new Subject<void>();

    this.timerState = {
      timeLeft: 0,
      canResend: false,
      isActive: false
    };
  }

  formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  verifyOTP(): void {
    if (this.isLoading) return;

    const validation = this.validateOtpForm();
    if (!validation.isValid) {
      this.showErrorMessage(validation.errors[0]);
      return;
    }

    this.clearMessages();
    this.isLoading = true;
    this.cdr.detectChanges();

    const request$ = this.authMode === 'register'
      ? this.verifyRegisterOTP()
      : this.verifyLoginOTP();

    request$
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (response) => {
          if (response.status === 'success') {
            const contactData = this.authMode === 'register'
              ? (this.contactWay === 'Email' ? this.email.trim() : this.tel.trim())
              : this.contact.trim();

            this.authService.setUser(contactData, response.token, (response as any).isAdmin || false);

            const successMessage = this.authMode === 'register'
              ? 'สมัครสมาชิกและเข้าสู่ระบบสำเร็จ!'
              : 'เข้าสู่ระบบสำเร็จ!';

            this.showSuccessMessage(successMessage);
            this.stopOtpTimer();

            setTimeout(() => {
              this.closeLogin();
            }, 1500);
          } else {
            this.showErrorMessage(response.message || 'รหัส OTP ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
          }
        },
        error: (error) => {
          this.showErrorMessage('เกิดข้อผิดพลาดในการยืนยัน OTP กรุณาลองใหม่อีกครั้ง');
          console.error('OTP verification error:', error);
        }
      });
  }

  private verifyRegisterOTP() {
    const confirmData = {
      FirstName: this.firstName.trim(),
      LastName: this.lastName.trim(),
      IdenNumber: this.idenNumber.trim(),
      Addr: this.address.trim(),
      Email: this.email.trim(),
      Tel: this.tel.trim(),
      Way: this.contactWay,
      otp: this.otp.trim()
    };

    return this.authService.registerConfirm(confirmData);
  }

  private verifyLoginOTP() {
    return this.authService.loginConfirm(this.contact.trim(), this.otp.trim());
  }

  backToForm(): void {
    this.otpSent = false;
    this.otp = '';
    this.clearMessages();
    this.stopOtpTimer();
    this.cdr.detectChanges();
  }

  private resetForm(): void {
    this.contact = '';
    this.otp = '';
    this.firstName = '';
    this.lastName = '';
    this.idenNumber = '';
    this.address = '';
    this.email = '';
    this.tel = '';
    this.otpSent = false;
    this.isLoading = false;
    this.clearMessages();
    this.stopOtpTimer();
  }

  private clearMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }

  private showErrorMessage(message: string): void {
    this.errorMessage = message;
    this.successMessage = '';
    this.cdr.detectChanges();

    timer(this.MESSAGE_TIMEOUT)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.errorMessage = '';
        this.cdr.detectChanges();
      });
  }

  private showSuccessMessage(message: string): void {
    this.successMessage = message;
    this.errorMessage = '';
    this.cdr.detectChanges();

    timer(3000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.successMessage = '';
        this.cdr.detectChanges();
      });
  }

  private validateLoginForm(): FormValidationState {
    const errors: string[] = [];
    const contact = this.contact.trim();

    if (!contact) {
      errors.push('กรุณากรอกอีเมลหรือเบอร์โทรศัพท์');
    } else {
      const isEmail = contact.includes('@');
      if (isEmail && !this.validationRules.email.test(contact)) {
        errors.push('รูปแบบอีเมลไม่ถูกต้อง');
      } else if (!isEmail && !this.validationRules.phone.test(contact)) {
        errors.push('รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง (ต้องเป็นตัวเลข 10 หลัก)');
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  private validateRegisterForm(): FormValidationState {
    const errors: string[] = [];

    if (!this.firstName.trim()) {
      errors.push('กรุณากรอกชื่อ');
    }

    if (!this.lastName.trim()) {
      errors.push('กรุณากรอกนามสกุล');
    }

    const idNumber = this.idenNumber.trim();
    if (!idNumber) {
      errors.push('กรุณากรอกเลขประจำตัวประชาชน');
    } else if (!this.validationRules.idNumber.test(idNumber)) {
      errors.push('เลขประจำตัวประชาชนต้องมี 13 หลัก');
    } else if (!this.isValidIDNumber(idNumber)) {
      errors.push('เลขประจำตัวประชาชนไม่ถูกต้อง');
    }

    if (!this.address.trim()) {
      errors.push('กรุณากรอกที่อยู่');
    }

    const email = this.email.trim();
    if (!email) {
      errors.push('กรุณากรอกอีเมล');
    } else if (!this.validationRules.email.test(email)) {
      errors.push('รูปแบบอีเมลไม่ถูกต้อง');
    }

    const tel = this.tel.trim();
    if (!tel) {
      errors.push('กรุณากรอกเบอร์โทรศัพท์');
    } else if (!this.validationRules.phone.test(tel)) {
      errors.push('รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง (ต้องเป็นตัวเลข 10 หลัก)');
    }

    return { isValid: errors.length === 0, errors };
  }

  private validateOtpForm(): FormValidationState {
    const errors: string[] = [];
    const otp = this.otp.trim();

    if (!otp) {
      errors.push('กรุณากรอกรหัส OTP');
    } else if (!this.validationRules.otp.test(otp)) {
      errors.push('รหัส OTP ต้องเป็นตัวเลข 6 หลัก');
    }

    if (this.timerState.timeLeft <= 0 && !this.timerState.canResend) {
      errors.push('รหัส OTP หมดอายุแล้ว กรุณาขอรหัสใหม่');
    }

    return { isValid: errors.length === 0, errors };
  }

  private isValidIDNumber(idNumber: string): boolean {
    if (!this.validationRules.idNumber.test(idNumber)) return false;

    const digits = idNumber.split('').map(Number);
    let sum = 0;

    for (let i = 0; i < 12; i++) {
      sum += digits[i] * (13 - i);
    }

    const checkDigit = (11 - (sum % 11)) % 10;
    return checkDigit === digits[12];
  }

  isRegisterFormValid(): boolean {
    return this.validateRegisterForm().isValid;
  }

  getOtpDestination(): string {
    if (this.authMode === 'login') {
      return this.contact;
    } else {
      return this.contactWay === 'Email' ? this.email : this.tel;
    }
  }

  get otpTimeLeft(): number {
    return this.timerState.timeLeft;
  }

  get canResendOtp(): boolean {
    return this.timerState.canResend;
  }
}