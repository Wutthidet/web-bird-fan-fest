import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
    id: string;
    type: ToastType;
    title: string;
    message: string;
    duration: number;
    timestamp: number;
}

@Injectable({
    providedIn: 'root'
})
export class ToastService {
    private toastsSubject = new BehaviorSubject<ToastMessage[]>([]);
    public toasts$ = this.toastsSubject.asObservable();

    private generateId(): string {
        return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    }

    private addToast(type: ToastType, title: string, message: string, duration: number = 10000) {
        const toast: ToastMessage = {
            id: this.generateId(),
            type,
            title,
            message,
            duration,
            timestamp: Date.now()
        };

        const currentToasts = this.toastsSubject.value;
        this.toastsSubject.next([...currentToasts, toast]);

        if (duration > 0) {
            setTimeout(() => {
                this.removeToast(toast.id);
            }, duration);
        }
    }

    success(title: string, message?: string, duration: number = 10000) {
        this.addToast('success', title, message || '', duration);
    }

    error(title: string, message?: string, duration: number = 10000) {
        this.addToast('error', title, message || '', duration);
    }

    warning(title: string, message?: string, duration: number = 10000) {
        this.addToast('warning', title, message || '', duration);
    }

    info(title: string, message?: string, duration: number = 10000) {
        this.addToast('info', title, message || '', duration);
    }

    removeToast(id: string) {
        const currentToasts = this.toastsSubject.value;
        const filteredToasts = currentToasts.filter(toast => toast.id !== id);
        this.toastsSubject.next(filteredToasts);
    }

    clearAll() {
        this.toastsSubject.next([]);
    }
}