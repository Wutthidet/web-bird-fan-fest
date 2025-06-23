import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, Subject, BehaviorSubject, timer } from 'rxjs';
import { catchError, takeUntil, tap, retry, finalize, shareReplay, retryWhen, delay, take } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { environment } from '../environments/environment';

export interface TransactionSeat {
  row: string;
  column: number;
  display: number;
}

export interface UserTransaction {
  transactionId: number;
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
  transactionId: number;
  totalAmount: number;
  Status: 1 | 2 | 3;
  seats_data: BookingTransactionSeat[];
}

export interface PayTransactionRequest {
  transactionId: number;
  billUrl: string;
}

export interface PayTransactionResponse {
  status: 'success' | 'fail';
  message: string;
}

export interface CancelTransactionRequest {
  transactionId: number;
}

export interface CancelTransactionResponse {
  status: 'success' | 'fail';
  message: string;
}

export interface ImageUploadResponse {
  data: {
    id: string;
    title: string;
    url_viewer: string;
    url: string;
    display_url: string;
    width: string;
    height: string;
    size: string;
    time: string;
    expiration: string;
    image: {
      filename: string;
      name: string;
      mime: string;
      extension: string;
      url: string;
    };
    thumb: {
      filename: string;
      name: string;
      mime: string;
      extension: string;
      url: string;
    };
    medium: {
      filename: string;
      name: string;
      mime: string;
      extension: string;
      url: string;
    };
    delete_url: string;
  };
  success: boolean;
  status: number;
}

interface CachedTransactions {
  data: UserTransaction[] | BookingTransaction[];
  timestamp: number;
  type: 'user' | 'booking';
}

interface UploadProgress {
  transactionId: number;
  progress: number;
  status: 'uploading' | 'success' | 'error';
}

@Injectable({
  providedIn: 'root'
})
export class TransactionService implements OnDestroy {
  private readonly baseUrl = environment.apiUrl;
  private readonly imgbbApiKey = environment.imgbb.apiKey;
  private readonly imgbbUrl = environment.imgbb.apiUrl;
  private readonly destroy$ = new Subject<void>();

  private readonly transactionCache = new Map<string, CachedTransactions>();
  private readonly pendingRequests = new Map<string, Observable<any>>();
  private readonly uploadProgress$ = new BehaviorSubject<Map<number, UploadProgress>>(new Map());

  private readonly CACHE_DURATION = environment.cacheDuration.transaction;
  private readonly MAX_CACHE_SIZE = 10;
  private readonly RETRY_COUNT = 3;
  private readonly RETRY_DELAY = 1000;
  private readonly MAX_FILE_SIZE = 16 * 1024 * 1024;
  private readonly ALLOWED_FILE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];

  public readonly uploadProgress = this.uploadProgress$.asObservable();

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

  uploadImage(imageFile: File): Observable<ImageUploadResponse> {
    if (!this.validateFile(imageFile)) {
      return throwError(() => new Error('Invalid file'));
    }

    const formData = new FormData();
    formData.append('image', imageFile);

    const transactionId = Date.now();
    this.updateUploadProgress(transactionId, 0, 'uploading');

    return this.http.post<ImageUploadResponse>(
      `${this.imgbbUrl}?expiration=600&key=${this.imgbbApiKey}`,
      formData
    ).pipe(
      tap(() => this.updateUploadProgress(transactionId, 100, 'success')),
      retryWhen(errors =>
        errors.pipe(
          tap(() => this.updateUploadProgress(transactionId, 0, 'error')),
          delay(this.RETRY_DELAY),
          take(2)
        )
      ),
      catchError(error => {
        this.updateUploadProgress(transactionId, 0, 'error');
        return this.handleUploadError(error);
      }),
      finalize(() => {
        setTimeout(() => {
          this.removeUploadProgress(transactionId);
        }, 3000);
      }),
      takeUntil(this.destroy$)
    );
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
    if (!request.transactionId || !Number.isInteger(request.transactionId) || request.transactionId <= 0) {
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
    return !!(
      request?.transactionId &&
      Number.isInteger(request.transactionId) &&
      request.transactionId > 0 &&
      request?.billUrl &&
      typeof request.billUrl === 'string' &&
      request.billUrl.trim().length > 0 &&
      this.isValidUrl(request.billUrl)
    );
  }

  private isValidUrl(string: string): boolean {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  private updateUploadProgress(transactionId: number, progress: number, status: 'uploading' | 'success' | 'error'): void {
    const currentProgress = this.uploadProgress$.value;
    const newProgress = new Map(currentProgress);
    newProgress.set(transactionId, { transactionId, progress, status });
    this.uploadProgress$.next(newProgress);
  }

  private removeUploadProgress(transactionId: number): void {
    const currentProgress = this.uploadProgress$.value;
    const newProgress = new Map(currentProgress);
    newProgress.delete(transactionId);
    this.uploadProgress$.next(newProgress);
  }

  private handleUploadError(error: any): Observable<never> {
    let errorMessage = 'ไม่สามารถอัปโหลดไฟล์ได้';

    if (error.error instanceof ErrorEvent) {
      errorMessage = `เกิดข้อผิดพลาด: ${error.error.message}`;
    } else {
      switch (error.status) {
        case 413:
          errorMessage = 'ไฟล์มีขนาดใหญ่เกินไป';
          break;
        case 415:
          errorMessage = 'ประเภทไฟล์ไม่ถูกต้อง';
          break;
        case 429:
          errorMessage = 'มีการอัปโหลดบ่อยเกินไป กรุณารอสักครู่';
          break;
        case 500:
          errorMessage = 'เกิดข้อผิดพลาดในระบบอัปโหลด';
          break;
        default:
          errorMessage = `เกิดข้อผิดพลาดในการอัปโหลด รหัส: ${error.status}`;
      }
    }

    console.error('Upload Error:', {
      status: error.status,
      message: errorMessage,
      timestamp: new Date().toISOString()
    });

    return throwError(() => new Error(errorMessage));
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