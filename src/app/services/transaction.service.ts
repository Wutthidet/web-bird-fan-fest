import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, Subject, BehaviorSubject, timer } from 'rxjs';
import { catchError, takeUntil, tap, retry, finalize, shareReplay, retryWhen, delay, take, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { environment } from '../environments/environment';

export interface TransactionSeat {
  row: string;
  column: number;
  display: number;
}

export interface UserTransaction {
  transactionId: string;
  totalAmount: number;
  seats: TransactionSeat[];
}

export interface BookingTransactionSeat {
  zone: string;
  row: string;
  column: number;
  display: number | null;
}

export interface BookingTransaction {
  transactionId: string;
  totalAmount: number;
  Status: 1 | 2 | 3;
  TaxInName?: string | null;
  TaxIDNo?: string | null;
  TaxAddress?: string | null;
  TaxMail?: string | null;
  BillURL?: string;
  BackURL1?: string;
  BackURL2?: string;
  seats_data: BookingTransactionSeat[];
}

export interface PayTransactionRequest {
  transactionId: string;
  billUrl: string;
  Tax_need: boolean;
  InName: string;
  Tax_Name: string;
  Tax_Identification_No: string;
  Tax_Address: string;
  Tax_Email: string;
  Notes: string;
}

export interface PayTransactionResponse {
  status: 'success' | 'fail';
  message: string;
  taxInvoiceId?: number;
  ImageUrl?: string;
}

export interface CancelTransactionRequest {
  transactionId: string;
}

export interface CancelTransactionResponse {
  status: 'success' | 'fail';
  message: string;
}

interface CachedTransactions {
  data: UserTransaction[] | BookingTransaction[];
  timestamp: number;
  type: 'user' | 'booking';
}

@Injectable({
  providedIn: 'root'
})
export class TransactionService implements OnDestroy {
  private readonly baseUrl = environment.apiUrl;
  private readonly destroy$ = new Subject<void>();

  private readonly transactionCache = new Map<string, CachedTransactions>();
  private readonly pendingRequests = new Map<string, Observable<any>>();

  private readonly CACHE_DURATION = environment.cacheDuration.transaction;
  private readonly RETRY_COUNT = 3;
  private readonly RETRY_DELAY = 1000;
  private readonly MAX_FILE_SIZE = 16 * 1024 * 1024;
  private readonly ALLOWED_FILE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {
    this.setupCacheCleanup();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.transactionCache.clear();
    this.pendingRequests.clear();
  }

  private setupCacheCleanup(): void {
    timer(0, 30000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.cleanupExpiredCache();
      });
  }

  private cleanupExpiredCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    this.transactionCache.forEach((cached, key) => {
      if (now - cached.timestamp > this.CACHE_DURATION) {
        expiredKeys.push(key);
      }
    });

    expiredKeys.forEach(key => {
      this.transactionCache.delete(key);
      this.pendingRequests.delete(key);
    });
  }

  getUserTransactions(forceRefresh: boolean = false): Observable<UserTransaction[]> {
    const cacheKey = 'user_transactions';
    const cached = this.transactionCache.get(cacheKey);

    if (!forceRefresh && cached && this.isCacheValid(cached.timestamp) && cached.type === 'user') {
      return new Observable(observer => {
        observer.next([...(cached.data as UserTransaction[])]);
        observer.complete();
      });
    }

    if (forceRefresh) {
      this.transactionCache.delete(cacheKey);
      this.pendingRequests.delete(cacheKey);
    }

    const pendingRequest = this.pendingRequests.get(cacheKey);
    if (pendingRequest) {
      return pendingRequest as Observable<UserTransaction[]>;
    }

    const token = this.authService.getToken();
    if (!token) {
      return throwError(() => new Error('Authentication token not found'));
    }

    const headers = this.createHeaders(token);
    const request$ = this.http.get<UserTransaction[]>(`${this.baseUrl}/getUserTransaction`, { headers })
      .pipe(
        tap(transactions => {
          this.transactionCache.set(cacheKey, {
            data: [...transactions],
            timestamp: Date.now(),
            type: 'user'
          });
          this.pendingRequests.delete(cacheKey);
        }),
        retryWhen(errors =>
          errors.pipe(
            delay(this.RETRY_DELAY),
            take(this.RETRY_COUNT)
          )
        ),
        catchError(this.handleError.bind(this)),
        finalize(() => this.pendingRequests.delete(cacheKey)),
        shareReplay(1),
        takeUntil(this.destroy$)
      );

    this.pendingRequests.set(cacheKey, request$);
    return request$;
  }

  getAllUserBookings(forceRefresh: boolean = false): Observable<BookingTransaction[]> {
    const cacheKey = 'user_bookings';
    const cached = this.transactionCache.get(cacheKey);

    if (!forceRefresh && cached && this.isCacheValid(cached.timestamp) && cached.type === 'booking') {
      return new Observable(observer => {
        observer.next([...(cached.data as BookingTransaction[])]);
        observer.complete();
      });
    }

    if (forceRefresh) {
      this.transactionCache.delete(cacheKey);
      this.pendingRequests.delete(cacheKey);
    }

    const pendingRequest = this.pendingRequests.get(cacheKey);
    if (pendingRequest) {
      return pendingRequest as Observable<BookingTransaction[]>;
    }

    const token = this.authService.getToken();
    if (!token) {
      return throwError(() => new Error('Authentication token not found'));
    }

    const headers = this.createHeaders(token);
    const request$ = this.http.get<BookingTransaction[]>(`${this.baseUrl}/getUserTransaction`, { headers })
      .pipe(
        tap(bookings => {
          this.transactionCache.set(cacheKey, {
            data: [...bookings],
            timestamp: Date.now(),
            type: 'booking'
          });
          this.pendingRequests.delete(cacheKey);
        }),
        retryWhen(errors =>
          errors.pipe(
            delay(this.RETRY_DELAY),
            take(this.RETRY_COUNT)
          )
        ),
        catchError(this.handleError.bind(this)),
        finalize(() => this.pendingRequests.delete(cacheKey)),
        shareReplay(1),
        takeUntil(this.destroy$)
      );

    this.pendingRequests.set(cacheKey, request$);
    return request$;
  }

  convertFileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.validateFile(file)) {
        reject(new Error('Invalid file'));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          resolve(reader.result as string);
        } else {
          reject(new Error('Failed to convert file to base64'));
        }
      };
      reader.onerror = () => reject(new Error('Error reading file'));
      reader.readAsDataURL(file);
    });
  }

  payTransaction(request: PayTransactionRequest): Observable<PayTransactionResponse> {
    if (!this.validatePaymentRequest(request)) {
      return throwError(() => new Error('Invalid payment request'));
    }

    const token = this.authService.getToken();
    if (!token) {
      return throwError(() => new Error('Authentication token not found'));
    }

    const headers = this.createHeaders(token);

    return this.http.post<PayTransactionResponse>(`${this.baseUrl}/payUserTransaction`, request, { headers })
      .pipe(
        tap(response => {
          if (response.status === 'success') {
            this.invalidateTransactionCache();
          }
        }),
        retryWhen(errors =>
          errors.pipe(
            tap(error => {
              if (error.status === 409 || error.status === 422) {
                throwError(() => error);
              }
            }),
            delay(this.RETRY_DELAY),
            take(2)
          )
        ),
        catchError(this.handleError.bind(this)),
        takeUntil(this.destroy$)
      );
  }

  cancelTransaction(request: CancelTransactionRequest): Observable<CancelTransactionResponse> {
    if (!request.transactionId || typeof request.transactionId !== 'string' || request.transactionId.trim().length === 0) {
      return throwError(() => new Error('Valid transaction ID is required'));
    }

    const token = this.authService.getToken();
    if (!token) {
      return throwError(() => new Error('Authentication token not found'));
    }

    const headers = this.createHeaders(token);

    return this.http.post<CancelTransactionResponse>(`${this.baseUrl}/cancelUserTransaction`, request, { headers })
      .pipe(
        tap(response => {
          if (response.status === 'success') {
            this.invalidateTransactionCache();
          }
        }),
        retryWhen(errors =>
          errors.pipe(
            delay(this.RETRY_DELAY),
            take(2)
          )
        ),
        catchError(this.handleError.bind(this)),
        takeUntil(this.destroy$)
      );
  }

  invalidateCache(): void {
    this.transactionCache.clear();
    this.pendingRequests.clear();
  }

  invalidateUserTransactions(): void {
    const keys = ['user_transactions'];
    keys.forEach(key => {
      this.transactionCache.delete(key);
      this.pendingRequests.delete(key);
    });
  }

  invalidateUserBookings(): void {
    const keys = ['user_bookings'];
    keys.forEach(key => {
      this.transactionCache.delete(key);
      this.pendingRequests.delete(key);
    });
  }

  getCacheStats(): { size: number; keys: string[]; oldestEntry: number | null } {
    const keys = Array.from(this.transactionCache.keys());
    const timestamps = Array.from(this.transactionCache.values()).map(cached => cached.timestamp);
    const oldestEntry = timestamps.length > 0 ? Math.min(...timestamps) : null;

    return { size: this.transactionCache.size, keys, oldestEntry };
  }

  private createHeaders(token: string): HttpHeaders {
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }

  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < this.CACHE_DURATION;
  }

  private invalidateTransactionCache(): void {
    this.transactionCache.clear();
    this.pendingRequests.clear();
  }

  private validateFile(file: File): boolean {
    if (!file) return false;

    if (file.size > this.MAX_FILE_SIZE) {
      return false;
    }

    if (!this.ALLOWED_FILE_TYPES.includes(file.type)) {
      return false;
    }

    return true;
  }

  private validatePaymentRequest(request: PayTransactionRequest): boolean {
    if (!request?.transactionId ||
      typeof request.transactionId !== 'string' ||
      request.transactionId.trim().length === 0) {
      return false;
    }

    if (!request?.billUrl ||
      typeof request.billUrl !== 'string' ||
      request.billUrl.trim().length === 0) {
      return false;
    }

    if (typeof request.Tax_need !== 'boolean') {
      return false;
    }

    if (request.Tax_need) {
      return !!(
        request?.InName &&
        typeof request.InName === 'string' &&
        request.InName.trim().length > 0 &&
        request?.Tax_Name &&
        typeof request.Tax_Name === 'string' &&
        request.Tax_Name.trim().length > 0 &&
        request?.Tax_Identification_No &&
        typeof request.Tax_Identification_No === 'string' &&
        request.Tax_Identification_No.trim().length > 0 &&
        request?.Tax_Address &&
        typeof request.Tax_Address === 'string' &&
        request.Tax_Address.trim().length > 0 &&
        request?.Tax_Email &&
        typeof request.Tax_Email === 'string' &&
        request.Tax_Email.trim().length > 0 &&
        request?.Notes !== undefined &&
        typeof request.Notes === 'string'
      );
    }

    return true;
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';

    if (error.error instanceof ErrorEvent) {
      errorMessage = `เกิดข้อผิดพลาด: ${error.error.message}`;
    } else {
      switch (error.status) {
        case 401:
          errorMessage = 'ไม่มีสิทธิ์เข้าถึง กรุณาเข้าสู่ระบบใหม่';
          break;
        case 403:
          errorMessage = 'ไม่ได้รับอนุญาตให้เข้าถึงข้อมูลนี้';
          break;
        case 404:
          errorMessage = 'ไม่พบข้อมูลที่ต้องการ';
          break;
        case 409:
          errorMessage = 'ข้อมูลขัดแย้งกับระบบ';
          break;
        case 422:
          errorMessage = 'ข้อมูลที่ส่งไม่ถูกต้อง';
          break;
        case 429:
          errorMessage = 'มีการเรียกใช้บ่อยเกินไป กรุณารอสักครู่';
          break;
        case 500:
          errorMessage = 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์';
          break;
        case 503:
          errorMessage = 'เซิร์ฟเวอร์ไม่พร้อมให้บริการ';
          break;
        default:
          if (error.error?.message) {
            errorMessage = error.error.message;
          } else {
            errorMessage = `เกิดข้อผิดพลาด รหัส: ${error.status}`;
          }
      }
    }

    console.error('Transaction Service Error:', {
      status: error.status,
      message: errorMessage,
      url: error.url,
      timestamp: new Date().toISOString()
    });

    return throwError(() => new Error(errorMessage));
  }
}
