import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError, Subject, BehaviorSubject, timer } from 'rxjs';
import { catchError, map, retry, takeUntil, tap, shareReplay, finalize, retryWhen, delay, take } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { environment } from '../environments/environment';

export interface Seat {
  ID: number;
  LEVEL: number;
  ZONE: string;
  PRICE: number;
  ROW: string;
  COLUMN: number;
  DISPLAY: number | null;
  VISIBLE: 'T' | 'F';
  STATUS: 0 | 1 | 2;
  UPDATED_AT: string | null;
}

export interface BookSeatsRequest {
  booking: string;
}

export interface BookSeatsResponse {
  status: 'success' | 'fail';
  message: string;
  transactionId?: number;
  seats_data?: Array<{
    id: number;
    row: string;
    column: number;
    display: string | null;
  }>;
}

interface CachedSeats {
  seats: Seat[];
  timestamp: number;
  zone: string;
}

interface RequestConfig {
  retryCount: number;
  retryDelay: number;
  timeout: number;
}

@Injectable({
  providedIn: 'root'
})
export class SeatService implements OnDestroy {
  private readonly baseUrl = environment.apiUrl;
  private readonly destroy$ = new Subject<void>();
  private readonly seatCache = new Map<string, CachedSeats>();
  private readonly pendingRequests = new Map<string, Observable<Seat[]>>();

  private readonly CACHE_DURATION = environment.cacheDuration.seat;
  private readonly MAX_CACHE_SIZE = 50;
  private readonly DEFAULT_CONFIG: RequestConfig = {
    retryCount: 3,
    retryDelay: 1000,
    timeout: 10000
  };

  private readonly loadingStates$ = new BehaviorSubject<Map<string, boolean>>(new Map());

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {
    this.setupCacheCleanup();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.seatCache.clear();
    this.pendingRequests.clear();
  }

