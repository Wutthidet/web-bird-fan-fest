import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError, Subject, timer } from 'rxjs';
import { retry, catchError, tap, takeUntil, shareReplay } from 'rxjs/operators';
import { environment } from '../environments/environment';

interface RegisterRequest {
  FirstName: string;
  LastName: string;
  IdenNumber: string;
  Email: string;
  Tel: string;
  Way: 'Email' | 'Phone';
  IdType?: 'citizen' | 'passport';
}

interface RegisterResponse {
  status: string;
  message: string;
}

interface RegisterConfirmRequest {
  FirstName: string;
  LastName: string;
  IdenNumber: string;
  Addr: string;
  Email: string;
  Tel: string;
  Way: 'Email' | 'Phone';
  IdType?: 'citizen' | 'passport';
  otp: string;
}

interface RegisterConfirmResponse {
  status: string;
  message: string;
  token: string;
}

interface LoginResponse {
  status: string;
  message: string;
}

interface LoginConfirmResponse {
  status: string;
  message: string;
  token: string;
}

interface User {
  email: string;
  token: string;
  isAdmin: boolean;
}

interface UserData {
  ID: number;
  FirstName: string;
  LastName: string;
  IdenNumber: string;
  Addr: string;
  Email: string;
  Tel: string;
  IdType?: 'citizen' | 'passport';
  CreatedAt: string;
}

interface GetUserResponse {
  status: string;
  data: UserData;
}

interface UpdateUserRequest {
  ID: number;
  FirstName: string;
  LastName: string;
  Addr: string;
  IdenNumber: string;
  Email: string;
  Tel: string;
  IdType?: 'citizen' | 'passport';
}

interface UpdateUserResponse {
  status: string;
  message: string;
}

interface CachedUserData {
  data: UserData;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService implements OnDestroy {
  private readonly baseUrl = environment.apiUrl;
  private readonly destroy$ = new Subject<void>();
  private readonly userSubject = new BehaviorSubject<User | null>(null);
  private readonly userDataCache = new Map<string, CachedUserData>();
  private readonly CACHE_DURATION = 5 * 60 * 1000;
  private readonly RETRY_COUNT = 2;
  private readonly RETRY_DELAY = 1000;

  public readonly user$ = this.userSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadUserFromStorage();
    this.setupTokenValidation();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.userDataCache.clear();
  }

