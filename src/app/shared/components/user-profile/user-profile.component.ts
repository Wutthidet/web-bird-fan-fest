import { Component, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { trigger, style, transition, animate } from '@angular/animations';
import { Subject, timer } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';

interface UserData {
  ID: number;
  FirstName: string;
  LastName: string;
  IdenNumber: string;
  Addr: string;
  Email: string;
  Tel: string;
  IdType: 'citizen' | 'passport';
  CreatedAt: string;
}

interface FormValidationState {
  isValid: boolean;
  errors: string[];
  hasChanges: boolean;
}

interface ValidationRules {
  email: RegExp;
  phone: RegExp;
  citizenId: RegExp;
  passport: RegExp;
}

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-profile.component.html',
  styleUrl: './user-profile.component.scss',
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
export class UserProfilePopupComponent implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly MESSAGE_TIMEOUT = 5000;
  private readonly SUCCESS_TIMEOUT = 3000;

  private readonly validationRules: ValidationRules = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    phone: /^[0-9]{10}$/,
    citizenId: /^[0-9]{13}$/,
    passport: /^[A-Za-z0-9]{6,20}$/
  };

  isVisible = false;
  isLoading = false;
  isSaving = false;
  loadError = '';
  errorMessage = '';
  successMessage = '';
  userData: UserData | null = null;
  originalUserData: UserData | null = null;

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
    document.body.style.overflow = 'auto';
  }

  show(): void {
    this.isVisible = true;
    this.loadUserData();
    this.clearMessages();
    document.body.style.overflow = 'hidden';
    this.cdr.detectChanges();
  }

  closeProfile(): void {
    this.isVisible = false;
    this.resetForm();
    document.body.style.overflow = 'auto';
    this.cdr.detectChanges();
  }

  getIdLabel(): string {
    return this.userData?.IdType === 'citizen' ? 'เลขประจำตัวประชาชน' : 'หมายเลขพาสปอร์ต';
  }

  loadUserData(): void {
    if (this.isLoading) return;

    this.isLoading = true;
    this.loadError = '';
    this.clearMessages();
    this.cdr.detectChanges();

    this.authService.getUser()
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
            this.userData = {
              ...response.data,
              IdType: (response.data as any).IdType || 'citizen'
            };
            this.originalUserData = { ...this.userData };
          } else {
            this.loadError = 'ไม่สามารถโหลดข้อมูลผู้ใช้ได้ กรุณาลองใหม่อีกครั้ง';
          }
        },
        error: (error) => {
          console.error('Error loading user data:', error);
          this.loadError = 'เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่อีกครั้ง';
        }
      });
  }

  onSubmit(): void {
    if (!this.userData || this.isSaving) return;

    const validation = this.validateForm();
    if (!validation.isValid) {
      this.showErrorMessage(validation.errors[0]);
      return;
    }

    if (!validation.hasChanges) {
      this.showErrorMessage('ไม่มีข้อมูลที่เปลี่ยนแปลง');
      return;
    }

    this.isSaving = true;
    this.clearMessages();
    this.cdr.detectChanges();

    const updateData = this.createUpdateRequest();

    this.authService.updateUser(updateData)
      .pipe(
        finalize(() => {
          this.isSaving = false;
          this.cdr.detectChanges();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (response) => {
          if (response.status === 'success') {
            this.showSuccessMessage('บันทึกข้อมูลสำเร็จ!');
            this.originalUserData = { ...this.userData! };

            timer(1500)
              .pipe(takeUntil(this.destroy$))
              .subscribe(() => {
                this.closeProfile();
              });
          } else {
            this.showErrorMessage(response.message || 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
          }
        },
        error: (error) => {
          console.error('Error updating user data:', error);
          this.showErrorMessage('เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง');
        }
      });
  }

  private createUpdateRequest() {
    if (!this.userData) {
      throw new Error('User data is required');
    }

    return {
      ID: this.userData.ID,
      FirstName: this.userData.FirstName.trim(),
      LastName: this.userData.LastName.trim(),
      Addr: this.userData.Addr.trim(),
      IdenNumber: this.userData.IdenNumber.trim(),
      Email: this.userData.Email.trim(),
      Tel: this.userData.Tel.trim(),
      IdType: this.userData.IdType
    };
  }

  private validateForm(): FormValidationState {
    const errors: string[] = [];

    if (!this.userData) {
      return { isValid: false, errors: ['ไม่พบข้อมูลผู้ใช้'], hasChanges: false };
    }

    const trimmedData = this.getTrimmedData();

    if (!trimmedData.firstName) {
      errors.push('กรุณากรอกชื่อ');
    }

    if (!trimmedData.lastName) {
      errors.push('กรุณากรอกนามสกุล');
    }

    if (!trimmedData.idenNumber) {
      errors.push(`กรุณากรอก${this.getIdLabel()}`);
    } else if (this.userData.IdType === 'citizen') {
      if (!this.validationRules.citizenId.test(trimmedData.idenNumber)) {
        errors.push('เลขประจำตัวประชาชนต้องมี 13 หลัก');
      } else if (!this.isValidIDNumber(trimmedData.idenNumber)) {
        errors.push('เลขประจำตัวประชาชนไม่ถูกต้อง');
      }
    } else if (this.userData.IdType === 'passport') {
      if (!this.validationRules.passport.test(trimmedData.idenNumber)) {
        errors.push('หมายเลขพาสปอร์ตต้องมี 6-20 ตัวอักษร (ตัวอักษรและตัวเลข)');
      }
    }

    if (!trimmedData.address) {
      errors.push('กรุณากรอกที่อยู่จัดส่ง');
    }

    if (!trimmedData.email) {
      errors.push('กรุณากรอกอีเมล');
    } else if (!this.validationRules.email.test(trimmedData.email)) {
      errors.push('รูปแบบอีเมลไม่ถูกต้อง');
    }

    if (!trimmedData.tel) {
      errors.push('กรุณากรอกเบอร์โทรศัพท์');
    } else if (!this.validationRules.phone.test(trimmedData.tel)) {
      errors.push('รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง (ต้องเป็นตัวเลข 10 หลัก)');
    }

    const hasChanges = this.hasDataChanged();

    return {
      isValid: errors.length === 0,
      errors,
      hasChanges
    };
  }

  private getTrimmedData() {
    if (!this.userData) {
      throw new Error('User data is required');
    }

    return {
      firstName: this.userData.FirstName.trim(),
      lastName: this.userData.LastName.trim(),
      idenNumber: this.userData.IdenNumber.trim(),
      address: this.userData.Addr.trim(),
      email: this.userData.Email.trim(),
      tel: this.userData.Tel.trim()
    };
  }

  isFormValid(): boolean {
    return this.validateForm().isValid;
  }

  hasDataChanged(): boolean {
    if (!this.userData || !this.originalUserData) return false;

    const trimmedData = this.getTrimmedData();

    return trimmedData.firstName !== this.originalUserData.FirstName ||
      trimmedData.lastName !== this.originalUserData.LastName ||
      trimmedData.idenNumber !== this.originalUserData.IdenNumber ||
      trimmedData.address !== this.originalUserData.Addr ||
      trimmedData.email !== this.originalUserData.Email ||
      trimmedData.tel !== this.originalUserData.Tel ||
      this.userData.IdType !== this.originalUserData.IdType;
  }

  formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return dateString;
      }

      return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
      });
    } catch (error) {
      console.warn('Error formatting date:', error);
      return dateString;
    }
  }

  private isValidIDNumber(idNumber: string): boolean {
    if (!this.validationRules.citizenId.test(idNumber)) return false;

    const digits = idNumber.split('').map(Number);
    let sum = 0;

    for (let i = 0; i < 12; i++) {
      sum += digits[i] * (13 - i);
    }

    const checkDigit = (11 - (sum % 11)) % 10;
    return checkDigit === digits[12];
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

    timer(this.SUCCESS_TIMEOUT)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.successMessage = '';
        this.cdr.detectChanges();
      });
  }

  private resetForm(): void {
    this.userData = null;
    this.originalUserData = null;
    this.isLoading = false;
    this.isSaving = false;
    this.loadError = '';
    this.clearMessages();
  }
}