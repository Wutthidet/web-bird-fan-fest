import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, Subject, BehaviorSubject, timer } from 'rxjs';
import { catchError, takeUntil, tap, shareReplay, retryWhen, delay, take, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { environment } from '../environments/environment';

export interface ZoneStat {
  ZONE: string;
  Max: number;
  Available: number;
}

export interface EmptySeatsResponse {
  status: 'success' | 'fail';
  zones: ZoneStat[];
}

export interface AdminTransaction {
  transactionId: string;
  userId: number;
  FirstName: string;
  LastName: string;
  Phone: string;
  Email: string;
  Address: string;
  TotalAmount: number;
  BillURL: string | null;
  Status: 1 | 2 | 3;
  CreatedAt: string;
  seats_data: {
    zone: string;
    row: string;
    column: number;
    display: number | null;
  }[];
}

export interface AllTransactionsResponse {
  status: 'success' | 'fail';
  data: AdminTransaction[];
}

export interface ApproveTransactionRequest {
  transactionId: string;
}

export interface ApproveTransactionResponse {
  status: 'success' | 'fail';
  message: string;
}

export interface CancelTransactionRequest {
  transactionId: string;
}

export interface CancelTransactionResponse {
  status: 'success' | 'fail';
  message: string;
}

export interface SeatLog {
  logId: number;
  userId: number;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
  message: string;
  At: string;
  seats_data: {
    level: number;
    zone: string;
    row: string;
    column: number;
  }[];
}

export interface SeatLogsResponse {
  status: 'success' | 'fail';
  data: SeatLog[];
}

interface CachedData<T> {
  data: T;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class AdminService implements OnDestroy {
  private readonly baseUrl = environment.apiUrl;
  private readonly destroy$ = new Subject<void>();

  private readonly emptySeatsCache = new BehaviorSubject<CachedData<ZoneStat[]> | null>(null);
  private readonly transactionsCache = new BehaviorSubject<CachedData<AdminTransaction[]> | null>(null);
  private readonly seatLogsCache = new BehaviorSubject<CachedData<SeatLog[]> | null>(null);

  private readonly CACHE_DURATION = 30 * 1000;
  private readonly RETRY_COUNT = 3;
  private readonly RETRY_DELAY = 1000;

  public readonly emptySeats$ = this.emptySeatsCache.asObservable();
  public readonly transactions$ = this.transactionsCache.asObservable();
  public readonly seatLogs$ = this.seatLogsCache.asObservable();

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {
    this.setupAutoRefresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupAutoRefresh(): void {
    timer(0, 30000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.authService.isAdmin()) {
          this.refreshEmptySeats();
          this.refreshTransactions();
          this.refreshSeatLogs();
        }
      });
  }

  getEmptySeats(forceRefresh: boolean = false): Observable<EmptySeatsResponse> {
    const cached = this.emptySeatsCache.value;

    if (!forceRefresh && cached && this.isCacheValid(cached.timestamp)) {
      return new Observable(observer => {
        observer.next({ status: 'success', zones: cached.data });
        observer.complete();
      });
    }

    const token = this.authService.getToken();
    if (!token) {
      return throwError(() => new Error('No authentication token found'));
    }

    if (!this.authService.isAdmin()) {
      return throwError(() => new Error('Admin access required'));
    }

    const headers = this.createHeaders(token);

    return this.http.get<EmptySeatsResponse>(`${this.baseUrl}/getEmptySeats`, { headers })
      .pipe(
        tap(response => {
          if (response.status === 'success') {
            this.emptySeatsCache.next({
              data: response.zones,
              timestamp: Date.now()
            });
          }
        }),
        retryWhen(errors =>
          errors.pipe(
            delay(this.RETRY_DELAY),
            take(this.RETRY_COUNT)
          )
        ),
        catchError(this.handleError.bind(this)),
        shareReplay(1),
        takeUntil(this.destroy$)
      );
  }

  getAllTransactions(forceRefresh: boolean = false): Observable<AllTransactionsResponse> {
    const cached = this.transactionsCache.value;

    if (!forceRefresh && cached && this.isCacheValid(cached.timestamp)) {
      return new Observable(observer => {
        observer.next({ status: 'success', data: cached.data });
        observer.complete();
      });
    }

    const token = this.authService.getToken();
    if (!token) {
      return throwError(() => new Error('No authentication token found'));
    }

    if (!this.authService.isAdmin()) {
      return throwError(() => new Error('Admin access required'));
    }

    const headers = this.createHeaders(token);

    return this.http.get<AllTransactionsResponse>(`${this.baseUrl}/getAllTransactions`, { headers })
      .pipe(
        tap(response => {
          if (response.status === 'success') {
            this.transactionsCache.next({
              data: response.data,
              timestamp: Date.now()
            });
          }
        }),
        retryWhen(errors =>
          errors.pipe(
            delay(this.RETRY_DELAY),
            take(this.RETRY_COUNT)
          )
        ),
        catchError(this.handleError.bind(this)),
        shareReplay(1),
        takeUntil(this.destroy$)
      );
  }

  getSeatLogs(forceRefresh: boolean = false): Observable<SeatLogsResponse> {
    const cached = this.seatLogsCache.value;

    if (!forceRefresh && cached && this.isCacheValid(cached.timestamp)) {
      return new Observable(observer => {
        observer.next({ status: 'success', data: cached.data });
        observer.complete();
      });
    }

    const token = this.authService.getToken();
    if (!token) {
      return throwError(() => new Error('No authentication token found'));
    }

    if (!this.authService.isAdmin()) {
      return throwError(() => new Error('Admin access required'));
    }

    const headers = this.createHeaders(token);

    return this.http.get<SeatLogsResponse>(`${this.baseUrl}/getLogSeats`, { headers })
      .pipe(
        tap(response => {
          if (response.status === 'success') {
            this.seatLogsCache.next({
              data: response.data,
              timestamp: Date.now()
            });
          }
        }),
        retryWhen(errors =>
          errors.pipe(
            delay(this.RETRY_DELAY),
            take(this.RETRY_COUNT)
          )
        ),
        catchError(this.handleError.bind(this)),
        shareReplay(1),
        takeUntil(this.destroy$)
      );
  }

  approveTransaction(request: ApproveTransactionRequest): Observable<ApproveTransactionResponse> {
    const token = this.authService.getToken();
    if (!token) {
      return throwError(() => new Error('No authentication token found'));
    }

    if (!this.authService.isAdmin()) {
      return throwError(() => new Error('Admin access required'));
    }

    const headers = this.createHeaders(token);

    return this.http.post<ApproveTransactionResponse>(`${this.baseUrl}/approveTransaction`, request, { headers })
      .pipe(
        tap(response => {
          if (response.status === 'success') {
            this.invalidateCache();
          }
        }),
        retryWhen(errors =>
          errors.pipe(
            tap(error => {
              if (error.status === 400 || error.status === 422) {
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
    const token = this.authService.getToken();
    if (!token) {
      return throwError(() => new Error('No authentication token found'));
    }

    if (!this.authService.isAdmin()) {
      return throwError(() => new Error('Admin access required'));
    }

    const headers = this.createHeaders(token);

    return this.http.post<CancelTransactionResponse>(`${this.baseUrl}/cancelUserTransaction`, request, { headers })
      .pipe(
        tap(response => {
          if (response.status === 'success') {
            this.invalidateCache();
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

  getTransactionsByStatus(status: 1 | 2 | 3): Observable<AdminTransaction[]> {
    return this.getAllTransactions().pipe(
      map(response => {
        return response.data.filter(t => t.Status === status);
      }),
      takeUntil(this.destroy$)
    );
  }

  invalidateCache(): void {
    this.emptySeatsCache.next(null);
    this.transactionsCache.next(null);
    this.seatLogsCache.next(null);
  }

  refreshEmptySeats(): void {
    this.getEmptySeats(true).subscribe({
      error: (error) => console.warn('Failed to refresh empty seats:', error)
    });
  }

  refreshTransactions(): void {
    this.getAllTransactions(true).subscribe({
      error: (error) => console.warn('Failed to refresh transactions:', error)
    });
  }

  refreshSeatLogs(): void {
    this.getSeatLogs(true).subscribe({
      error: (error) => console.warn('Failed to refresh seat logs:', error)
    });
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

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';

    if (error.error instanceof ErrorEvent) {
      errorMessage = `เกิดข้อผิดพลาด: ${error.error.message}`;
    } else {
      switch (error.status) {
        case 401:
          errorMessage = 'ไม่มีสิทธิ์เข้าถึง กรุณาเข้าสู่ระบบใหม่';
          this.authService.logout();
          break;
        case 403:
          errorMessage = 'ไม่ได้รับอนุญาตให้เข้าถึงข้อมูลนี้ (ต้องเป็น Admin)';
          break;
        case 404:
          errorMessage = 'ไม่พบข้อมูลที่ต้องการ';
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

    console.error('Admin Service Error:', {
      status: error.status,
      message: errorMessage,
      url: error.url,
      timestamp: new Date().toISOString()
    });

    return throwError(() => new Error(errorMessage));
  }
}