import { Component, ViewChild, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { LoginComponent } from '../login/login.component';
import { UserProfilePopupComponent } from '../user-profile/user-profile.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, LoginComponent, UserProfilePopupComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent implements OnInit {
  @ViewChild(LoginComponent) loginComponent!: LoginComponent;
  @ViewChild(UserProfilePopupComponent) profileComponent!: UserProfilePopupComponent;

  currentUser: any = null;

  constructor(
    public authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    this.authService.user$.subscribe(user => {
      this.currentUser = user;
    });
  }

  toggleMenu() {
  }

  closeMenu() {
  }

  showLogin() {
    this.loginComponent.show();
  }

  showProfile() {
    if (this.authService.isLoggedIn()) {
      this.profileComponent.show();
    }
  }

  goHome() {
    this.router.navigate(['/home']);
  }

  goToAdmin() {
    if (this.authService.isAdmin()) {
      this.router.navigate(['/admin/dashboard']);
    }
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/home']);
  }

  getUserDisplayName(): string {
    if (this.currentUser?.email) {
      return this.currentUser.email.split('@')[0];
    }
    return '';
  }
}