  private setupTokenValidation(): void {
    timer(0, 60000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.isLoggedIn()) {
          this.validateToken();
        }
      });
  }

  private validateToken(): void {
    const user = this.getCurrentUser();
    if (!user?.token) {
      this.logout();
      return;
    }

    try {
      const payload = JSON.parse(atob(user.token.split('.')[1]));
      const currentTime = Math.floor(Date.now() / 1000);

      if (payload.exp && payload.exp < currentTime) {
        this.logout();
      }
    } catch (error) {
      console.warn('Invalid token format');
      this.logout();
    }
  }

  registerUser(registerData: RegisterRequest): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(`${this.baseUrl}/registerUser`, registerData)
      .pipe(
        retry({
          count: this.RETRY_COUNT,
          delay: this.RETRY_DELAY
        }),
        catchError(this.handleError.bind(this)),
        takeUntil(this.destroy$)
      );
  }

  registerConfirm(confirmData: RegisterConfirmRequest): Observable<RegisterConfirmResponse> {
    return this.http.post<RegisterConfirmResponse>(`${this.baseUrl}/registerConfirm`, confirmData)
      .pipe(
        tap(response => {
          if (response.status === 'success' && response.token) {
            const contact = confirmData.Way === 'Email' ? confirmData.Email : confirmData.Tel;
            this.setUser(contact, response.token);
          }
        }),
        retry({
          count: this.RETRY_COUNT,
          delay: this.RETRY_DELAY
        }),
        catchError(this.handleError.bind(this)),
        takeUntil(this.destroy$)
      );
  }

  loginUser(contact: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.baseUrl}/loginUser`, { Contact: contact })
      .pipe(
        retry({
          count: this.RETRY_COUNT,
          delay: this.RETRY_DELAY
        }),
        catchError(this.handleError.bind(this)),
        takeUntil(this.destroy$)
      );
  }

  loginConfirm(contact: string, otp: string): Observable<LoginConfirmResponse> {
    return this.http.post<LoginConfirmResponse>(`${this.baseUrl}/loginConfirm`, {
      Contact: contact,
      otp: otp
    })
      .pipe(
        tap(response => {
          if (response.status === 'success' && response.token) {
            this.setUser(contact, response.token);
          }
        }),
        retry({
          count: this.RETRY_COUNT,
          delay: this.RETRY_DELAY
        }),
        catchError(this.handleError.bind(this)),
        takeUntil(this.destroy$)
      );
  }

  getUser(): Observable<GetUserResponse> {
    const token = this.getToken();
    if (!token) {
      return throwError(() => new Error('No authentication token found'));
    }

    const cacheKey = token;
    const cached = this.userDataCache.get(cacheKey);

    if (cached && this.isCacheValid(cached.timestamp)) {
      return new Observable(observer => {
        observer.next({ status: 'success', data: cached.data });
        observer.complete();
      });
    }

    const headers = this.createAuthHeaders(token);

    return this.http.get<GetUserResponse>(`${this.baseUrl}/getUser`, { headers })
      .pipe(
        tap(response => {
          if (response.status === 'success') {
            const userData = {
              ...response.data,
              IdType: response.data.IdType || 'citizen' as 'citizen' | 'passport'
            };
            this.userDataCache.set(cacheKey, {
              data: userData,
              timestamp: Date.now()
            });
          }
        }),
        retry({
          count: this.RETRY_COUNT,
          delay: this.RETRY_DELAY
        }),
        catchError(this.handleError.bind(this)),
        shareReplay(1),
        takeUntil(this.destroy$)
      );
  }

  updateUser(userData: UpdateUserRequest): Observable<UpdateUserResponse> {
    const token = this.getToken();
    if (!token) {
      return throwError(() => new Error('No authentication token found'));
    }

    const headers = this.createAuthHeaders(token);

    return this.http.post<UpdateUserResponse>(`${this.baseUrl}/updateUser`, userData, { headers })
      .pipe(
        tap(response => {
          if (response.status === 'success') {
            this.invalidateUserCache();
          }
        }),
        retry({
          count: this.RETRY_COUNT,
          delay: this.RETRY_DELAY
        }),
        catchError(this.handleError.bind(this)),
        takeUntil(this.destroy$)
      );
  }

  setUser(contact: string, token: string, isAdmin: boolean = false): void {
    if (!this.isValidToken(token)) {
      console.error('Invalid token provided');
      return;
    }

    const user: User = { email: contact, token, isAdmin };

    try {
      localStorage.setItem('user', JSON.stringify(user));
      this.userSubject.next(user);
      this.invalidateUserCache();
    } catch (error) {
      console.error('Failed to save user to localStorage:', error);
    }
  }

  getCurrentUser(): User | null {
    return this.userSubject.value;
  }

  isLoggedIn(): boolean {
    const user = this.userSubject.value;
    return !!(user?.token && this.isValidToken(user.token));
  }

  isAdmin(): boolean {
    const user = this.getCurrentUser();
    return user?.isAdmin || false;
  }

  logout(): void {
    try {
      localStorage.removeItem('user');
    } catch (error) {
      console.error('Failed to remove user from localStorage:', error);
    }

    this.userSubject.next(null);
    this.invalidateUserCache();
  }

  getToken(): string | null {
    const user = this.getCurrentUser();
    return user?.token || null;
  }

  private loadUserFromStorage(): void {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (this.isValidUserObject(user) && this.isValidToken(user.token)) {
          this.userSubject.next(user);
        } else {
          this.logout();
        }
      }
    } catch (error) {
      console.error('Failed to load user from localStorage:', error);
      this.logout();
    }
  }

  private createAuthHeaders(token: string): HttpHeaders {
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }

  private isValidToken(token: string): boolean {
    if (!token || typeof token !== 'string') return false;

    try {
      const parts = token.split('.');
      if (parts.length !== 3) return false;

      const payload = JSON.parse(atob(parts[1]));
      const currentTime = Math.floor(Date.now() / 1000);

      return !payload.exp || payload.exp > currentTime;
    } catch (error) {
      return false;
    }
  }

  private isValidUserObject(user: any): boolean {
    return user &&
           typeof user === 'object' &&
           typeof user.email === 'string' &&
           typeof user.token === 'string' &&
           typeof user.isAdmin === 'boolean' &&
           user.email.length > 0 &&
           user.token.length > 0;
  }

  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < this.CACHE_DURATION;
  }

  private invalidateUserCache(): void {
    this.userDataCache.clear();
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';

    if (error.error instanceof ErrorEvent) {
      errorMessage = `เกิดข้อผิดพลาด: ${error.error.message}`;
    } else {
      switch (error.status) {
        case 401:
          errorMessage = 'ไม่มีสิทธิ์เข้าถึง กรุณาเข้าสู่ระบบใหม่';
          this.logout();
          break;
        case 403:
          errorMessage = 'ไม่ได้รับอนุญาตให้เข้าถึงข้อมูลนี้';
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

    console.error('Auth Service Error:', {
      status: error.status,
      message: errorMessage,
      url: error.url,
      timestamp: new Date().toISOString()
    });

    return throwError(() => new Error(errorMessage));
  }
}