  private setupCacheCleanup(): void {
    timer(0, 60000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.cleanupExpiredCache();
      });
  }

  private cleanupExpiredCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    this.seatCache.forEach((cached, key) => {
      if (now - cached.timestamp > this.CACHE_DURATION) {
        expiredKeys.push(key);
      }
    });

    expiredKeys.forEach(key => this.seatCache.delete(key));

    if (this.seatCache.size > this.MAX_CACHE_SIZE) {
      const sortedEntries = Array.from(this.seatCache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp);

      const toRemove = sortedEntries.slice(0, this.seatCache.size - this.MAX_CACHE_SIZE);
      toRemove.forEach(([key]) => this.seatCache.delete(key));
    }
  }

  getSeats(zone: string): Observable<Seat[]> {
    if (!zone?.trim()) {
      return throwError(() => new Error('Zone parameter is required'));
    }

    const normalizedZone = zone.trim().toUpperCase();
    const cacheKey = `seats_${normalizedZone}`;

    const cached = this.seatCache.get(cacheKey);
    if (cached && this.isCacheValid(cached.timestamp)) {
      return new Observable(observer => {
        observer.next([...cached.seats]);
        observer.complete();
      });
    }

    const pendingRequest = this.pendingRequests.get(cacheKey);
    if (pendingRequest) {
      return pendingRequest;
    }

    const token = this.authService.getToken();
    if (!token) {
      return throwError(() => new Error('Authentication token not found. Please log in.'));
    }

    this.setLoadingState(normalizedZone, true);

    const headers = this.createHeaders(token);
    const request$ = this.http.post<any[]>(`${this.baseUrl}/getSeats`, { ZONE: normalizedZone }, { headers })
      .pipe(
        map(rows => this.transformSeatsData(rows)),
        tap(seats => {
          this.seatCache.set(cacheKey, {
            seats: [...seats],
            timestamp: Date.now(),
            zone: normalizedZone
          });
          this.pendingRequests.delete(cacheKey);
        }),
        retryWhen(errors =>
          errors.pipe(
            tap(error => console.warn(`Retrying seats request for zone ${normalizedZone}:`, error)),
            delay(this.DEFAULT_CONFIG.retryDelay),
            take(this.DEFAULT_CONFIG.retryCount)
          )
        ),
        catchError(error => this.handleSeatsError(error, normalizedZone)),
        finalize(() => {
          this.setLoadingState(normalizedZone, false);
          this.pendingRequests.delete(cacheKey);
        }),
        shareReplay(1),
        takeUntil(this.destroy$)
      );

    this.pendingRequests.set(cacheKey, request$);
    return request$;
  }

  bookSeats(seatIds: number[]): Observable<BookSeatsResponse> {
    if (!Array.isArray(seatIds) || seatIds.length === 0) {
      return throwError(() => new Error('At least one seat ID is required'));
    }

    if (seatIds.some(id => !Number.isInteger(id) || id <= 0)) {
      return throwError(() => new Error('All seat IDs must be positive integers'));
    }

    const token = this.authService.getToken();
    if (!token) {
      return throwError(() => new Error('Authentication token not found. Please log in.'));
    }

    const headers = this.createHeaders(token);
    const booking = seatIds.join('|') + '|';
    const requestBody: BookSeatsRequest = { booking };

    return this.http.post<BookSeatsResponse>(`${this.baseUrl}/bookSeats`, requestBody, { headers })
      .pipe(
        tap(response => {
          if (response.status === 'success') {
            this.invalidateRelevantCache();
          }
        }),
        retryWhen(errors =>
          errors.pipe(
            tap(error => {
              if (error.status === 409 || error.status === 422) {
                throwError(() => error);
              }
            }),
            delay(this.DEFAULT_CONFIG.retryDelay),
            take(2)
          )
        ),
        catchError(this.handleBookingError.bind(this)),
        takeUntil(this.destroy$)
      );
  }

  getSeatStatusText(status: 0 | 1 | 2): string {
    switch (status) {
      case 0: return 'ว่าง';
      case 1: return 'จอง';
      case 2: return 'ชำระเงินสำเร็จ';
      default: return 'ไม่ทราบสถานะ';
    }
  }

  getSeatStatusClass(status: 0 | 1 | 2): string {
    switch (status) {
      case 0: return 'available';
      case 1: return 'reserved';
      case 2: return 'paid';
      default: return '';
    }
  }

  isLoading(zone: string): Observable<boolean> {
    return this.loadingStates$.pipe(
      map(states => states.get(zone.toUpperCase()) || false)
    );
  }

  invalidateCache(zone?: string): void {
    if (zone) {
      const cacheKey = `seats_${zone.trim().toUpperCase()}`;
      this.seatCache.delete(cacheKey);
    } else {
      this.seatCache.clear();
    }
  }

  getCacheStats(): { size: number; zones: string[]; oldestEntry: number | null } {
    const zones = Array.from(this.seatCache.keys()).map(key => key.replace('seats_', ''));
    const timestamps = Array.from(this.seatCache.values()).map(cached => cached.timestamp);
    const oldestEntry = timestamps.length > 0 ? Math.min(...timestamps) : null;

    return {
      size: this.seatCache.size,
      zones,
      oldestEntry
    };
  }

  private transformSeatsData(rows: any[]): Seat[] {
    return rows.map(row => ({
      ...row,
      STATUS: Number(row.STATUS) as 0 | 1 | 2,
      COLUMN: Number(row.COLUMN),
      PRICE: Number(row.PRICE),
      DISPLAY: row.DISPLAY !== null && !isNaN(Number(row.DISPLAY)) ? Number(row.DISPLAY) : null,
      VISIBLE: row.VISIBLE === 'T' || row.VISIBLE === 'F' ? row.VISIBLE : 'F'
    } as Seat));
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

  private setLoadingState(zone: string, isLoading: boolean): void {
    const currentStates = this.loadingStates$.value;
    const newStates = new Map(currentStates);

    if (isLoading) {
      newStates.set(zone, true);
    } else {
      newStates.delete(zone);
    }

    this.loadingStates$.next(newStates);
  }

  private invalidateRelevantCache(): void {
    const keysToInvalidate: string[] = [];

    this.seatCache.forEach((_, key) => {
      keysToInvalidate.push(key);
    });

    keysToInvalidate.forEach(key => this.seatCache.delete(key));
  }

  private handleSeatsError(error: HttpErrorResponse, zone: string): Observable<never> {
    this.seatCache.delete(`seats_${zone}`);

    let errorMessage = 'ไม่สามารถโหลดข้อมูลที่นั่งได้';

    if (error.error instanceof ErrorEvent) {
      errorMessage = `เกิดข้อผิดพลาด: ${error.error.message}`;
    } else {
      switch (error.status) {
        case 401:
          errorMessage = 'ไม่มีสิทธิ์เข้าถึง กรุณาเข้าสู่ระบบใหม่';
          break;
        case 403:
          errorMessage = 'ไม่ได้รับอนุญาตให้ดูข้อมูลโซนนี้';
          break;
        case 404:
          errorMessage = `ไม่พบข้อมูลที่นั่งสำหรับโซน ${zone}`;
          break;
        case 422:
          errorMessage = 'ข้อมูลโซนไม่ถูกต้อง';
          break;
        case 429:
          errorMessage = 'มีการเรียกข้อมูลบ่อยเกินไป กรุณารอสักครู่';
          break;
        case 500:
          errorMessage = 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์';
          break;
        case 503:
          errorMessage = 'เซิร์ฟเวอร์ไม่พร้อมให้บริการ';
          break;
        default:
          errorMessage = `เกิดข้อผิดพลาด รหัส: ${error.status}`;
      }
    }

    console.error('Seat Service Error:', {
      zone,
      status: error.status,
      message: errorMessage,
      url: error.url,
      timestamp: new Date().toISOString()
    });

    return throwError(() => new Error(errorMessage));
  }

  private handleBookingError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'ไม่สามารถจองที่นั่งได้';

    if (error.error instanceof ErrorEvent) {
      errorMessage = `เกิดข้อผิดพลาด: ${error.error.message}`;
    } else {
      switch (error.status) {
        case 401:
          errorMessage = 'ไม่มีสิทธิ์เข้าถึง กรุณาเข้าสู่ระบบใหม่';
          break;
        case 403:
          errorMessage = 'ไม่ได้รับอนุญาตให้จองที่นั่ง';
          break;
        case 409:
          errorMessage = 'ที่นั่งถูกจองไปแล้ว';
          break;
        case 422:
          errorMessage = 'ข้อมูลการจองไม่ถูกต้อง';
          break;
        case 429:
          errorMessage = 'มีการจองบ่อยเกินไป กรุณารอสักครู่';
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

    console.error('Booking Error:', {
      status: error.status,
      message: errorMessage,
      url: error.url,
      timestamp: new Date().toISOString()
    });

    return throwError(() => new Error(errorMessage));
  }
}